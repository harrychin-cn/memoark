export const CACHE_DEBOUNCE_DELAY = 500;

const pendingSaves = new Map<string, ReturnType<typeof window.setTimeout>>();
const STRUCTURED_CACHE_ENTRY_KIND = "memos.editor-cache";
const STRUCTURED_CACHE_ENTRY_VERSION = 3;

export type MemoEditorDraftMode = "create" | "edit";

export interface MemoEditorDraftMetadata {
  mode?: MemoEditorDraftMode;
  memoName?: string;
  baseUpdateTime?: string;
  savedAt?: string;
  requestId?: string;
  pending?: boolean;
  attemptedAt?: string;
}

export interface MemoEditorDraft {
  mode: MemoEditorDraftMode;
  memoName?: string;
  baseUpdateTime?: string;
  savedAt?: string;
  requestId?: string;
  pending?: boolean;
  attemptedAt?: string;
  content: string;
}

interface StructuredCacheEntryV3 {
  kind: typeof STRUCTURED_CACHE_ENTRY_KIND;
  version: typeof STRUCTURED_CACHE_ENTRY_VERSION;
  mode: MemoEditorDraftMode;
  memoName?: string;
  baseUpdateTime?: string;
  savedAt: string;
  requestId?: string;
  pending?: boolean;
  attemptedAt?: string;
  content: string;
}

function deserializeDraft(raw: string): MemoEditorDraft {
  try {
    const parsed = JSON.parse(raw) as {
      kind?: unknown;
      version?: unknown;
      mode?: unknown;
      memoName?: unknown;
      baseUpdateTime?: unknown;
      savedAt?: unknown;
      requestId?: unknown;
      pending?: unknown;
      attemptedAt?: unknown;
      content?: unknown;
    };

    if (parsed.kind === STRUCTURED_CACHE_ENTRY_KIND && parsed.version === 1 && typeof parsed.content === "string") {
      return {
        mode: "create",
        content: parsed.content,
      };
    }

    if (
      parsed.kind === STRUCTURED_CACHE_ENTRY_KIND &&
      (parsed.version === 2 || parsed.version === STRUCTURED_CACHE_ENTRY_VERSION) &&
      (parsed.mode === "create" || parsed.mode === "edit") &&
      (parsed.memoName === undefined || typeof parsed.memoName === "string") &&
      (parsed.baseUpdateTime === undefined || typeof parsed.baseUpdateTime === "string") &&
      typeof parsed.savedAt === "string" &&
      typeof parsed.content === "string"
    ) {
      const hasValidDeliveryMetadata =
        parsed.version === 2 ||
        ((parsed.requestId === undefined || typeof parsed.requestId === "string") &&
          (parsed.pending === undefined || typeof parsed.pending === "boolean") &&
          (parsed.attemptedAt === undefined || typeof parsed.attemptedAt === "string"));
      if (!hasValidDeliveryMetadata) {
        return {
          mode: "create",
          content: raw,
        };
      }

      return {
        mode: parsed.mode,
        memoName: parsed.memoName,
        baseUpdateTime: parsed.baseUpdateTime,
        savedAt: parsed.savedAt,
        requestId: parsed.version === STRUCTURED_CACHE_ENTRY_VERSION ? (parsed.requestId as string | undefined) : undefined,
        pending: parsed.version === STRUCTURED_CACHE_ENTRY_VERSION ? (parsed.pending as boolean | undefined) : undefined,
        attemptedAt: parsed.version === STRUCTURED_CACHE_ENTRY_VERSION ? (parsed.attemptedAt as string | undefined) : undefined,
        content: parsed.content,
      };
    }
  } catch {
    // Drafts have historically been stored as raw markdown strings.
  }

  return {
    mode: "create",
    content: raw,
  };
}

function removeEntry(key: string): boolean {
  try {
    localStorage.removeItem(key);
    return true;
  } catch {
    // localStorage can be unavailable in privacy modes or restricted contexts.
    return false;
  }
}

function writeEntry(key: string, content: string, metadata: MemoEditorDraftMetadata = {}): boolean {
  const mode = metadata.mode ?? "create";
  if (mode === "create" && !content.trim()) {
    const removed = removeEntry(key);
    // The v0.1 cache only guarantees recovery for text drafts. Do not report
    // an attachment-only pending create as safely persisted when there is no
    // text entry to restore after a reload.
    return metadata.pending ? false : removed;
  }

  const entry: StructuredCacheEntryV3 = {
    kind: STRUCTURED_CACHE_ENTRY_KIND,
    version: STRUCTURED_CACHE_ENTRY_VERSION,
    mode,
    memoName: metadata.memoName,
    baseUpdateTime: metadata.baseUpdateTime,
    savedAt: metadata.savedAt ?? new Date().toISOString(),
    requestId: metadata.requestId,
    pending: metadata.pending,
    attemptedAt: metadata.attemptedAt,
    content,
  };

  try {
    localStorage.setItem(key, JSON.stringify(entry));
    return true;
  } catch {
    // Draft persistence is best-effort and must never take down the editor.
    return false;
  }
}

function loadDraftEntry(key: string): MemoEditorDraft | null {
  try {
    const raw = localStorage.getItem(key);
    return raw === null ? null : deserializeDraft(raw);
  } catch {
    return null;
  }
}

export const cacheService = {
  key: (username: string, cacheKey?: string): string => {
    return `${username}-${cacheKey || ""}`;
  },

  save: (key: string, content: string, metadata: MemoEditorDraftMetadata = {}) => {
    const pendingSave = pendingSaves.get(key);
    if (pendingSave) {
      window.clearTimeout(pendingSave);
    }

    const timeoutId = window.setTimeout(() => {
      pendingSaves.delete(key);

      writeEntry(key, content, metadata);
    }, CACHE_DEBOUNCE_DELAY);

    pendingSaves.set(key, timeoutId);
  },

  saveNow: (key: string, content: string, metadata: MemoEditorDraftMetadata = {}): boolean => {
    const pendingSave = pendingSaves.get(key);
    if (pendingSave) {
      window.clearTimeout(pendingSave);
      pendingSaves.delete(key);
    }

    return writeEntry(key, content, metadata);
  },

  load(key: string): string {
    return loadDraftEntry(key)?.content ?? "";
  },

  loadDraft(key: string): MemoEditorDraft | null {
    return loadDraftEntry(key);
  },

  clear(key: string): void {
    const pendingSave = pendingSaves.get(key);
    if (pendingSave) {
      window.clearTimeout(pendingSave);
      pendingSaves.delete(key);
    }

    removeEntry(key);
  },

  clearAll(): void {
    for (const timeoutId of pendingSaves.values()) {
      window.clearTimeout(timeoutId);
    }
    pendingSaves.clear();
  },
};
