import { useCallback, useEffect, useRef } from "react";
import { cacheService, type MemoEditorDraftMetadata } from "../services";

interface UseAutoSaveOptions extends MemoEditorDraftMetadata {
  enabled?: boolean;
  baselineContent?: string;
}

export const useAutoSave = (
  content: string,
  username: string,
  cacheKey: string | undefined,
  {
    enabled = true,
    baselineContent = "",
    mode = "create",
    memoName,
    baseUpdateTime,
    requestId,
    pending,
    attemptedAt,
  }: UseAutoSaveOptions = {},
) => {
  const latestContentRef = useRef(content);
  const discardedContentRef = useRef<string | undefined>(undefined);
  const latestDeliveryMetadataRef = useRef({ requestId, pending, attemptedAt });
  latestDeliveryMetadataRef.current = { requestId, pending, attemptedAt };

  useEffect(() => {
    latestContentRef.current = content;
    if (discardedContentRef.current !== undefined && discardedContentRef.current !== content) {
      discardedContentRef.current = undefined;
    }
  }, [content]);

  useEffect(() => {
    if (!enabled) return;

    const key = cacheService.key(username, cacheKey);
    if (content === baselineContent && !pending) {
      cacheService.clear(key);
      return;
    }

    cacheService.save(key, content, { mode, memoName, baseUpdateTime, requestId, pending, attemptedAt });
  }, [content, username, cacheKey, enabled, baselineContent, mode, memoName, baseUpdateTime, requestId, pending, attemptedAt]);

  useEffect(() => {
    if (!enabled) return;

    const key = cacheService.key(username, cacheKey);
    const flushDraft = () => {
      if (discardedContentRef.current === latestContentRef.current) {
        return;
      }

      if (latestContentRef.current === baselineContent && !latestDeliveryMetadataRef.current.pending) {
        cacheService.clear(key);
        return;
      }

      cacheService.saveNow(key, latestContentRef.current, {
        mode,
        memoName,
        baseUpdateTime,
        ...latestDeliveryMetadataRef.current,
      });
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        flushDraft();
      }
    };

    window.addEventListener("pagehide", flushDraft);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      // Flush on unmount (e.g. editor closes) to ensure the draft is persisted
      // before the component is torn down — distinct from the visibility flush above.
      flushDraft();
      window.removeEventListener("pagehide", flushDraft);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [username, cacheKey, enabled, baselineContent, mode, memoName, baseUpdateTime]);

  const discardDraft = useCallback(() => {
    const key = cacheService.key(username, cacheKey);
    discardedContentRef.current = latestContentRef.current;
    cacheService.clear(key);
  }, [username, cacheKey]);

  return { discardDraft };
};
