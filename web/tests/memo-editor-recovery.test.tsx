import { create } from "@bufbuild/protobuf";
import { timestampFromDate } from "@bufbuild/protobuf/wkt";
import { act, renderHook } from "@testing-library/react";
import { createRef, type PropsWithChildren } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { EditorRefActions } from "@/components/MemoEditor/Editor";
import { useAutoSave } from "@/components/MemoEditor/hooks/useAutoSave";
import { useMemoInit } from "@/components/MemoEditor/hooks/useMemoInit";
import { CACHE_DEBOUNCE_DELAY, cacheService } from "@/components/MemoEditor/services/cacheService";
import { EditorProvider, useEditorContext } from "@/components/MemoEditor/state";
import type { Memo } from "@/types/proto/api/v1/memo_service_pb";
import { MemoSchema } from "@/types/proto/api/v1/memo_service_pb";

const username = "users/test";
const memoName = "memos/123";
const cacheKey = `edit-${memoName}`;
const editorRef = createRef<EditorRefActions>();
const serverUpdateTime = new Date("2026-07-13T09:00:00.000Z");

const memo = create(MemoSchema, {
  name: memoName,
  content: "server content",
  updateTime: timestampFromDate(serverUpdateTime),
});

const wrapper = ({ children }: PropsWithChildren) => <EditorProvider>{children}</EditorProvider>;

function useRecoveryHarness(targetMemo: Memo = memo, targetCacheKey: string = cacheKey, targetUsername: string = username) {
  const recovery = useMemoInit({ editorRef, memo: targetMemo, cacheKey: targetCacheKey, username: targetUsername });
  const { state } = useEditorContext();
  useAutoSave(state.content, targetUsername, targetCacheKey, {
    enabled: recovery.isInitialized && !recovery.pendingDraft,
    baselineContent: targetMemo.content,
    mode: "edit",
    memoName: targetMemo.name,
    baseUpdateTime: recovery.draftBaseUpdateTime,
  });
  return { ...recovery, content: state.content };
}

describe("memo editor recovery", () => {
  beforeEach(() => {
    localStorage.clear();
    cacheService.clearAll();
  });

  afterEach(() => {
    cacheService.clearAll();
    localStorage.clear();
    vi.useRealTimers();
  });

  it("keeps server content visible until an edit draft is explicitly restored", () => {
    cacheService.saveNow(cacheService.key(username, cacheKey), "local unsaved content", {
      mode: "edit",
      memoName,
      baseUpdateTime: serverUpdateTime.toISOString(),
      savedAt: "2026-07-13T10:00:00.000Z",
    });

    const { result } = renderHook(useRecoveryHarness, { wrapper });

    expect(result.current.content).toBe("server content");
    expect(result.current.pendingDraft).toEqual({
      content: "local unsaved content",
      savedAt: "2026-07-13T10:00:00.000Z",
      baseUpdateTime: serverUpdateTime.toISOString(),
      hasServerChanges: false,
    });

    act(() => result.current.restorePendingDraft());

    expect(result.current.content).toBe("local unsaved content");
    expect(result.current.pendingDraft).toBeNull();
  });

  it("marks a draft as conflicted when the server revision changed", () => {
    cacheService.saveNow(cacheService.key(username, cacheKey), "older local edit", {
      mode: "edit",
      memoName,
      baseUpdateTime: "2026-07-13T08:00:00.000Z",
    });

    const { result } = renderHook(useRecoveryHarness, { wrapper });

    expect(result.current.pendingDraft?.hasServerChanges).toBe(true);
    expect(result.current.content).toBe("server content");
  });

  it("preserves the original conflict revision after restore and another local flush", () => {
    vi.useFakeTimers();
    const key = cacheService.key(username, cacheKey);
    const olderRevision = "2026-07-13T08:00:00.000Z";
    cacheService.saveNow(key, "older local edit", {
      mode: "edit",
      memoName,
      baseUpdateTime: olderRevision,
    });

    const firstOpen = renderHook(useRecoveryHarness, { wrapper });
    act(() => firstOpen.result.current.restorePendingDraft());
    act(() => vi.advanceTimersByTime(CACHE_DEBOUNCE_DELAY));

    expect(cacheService.loadDraft(key)?.baseUpdateTime).toBe(olderRevision);
    firstOpen.unmount();

    const secondOpen = renderHook(useRecoveryHarness, { wrapper });
    expect(secondOpen.result.current.pendingDraft?.hasServerChanges).toBe(true);
    expect(secondOpen.result.current.pendingDraft?.baseUpdateTime).toBe(olderRevision);
  });

  it("removes a draft only after explicit discard", () => {
    const key = cacheService.key(username, cacheKey);
    cacheService.saveNow(key, "local unsaved content", {
      mode: "edit",
      memoName,
      baseUpdateTime: serverUpdateTime.toISOString(),
    });

    const { result } = renderHook(useRecoveryHarness, { wrapper });
    expect(cacheService.loadDraft(key)).not.toBeNull();

    act(() => result.current.discardPendingDraft());

    expect(result.current.pendingDraft).toBeNull();
    expect(result.current.content).toBe("server content");
    expect(cacheService.loadDraft(key)).toBeNull();
  });

  it("debounces edit drafts and keeps only the latest content", () => {
    vi.useFakeTimers();
    const key = cacheService.key(username, cacheKey);
    const { rerender } = renderHook(
      ({ content }) =>
        useAutoSave(content, username, cacheKey, {
          baselineContent: memo.content,
          mode: "edit",
          memoName,
          baseUpdateTime: serverUpdateTime.toISOString(),
        }),
      { initialProps: { content: "first edit" } },
    );

    rerender({ content: "latest edit" });
    act(() => vi.advanceTimersByTime(CACHE_DEBOUNCE_DELAY - 1));
    expect(cacheService.loadDraft(key)).toBeNull();

    act(() => vi.advanceTimersByTime(1));
    expect(cacheService.loadDraft(key)?.content).toBe("latest edit");
  });

  it("flushes an edit draft immediately when the editor closes", () => {
    vi.useFakeTimers();
    const key = cacheService.key(username, cacheKey);
    const { unmount } = renderHook(() =>
      useAutoSave("edit before cancel", username, cacheKey, {
        baselineContent: memo.content,
        mode: "edit",
        memoName,
        baseUpdateTime: serverUpdateTime.toISOString(),
      }),
    );

    unmount();

    expect(cacheService.loadDraft(key)?.content).toBe("edit before cancel");
  });

  it("reinitializes safely when the same component switches to another memo", () => {
    const secondMemo = create(MemoSchema, {
      name: "memos/456",
      content: "second server content",
      updateTime: timestampFromDate(new Date("2026-07-13T10:00:00.000Z")),
    });
    const secondCacheKey = `edit-${secondMemo.name}`;
    const { result, rerender } = renderHook(
      ({ targetMemo, targetCacheKey }) => useRecoveryHarness(targetMemo, targetCacheKey),
      { wrapper, initialProps: { targetMemo: memo, targetCacheKey: cacheKey } },
    );

    expect(result.current.content).toBe("server content");
    rerender({ targetMemo: secondMemo, targetCacheKey: secondCacheKey });

    expect(result.current.isInitialized).toBe(true);
    expect(result.current.content).toBe("second server content");
    expect(cacheService.loadDraft(cacheService.key(username, secondCacheKey))).toBeNull();
  });

  it("does not offer a legacy create draft as an edit recovery", () => {
    const key = cacheService.key(username, cacheKey);
    localStorage.setItem(key, "legacy create draft");

    const { result } = renderHook(useRecoveryHarness, { wrapper });

    expect(result.current.pendingDraft).toBeNull();
    expect(result.current.content).toBe("server content");
  });
});
