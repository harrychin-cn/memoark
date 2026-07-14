import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CACHE_DEBOUNCE_DELAY, cacheService } from "@/components/MemoEditor/services/cacheService";

describe("memo editor cache", () => {
  beforeEach(() => {
    const storage = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: vi.fn((key: string) => storage.get(key) ?? null),
      setItem: vi.fn((key: string, value: string) => storage.set(key, value)),
      removeItem: vi.fn((key: string) => storage.delete(key)),
    });
    cacheService.clearAll();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("stores a v3 create draft and exposes its delivery metadata", () => {
    const key = cacheService.key("users/steven", "home-memo-editor");
    const savedAt = "2026-07-13T10:00:00.000Z";
    const attemptedAt = "2026-07-13T10:00:01.000Z";

    expect(
      cacheService.saveNow(key, "- [x] Draft task", {
        mode: "create",
        savedAt,
        requestId: "memo-request-id",
        pending: true,
        attemptedAt,
      }),
    ).toBe(true);

    expect(cacheService.load(key)).toBe("- [x] Draft task");
    expect(cacheService.loadDraft(key)).toEqual({
      mode: "create",
      savedAt,
      requestId: "memo-request-id",
      pending: true,
      attemptedAt,
      content: "- [x] Draft task",
    });
    expect(JSON.parse(localStorage.getItem(key) ?? "null")).toEqual({
      kind: "memos.editor-cache",
      version: 3,
      mode: "create",
      savedAt,
      requestId: "memo-request-id",
      pending: true,
      attemptedAt,
      content: "- [x] Draft task",
    });
  });

  it("does not claim an attachment-only pending create was persisted by the text cache", () => {
    const key = cacheService.key("users/steven", "home-memo-editor");

    expect(
      cacheService.saveNow(key, "", {
        mode: "create",
        requestId: "attachment-only-request",
        pending: true,
      }),
    ).toBe(false);
    expect(cacheService.loadDraft(key)).toBeNull();
  });

  it("removes empty draft content instead of caching it", () => {
    const key = cacheService.key("users/steven", "home-memo-editor");

    cacheService.saveNow(key, "");

    expect(cacheService.load(key)).toBe("");
    expect(cacheService.loadDraft(key)).toBeNull();
  });

  it("keeps an empty edit draft with its memo revision metadata", () => {
    const key = cacheService.key("users/steven", "inline-memo-editor-memos/123");
    const savedAt = "2026-07-13T10:05:00.000Z";

    cacheService.saveNow(key, "", {
      mode: "edit",
      memoName: "memos/123",
      baseUpdateTime: "2026-07-13T09:00:00.000Z",
      savedAt,
    });

    expect(cacheService.load(key)).toBe("");
    expect(cacheService.loadDraft(key)).toEqual({
      mode: "edit",
      memoName: "memos/123",
      baseUpdateTime: "2026-07-13T09:00:00.000Z",
      savedAt,
      content: "",
    });
  });

  it("loads content from previously structured draft entries", () => {
    const key = cacheService.key("users/steven", "home-memo-editor");
    localStorage.setItem(key, JSON.stringify({ kind: "memos.editor-cache", version: 1, content: "- [ ] migrated task" }));

    expect(cacheService.load(key)).toBe("- [ ] migrated task");
    expect(cacheService.loadDraft(key)).toEqual({ mode: "create", content: "- [ ] migrated task" });
  });

  it("loads v2 draft entries without delivery metadata", () => {
    const key = cacheService.key("users/steven", "home-memo-editor");
    localStorage.setItem(
      key,
      JSON.stringify({
        kind: "memos.editor-cache",
        version: 2,
        mode: "create",
        savedAt: "2026-07-13T10:00:00.000Z",
        content: "v2 draft",
      }),
    );

    expect(cacheService.loadDraft(key)).toEqual({
      mode: "create",
      savedAt: "2026-07-13T10:00:00.000Z",
      content: "v2 draft",
    });
  });

  it("keeps raw JSON markdown drafts intact", () => {
    const key = cacheService.key("users/steven", "home-memo-editor");
    const jsonDraft = '{"content":"not a cache envelope"}';
    localStorage.setItem(key, jsonDraft);

    expect(cacheService.load(key)).toBe(jsonDraft);
    expect(cacheService.loadDraft(key)).toEqual({ mode: "create", content: jsonDraft });
  });

  it("keeps structured-looking drafts without a supported version intact", () => {
    const key = cacheService.key("users/steven", "home-memo-editor");
    const jsonDraft = JSON.stringify({ kind: "memos.editor-cache", content: "not a supported envelope" });
    localStorage.setItem(key, jsonDraft);

    expect(cacheService.load(key)).toBe(jsonDraft);
    expect(cacheService.loadDraft(key)).toEqual({ mode: "create", content: jsonDraft });
  });

  it("passes metadata through the debounced save path", () => {
    vi.useFakeTimers();
    const key = cacheService.key("users/steven", "inline-memo-editor-memos/456");

    cacheService.save(key, "edited", {
      mode: "edit",
      memoName: "memos/456",
      baseUpdateTime: "2026-07-13T09:30:00.000Z",
      savedAt: "2026-07-13T10:10:00.000Z",
    });
    expect(cacheService.loadDraft(key)).toBeNull();

    vi.advanceTimersByTime(CACHE_DEBOUNCE_DELAY);

    expect(cacheService.loadDraft(key)).toEqual({
      mode: "edit",
      memoName: "memos/456",
      baseUpdateTime: "2026-07-13T09:30:00.000Z",
      savedAt: "2026-07-13T10:10:00.000Z",
      content: "edited",
    });
  });

  it("never throws when localStorage reads or writes fail", () => {
    const key = cacheService.key("users/steven", "home-memo-editor");
    vi.mocked(localStorage.getItem).mockImplementation(() => {
      throw new Error("read denied");
    });
    vi.mocked(localStorage.setItem).mockImplementation(() => {
      throw new Error("quota exceeded");
    });
    vi.mocked(localStorage.removeItem).mockImplementation(() => {
      throw new Error("remove denied");
    });

    expect(cacheService.saveNow(key, "draft")).toBe(false);
    expect(() => cacheService.clear(key)).not.toThrow();
    expect(() => cacheService.load(key)).not.toThrow();
    expect(cacheService.load(key)).toBe("");
    expect(cacheService.loadDraft(key)).toBeNull();
  });
});
