import { create } from "@bufbuild/protobuf";
import { timestampFromDate } from "@bufbuild/protobuf/wkt";
import { describe, expect, it, vi } from "vitest";
import {
  createMemoExportFile,
  MEMO_EXPORT_FORMAT,
  MEMO_EXPORT_VERSION,
  type MemoExportClient,
} from "@/services/memoExportService";
import { State } from "@/types/proto/api/v1/common_pb";
import {
  ListMemosResponseSchema,
  MemoSchema,
  Visibility,
  type ListMemosRequest,
} from "@/types/proto/api/v1/memo_service_pb";

const makeMemo = (name: string, state: State, content: string) =>
  create(MemoSchema, {
    name,
    state,
    creator: "users/alice",
    content,
    visibility: Visibility.PRIVATE,
    createTime: timestampFromDate(new Date("2026-07-01T08:30:00.000Z")),
  });

describe("createMemoExportFile", () => {
  it("exports every normal and archived page with a current-user filter", async () => {
    const requests: ListMemosRequest[] = [];
    const client: MemoExportClient = {
      listMemos: vi.fn(async (request) => {
        requests.push(request);
        if (request.state === State.NORMAL && request.pageToken === "") {
          return create(ListMemosResponseSchema, {
            memos: [makeMemo("memos/normal-1", State.NORMAL, "first")],
            nextPageToken: "normal-page-2",
          });
        }
        if (request.state === State.NORMAL && request.pageToken === "normal-page-2") {
          return create(ListMemosResponseSchema, {
            memos: [makeMemo("memos/normal-2", State.NORMAL, "second")],
          });
        }
        if (request.state === State.ARCHIVED && request.pageToken === "") {
          return create(ListMemosResponseSchema, {
            memos: [makeMemo("memos/archived-1", State.ARCHIVED, "archived")],
          });
        }
        throw new Error(`Unexpected request: ${request.state}/${request.pageToken}`);
      }),
    };
    const user = {
      name: "users/alice",
      username: "alice",
      displayName: "Alice",
      email: "private@example.com",
      password: "must-not-export",
    };
    const now = new Date("2026-07-13T12:34:56.000Z");

    const result = await createMemoExportFile(user, client, now);

    expect(result.filename).toBe("memoark-export-v1-2026-07-13.json");
    expect(result.document).toMatchObject({
      format: MEMO_EXPORT_FORMAT,
      formatVersion: MEMO_EXPORT_VERSION,
      exportedAt: "2026-07-13T12:34:56.000Z",
      user: {
        name: "users/alice",
        username: "alice",
        displayName: "Alice",
      },
      counts: { total: 3, normal: 2, archived: 1 },
      includedContent: {
        memoData: true,
        attachmentMetadata: true,
        attachmentFiles: false,
        comments: false,
        instanceSettings: false,
      },
    });
    expect(result.document.memos).toEqual([
      expect.objectContaining({ name: "memos/normal-1", state: "NORMAL", content: "first", createTime: "2026-07-01T08:30:00Z" }),
      expect.objectContaining({ name: "memos/normal-2", state: "NORMAL", content: "second" }),
      expect.objectContaining({ name: "memos/archived-1", state: "ARCHIVED", content: "archived" }),
    ]);
    expect(result.document.user).not.toHaveProperty("email");
    expect(result.document.user).not.toHaveProperty("password");
    expect(JSON.parse(result.content)).toEqual(result.document);

    expect(requests).toHaveLength(3);
    for (const request of requests) {
      expect(request.pageSize).toBe(1000);
      expect(request.filter).toBe('creator == "users/alice"');
      expect(request.orderBy).toBe("create_time asc, name asc");
      expect(request.showDeleted).toBe(false);
    }
  });

  it("normalizes a bare user id before building the creator filter", async () => {
    const client: MemoExportClient = {
      listMemos: vi.fn(async () => create(ListMemosResponseSchema)),
    };

    await createMemoExportFile({ name: "alice", username: "alice", displayName: "Alice" }, client);

    expect(client.listMemos).toHaveBeenCalledTimes(2);
    for (const [request] of vi.mocked(client.listMemos).mock.calls) {
      expect(request.filter).toBe('creator == "users/alice"');
    }
  });

  it("stops instead of looping forever when a page token repeats", async () => {
    const client: MemoExportClient = {
      listMemos: vi.fn(async (request) =>
        create(ListMemosResponseSchema, {
          nextPageToken: request.state === State.NORMAL ? "repeated" : "",
        }),
      ),
    };

    await expect(createMemoExportFile({ name: "users/alice", username: "alice", displayName: "Alice" }, client)).rejects.toThrow(
      "repeated page token",
    );
  });
});
