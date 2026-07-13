import { create, type JsonValue, toJson } from "@bufbuild/protobuf";
import { buildMemoCreatorFilter } from "@/helpers/resource-names";
import { State } from "@/types/proto/api/v1/common_pb";
import {
  type ListMemosRequest,
  ListMemosRequestSchema,
  type ListMemosResponse,
  type Memo,
  MemoSchema,
} from "@/types/proto/api/v1/memo_service_pb";

export const MEMO_EXPORT_FORMAT = "memoark.memo-export";
export const MEMO_EXPORT_VERSION = 1 as const;

const MEMO_EXPORT_PAGE_SIZE = 1000;
const MEMO_EXPORT_ORDER = "create_time asc, name asc";

export interface MemoExportUser {
  name: string;
  username: string;
  displayName: string;
}

export interface MemoExportClient {
  listMemos: (request: ListMemosRequest) => Promise<ListMemosResponse>;
}

export interface MemoExportDocumentV1 {
  format: typeof MEMO_EXPORT_FORMAT;
  formatVersion: typeof MEMO_EXPORT_VERSION;
  exportedAt: string;
  user: MemoExportUser;
  counts: {
    total: number;
    normal: number;
    archived: number;
  };
  includedContent: {
    memoData: true;
    attachmentMetadata: true;
    attachmentFiles: false;
    comments: false;
    instanceSettings: false;
  };
  memos: JsonValue[];
}

export interface MemoExportFile {
  document: MemoExportDocumentV1;
  filename: string;
  content: string;
}

const listAllMemosForState = async (
  client: MemoExportClient,
  creatorFilter: string,
  state: State.NORMAL | State.ARCHIVED,
): Promise<Memo[]> => {
  const memos: Memo[] = [];
  const seenPageTokens = new Set<string>();
  let pageToken = "";

  do {
    const response = await client.listMemos(
      create(ListMemosRequestSchema, {
        pageSize: MEMO_EXPORT_PAGE_SIZE,
        pageToken,
        state,
        orderBy: MEMO_EXPORT_ORDER,
        filter: creatorFilter,
      }),
    );
    memos.push(...response.memos);

    const nextPageToken = response.nextPageToken;
    if (!nextPageToken) {
      break;
    }
    if (seenPageTokens.has(nextPageToken)) {
      throw new Error("Memo export stopped because the server returned a repeated page token.");
    }
    seenPageTokens.add(nextPageToken);
    pageToken = nextPageToken;
  } while (pageToken);

  return memos;
};

export const createMemoExportFile = async (user: MemoExportUser, client: MemoExportClient, now = new Date()): Promise<MemoExportFile> => {
  const creatorFilter = buildMemoCreatorFilter(user.name);
  if (!creatorFilter) {
    throw new Error("A signed-in user is required to export memos.");
  }

  const [normalMemos, archivedMemos] = await Promise.all([
    listAllMemosForState(client, creatorFilter, State.NORMAL),
    listAllMemosForState(client, creatorFilter, State.ARCHIVED),
  ]);
  const memos = [...normalMemos, ...archivedMemos];

  const document: MemoExportDocumentV1 = {
    format: MEMO_EXPORT_FORMAT,
    formatVersion: MEMO_EXPORT_VERSION,
    exportedAt: now.toISOString(),
    user: {
      name: user.name,
      username: user.username,
      displayName: user.displayName,
    },
    counts: {
      total: memos.length,
      normal: normalMemos.length,
      archived: archivedMemos.length,
    },
    includedContent: {
      memoData: true,
      attachmentMetadata: true,
      attachmentFiles: false,
      comments: false,
      instanceSettings: false,
    },
    memos: memos.map((memo) => toJson(MemoSchema, memo, { alwaysEmitImplicit: true })),
  };

  return {
    document,
    filename: `memoark-export-v${MEMO_EXPORT_VERSION}-${now.toISOString().slice(0, 10)}.json`,
    content: `${JSON.stringify(document, null, 2)}\n`,
  };
};
