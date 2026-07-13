export const CACHE_DEBOUNCE_DELAY = 500;

const pendingSaves = new Map<string, ReturnType<typeof window.setTimeout>>();
const STRUCTURED_CACHE_ENTRY_KIND = "memos.editor-cache";
const STRUCTURED_CACHE_ENTRY_VERSION = 2;

export type MemoEditorDraftMode = "create" | "edit";

export interface MemoEditorDraftMetadata {
  mode?: MemoEditorDraftMode;
  memoName?: string;
  baseUpdateTime?: string;
  savedAt?: string;
}

export interface MemoEditorDraft {
  mode: MemoEditorDraftMode;
  memoName?: string;
  baseUpdateTime?: string;
  savedAt?: string;
  content: string;
}

interface StructuredCacheEntryV2 {
  kind: typeof STRUCTURED_CACHE_ENTRY_KIND;
  version: typeof STRUCTURED_CACHE_ENTRY_VERSION;
  mode: MemoEditorDraftMode;
  memoName?: string;
  baseUpdateTime?: string;
  savedAt: string;
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
      parsed.version === STRUCTURED_CACHE_ENTRY_VERSION &&
      (parsed.mode === "create" || parsed.mode === "edit") &&
      (parsed.memoName === undefined || typeof parsed.memoName === "string") &&
      (parsed.baseUpdateTime === undefined || typeof parsed.baseUpdateTime === "string") &&
      typeof parsed.savedAt === "string" &&
      typeof parsed.content === "string"
    ) {
      return {
        mode: parsed.mode,
        memoName: parsed.memoName,
        baseUpdateTime: parsed.baseUpdateTime,
        savedAt: parsed.savedAt,
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

function removeEntry(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    // localStorage can be unavailable in privacy modes or restricted contexts.
  }
}

function writeEntry(key: string, content: string, metadata: MemoEditorDraftMetadata = {}): void {
  const mode = metadata.mode ?? "create";
  if (mode === "create" && !content.trim()) {
    removeEntry(key);
    return;
  }

  const entry: StructuredCacheEntryV2 = {
    kind: STRUCTURED_CACHE_ENTRY_KIND,
    version: STRUCTURED_CACHE_ENTRY_VERSION,
    mode,
    memoName: metadata.memoName,
    baseUpdateTime: metadata.baseUpdateTime,
    savedAt: metadata.savedAt ?? new Date().toISOString(),
    content,
  };

  try {
    localStorage.setItem(key, JSON.stringify(entry));
  } catch {
    // Draft persistence is best-effort and must never take down the editor.
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

  saveNow: (key: string, content: string, metadata: MemoEditorDraftMetadata = {}) => {
    const pendingSave = pendingSaves.get(key);
    if (pendingSave) {
      window.clearTimeout(pendingSave);
      pendingSaves.delete(key);
    }

    writeEntry(key, content, metadata);
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
