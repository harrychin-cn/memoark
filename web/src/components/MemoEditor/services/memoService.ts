import { create } from "@bufbuild/protobuf";
import { FieldMaskSchema, timestampDate, timestampFromDate } from "@bufbuild/protobuf/wkt";
import { Code, ConnectError } from "@connectrpc/connect";
import { isEqual } from "lodash-es";
import { memoServiceClient } from "@/connect";
import type { Attachment } from "@/types/proto/api/v1/attachment_service_pb";
import { AttachmentSchema } from "@/types/proto/api/v1/attachment_service_pb";
import type { Memo } from "@/types/proto/api/v1/memo_service_pb";
import { MemoSchema } from "@/types/proto/api/v1/memo_service_pb";
import type { EditorState } from "../state";
import { uploadService } from "./uploadService";

/**
 * Converts attachments to reference format for API requests.
 * The backend only needs the attachment name to link it to a memo.
 */
function toAttachmentReferences(attachments: Attachment[]): Attachment[] {
  return attachments.map((a) => create(AttachmentSchema, { name: a.name }));
}

function buildUpdateMask(
  prevMemo: Memo,
  state: EditorState,
  allAttachments: typeof state.metadata.attachments,
): { mask: Set<string>; patch: Partial<Memo> } {
  const mask = new Set<string>();
  const patch: Partial<Memo> = {
    name: prevMemo.name,
    content: state.content,
  };

  if (!isEqual(state.content, prevMemo.content)) {
    mask.add("content");
    patch.content = state.content;
  }
  if (!isEqual(state.metadata.visibility, prevMemo.visibility)) {
    mask.add("visibility");
    patch.visibility = state.metadata.visibility;
  }
  if (!isEqual(allAttachments, prevMemo.attachments)) {
    mask.add("attachments");
    patch.attachments = toAttachmentReferences(allAttachments);
  }
  if (!isEqual(state.metadata.relations, prevMemo.relations)) {
    mask.add("relations");
    patch.relations = state.metadata.relations;
  }
  if (!isEqual(state.metadata.location, prevMemo.location)) {
    mask.add("location");
    patch.location = state.metadata.location;
  }

  // Auto-update timestamp if content changed
  if (["content", "attachments", "relations", "location"].some((key) => mask.has(key))) {
    mask.add("update_time");
  }

  // Handle custom timestamps
  if (state.timestamps.createTime) {
    const prevCreateTime = prevMemo.createTime ? timestampDate(prevMemo.createTime) : undefined;
    if (!isEqual(state.timestamps.createTime, prevCreateTime)) {
      mask.add("create_time");
      patch.createTime = timestampFromDate(state.timestamps.createTime);
    }
  }
  if (state.timestamps.updateTime) {
    const prevUpdateTime = prevMemo.updateTime ? timestampDate(prevMemo.updateTime) : undefined;
    if (!isEqual(state.timestamps.updateTime, prevUpdateTime)) {
      mask.add("update_time");
      patch.updateTime = timestampFromDate(state.timestamps.updateTime);
    }
  }

  return { mask, patch };
}

function matchesPersistedEditorState(
  memo: Memo,
  state: EditorState,
  allAttachments: typeof state.metadata.attachments,
  baseUpdateTime?: string,
): boolean {
  if (
    !isEqual(state.content, memo.content) ||
    !isEqual(state.metadata.visibility, memo.visibility) ||
    !isEqual(allAttachments, memo.attachments) ||
    !isEqual(state.metadata.relations, memo.relations) ||
    !isEqual(state.metadata.location, memo.location)
  ) {
    return false;
  }

  if (state.timestamps.createTime) {
    const serverCreateTime = memo.createTime ? timestampDate(memo.createTime).toISOString() : undefined;
    if (state.timestamps.createTime.toISOString() !== serverCreateTime) {
      return false;
    }
  }

  if (state.timestamps.updateTime) {
    const requestedUpdateTime = state.timestamps.updateTime.toISOString();
    const updateTimeWasExplicitlyChanged = baseUpdateTime === undefined || requestedUpdateTime !== baseUpdateTime;
    const serverUpdateTime = memo.updateTime ? timestampDate(memo.updateTime).toISOString() : undefined;
    if (updateTimeWasExplicitlyChanged && requestedUpdateTime !== serverUpdateTime) {
      return false;
    }
  }

  return true;
}

async function saveExistingMemo(
  prevMemo: Memo,
  state: EditorState,
  allAttachments: typeof state.metadata.attachments,
  options: { retrying?: boolean; baseUpdateTime?: string } = {},
): Promise<{ memoName: string; hasChanges: boolean; confirmedExisting?: boolean }> {
  if (options.retrying && matchesPersistedEditorState(prevMemo, state, allAttachments, options.baseUpdateTime)) {
    return { memoName: prevMemo.name, hasChanges: false, confirmedExisting: true };
  }

  const { mask, patch } = buildUpdateMask(prevMemo, state, allAttachments);
  if (mask.size === 0) {
    return { memoName: prevMemo.name, hasChanges: false };
  }

  const memo = await memoServiceClient.updateMemo({
    memo: create(MemoSchema, patch as Record<string, unknown>),
    updateMask: create(FieldMaskSchema, { paths: Array.from(mask) }),
  });
  return { memoName: memo.name, hasChanges: true };
}

export const memoService = {
  async save(
    state: EditorState,
    options: {
      memoName?: string;
      parentMemoName?: string;
      requestId?: string;
      retrying?: boolean;
      baseUpdateTime?: string;
    },
  ): Promise<{ memoName: string; hasChanges: boolean; confirmedExisting?: boolean }> {
    // 1. Upload local files first
    const newAttachments = await uploadService.uploadFiles(state.localFiles);
    const allAttachments = [...state.metadata.attachments, ...newAttachments];

    // 2. Update existing memo
    if (options.memoName) {
      const prevMemo = await memoServiceClient.getMemo({ name: options.memoName });
      return saveExistingMemo(prevMemo, state, allAttachments, options);
    }

    // 3. Create new memo or comment
    const memoData = create(MemoSchema, {
      content: state.content,
      visibility: state.metadata.visibility,
      attachments: toAttachmentReferences(allAttachments),
      relations: state.metadata.relations,
      location: state.metadata.location,
      createTime: state.timestamps.createTime ? timestampFromDate(state.timestamps.createTime) : undefined,
      updateTime: state.timestamps.updateTime ? timestampFromDate(state.timestamps.updateTime) : undefined,
    });

    let memo: Memo;
    if (options.parentMemoName) {
      memo = await memoServiceClient.createMemoComment({
        name: options.parentMemoName,
        comment: memoData,
        commentId: options.requestId,
      });
    } else {
      try {
        memo = await memoServiceClient.createMemo({ memo: memoData, memoId: options.requestId });
      } catch (error) {
        if (!(options.requestId && error instanceof ConnectError && error.code === Code.AlreadyExists)) {
          throw error;
        }

        const existingMemo = await memoServiceClient.getMemo({ name: `memos/${options.requestId}` });
        return saveExistingMemo(existingMemo, state, allAttachments, { retrying: true, baseUpdateTime: options.baseUpdateTime });
      }
    }

    return { memoName: memo.name, hasChanges: true };
  },

  /** Build editor state from an already-loaded Memo entity (no network request). */
  fromMemo(memo: Memo): EditorState {
    return {
      content: memo.content,
      metadata: {
        visibility: memo.visibility,
        attachments: memo.attachments,
        relations: memo.relations,
        location: memo.location,
      },
      ui: {
        isFocusMode: false,
        isLoading: { saving: false, uploading: false, loading: false },
        isComposing: false,
      },
      timestamps: {
        createTime: memo.createTime ? timestampDate(memo.createTime) : undefined,
        updateTime: memo.updateTime ? timestampDate(memo.updateTime) : undefined,
      },
      localFiles: [],
      audioRecorder: {
        isSupported: true,
        permission: "unknown",
        status: "idle",
        elapsedSeconds: 0,
        error: undefined,
      },
    };
  },
};
