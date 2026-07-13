import { timestampDate } from "@bufbuild/protobuf/wkt";
import { useEffect, useState } from "react";
import type { Memo, Visibility } from "@/types/proto/api/v1/memo_service_pb";
import type { EditorRefActions } from "../Editor";
import { cacheService, memoService } from "../services";
import { useEditorContext } from "../state";

export interface PendingMemoDraft {
  content: string;
  savedAt?: string;
  baseUpdateTime?: string;
  hasServerChanges: boolean;
}

interface UseMemoInitOptions {
  editorRef: React.RefObject<EditorRefActions | null>;
  memo?: Memo;
  cacheKey?: string;
  username: string;
  autoFocus?: boolean;
  defaultVisibility?: Visibility;
  defaultCreateTime?: Date;
}

export const useMemoInit = ({
  editorRef,
  memo,
  cacheKey,
  username,
  autoFocus,
  defaultVisibility,
  defaultCreateTime,
}: UseMemoInitOptions) => {
  const { actions, dispatch } = useEditorContext();
  const identity = `${username}\u0000${cacheKey ?? ""}\u0000${memo?.name ?? "create"}`;
  const currentServerUpdateTime = memo?.updateTime ? timestampDate(memo.updateTime).toISOString() : undefined;
  const [initializedIdentity, setInitializedIdentity] = useState<string | null>(null);
  const [pendingDraft, setPendingDraft] = useState<PendingMemoDraft | null>(null);
  const [draftBaseUpdateTime, setDraftBaseUpdateTime] = useState<string | undefined>(undefined);
  const isInitialized = Boolean(username) && initializedIdentity === identity;

  useEffect(() => {
    if (!username) return;
    if (initializedIdentity === identity) return;

    const key = cacheService.key(username, cacheKey);
    setPendingDraft(null);
    setDraftBaseUpdateTime(undefined);

    if (memo) {
      const initialState = memoService.fromMemo(memo);
      dispatch(actions.initMemo(initialState));
      setDraftBaseUpdateTime(currentServerUpdateTime);

      const cachedDraft = cacheService.loadDraft(key);
      const belongsToMemo = cachedDraft?.mode === "edit" && cachedDraft.memoName === memo.name;
      if (cachedDraft && belongsToMemo && cachedDraft.content !== initialState.content) {
        setDraftBaseUpdateTime(cachedDraft.baseUpdateTime);
        setPendingDraft({
          content: cachedDraft.content,
          savedAt: cachedDraft.savedAt,
          baseUpdateTime: cachedDraft.baseUpdateTime,
          hasServerChanges: cachedDraft.baseUpdateTime !== currentServerUpdateTime,
        });
      } else if (cachedDraft) {
        cacheService.clear(key);
      }
    } else {
      dispatch(actions.reset());
      const cachedContent = cacheService.load(key);
      if (cachedContent) {
        dispatch(actions.updateContent(cachedContent));
      }
      if (defaultVisibility !== undefined) {
        dispatch(actions.setMetadata({ visibility: defaultVisibility }));
      }
      if (defaultCreateTime) {
        dispatch(actions.setTimestamps({ createTime: defaultCreateTime, updateTime: defaultCreateTime }));
      }
    }

    if (autoFocus) {
      setTimeout(() => editorRef.current?.focus(), 100);
    }

    setInitializedIdentity(identity);
  }, [
    identity,
    initializedIdentity,
    memo,
    cacheKey,
    username,
    currentServerUpdateTime,
    autoFocus,
    defaultVisibility,
    defaultCreateTime,
    actions,
    dispatch,
    editorRef,
  ]);

  const restorePendingDraft = () => {
    if (!pendingDraft) return;
    dispatch(actions.updateContent(pendingDraft.content));
    setPendingDraft(null);
  };

  const discardPendingDraft = () => {
    cacheService.clear(cacheService.key(username, cacheKey));
    setDraftBaseUpdateTime(currentServerUpdateTime);
    setPendingDraft(null);
  };

  return { isInitialized, pendingDraft, draftBaseUpdateTime, restorePendingDraft, discardPendingDraft };
};
