import { create } from "@bufbuild/protobuf";
import { timestampFromDate } from "@bufbuild/protobuf/wkt";
import { Code, ConnectError } from "@connectrpc/connect";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { memoService } from "@/components/MemoEditor/services/memoService";
import { type EditorState, initialState } from "@/components/MemoEditor/state";
import { MemoSchema, Visibility } from "@/types/proto/api/v1/memo_service_pb";

const clients = vi.hoisted(() => ({
  createMemo: vi.fn(),
  createMemoComment: vi.fn(),
  getMemo: vi.fn(),
  updateMemo: vi.fn(),
  createAttachment: vi.fn(),
}));

vi.mock("@/connect", () => ({
  memoServiceClient: {
    createMemo: clients.createMemo,
    createMemoComment: clients.createMemoComment,
    getMemo: clients.getMemo,
    updateMemo: clients.updateMemo,
  },
  attachmentServiceClient: {
    createAttachment: clients.createAttachment,
  },
}));

function makeState(content: string): EditorState {
  return {
    ...initialState,
    content,
    metadata: { ...initialState.metadata, visibility: Visibility.PRIVATE },
    ui: { ...initialState.ui, isLoading: { ...initialState.ui.isLoading } },
    timestamps: { ...initialState.timestamps },
    localFiles: [],
    audioRecorder: { ...initialState.audioRecorder },
  };
}

describe("memo editor memo service retries", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("passes a stable request id to createMemo", async () => {
    clients.createMemo.mockResolvedValue(create(MemoSchema, { name: "memos/stable-id" }));

    await memoService.save(makeState("new memo"), { requestId: "stable-id" });

    expect(clients.createMemo).toHaveBeenCalledWith(
      expect.objectContaining({
        memoId: "stable-id",
        memo: expect.objectContaining({ content: "new memo" }),
      }),
    );
  });

  it("treats AlreadyExists as success when the existing create matches", async () => {
    clients.createMemo.mockRejectedValue(new ConnectError("already exists", Code.AlreadyExists));
    clients.getMemo.mockResolvedValue(
      create(MemoSchema, {
        name: "memos/stable-id",
        content: "new memo",
        visibility: Visibility.PRIVATE,
      }),
    );

    const result = await memoService.save(makeState("new memo"), { requestId: "stable-id", retrying: true });

    expect(clients.createMemo).toHaveBeenCalledTimes(1);
    expect(clients.getMemo).toHaveBeenCalledWith({ name: "memos/stable-id" });
    expect(clients.updateMemo).not.toHaveBeenCalled();
    expect(result).toEqual({ memoName: "memos/stable-id", hasChanges: false, confirmedExisting: true });
  });

  it("reconciles an AlreadyExists create to the latest local content without creating a duplicate", async () => {
    clients.createMemo.mockRejectedValue(new ConnectError("already exists", Code.AlreadyExists));
    clients.getMemo.mockResolvedValue(
      create(MemoSchema, {
        name: "memos/stable-id",
        content: "content from the first request",
        visibility: Visibility.PRIVATE,
      }),
    );
    clients.updateMemo.mockResolvedValue(
      create(MemoSchema, {
        name: "memos/stable-id",
        content: "latest local content",
        visibility: Visibility.PRIVATE,
      }),
    );

    const result = await memoService.save(makeState("latest local content"), { requestId: "stable-id", retrying: true });

    expect(clients.createMemo).toHaveBeenCalledTimes(1);
    expect(clients.updateMemo).toHaveBeenCalledWith(
      expect.objectContaining({
        memo: expect.objectContaining({ name: "memos/stable-id", content: "latest local content" }),
      }),
    );
    expect(result).toEqual({ memoName: "memos/stable-id", hasChanges: true });
  });

  it("confirms a response-lost edit without overwriting the newer server timestamp", async () => {
    const baseUpdateTime = "2026-07-13T09:00:00.000Z";
    const state = makeState("saved edit");
    state.timestamps.updateTime = new Date(baseUpdateTime);
    clients.getMemo.mockResolvedValue(
      create(MemoSchema, {
        name: "memos/123",
        content: "saved edit",
        visibility: Visibility.PRIVATE,
        updateTime: timestampFromDate(new Date("2026-07-13T09:05:00.000Z")),
      }),
    );

    const result = await memoService.save(state, {
      memoName: "memos/123",
      retrying: true,
      baseUpdateTime,
    });

    expect(clients.updateMemo).not.toHaveBeenCalled();
    expect(result).toEqual({ memoName: "memos/123", hasChanges: false, confirmedExisting: true });
  });

  it("updates an edit on retry when the server still has the old content", async () => {
    const baseUpdateTime = "2026-07-13T09:00:00.000Z";
    const state = makeState("local edit");
    state.timestamps.updateTime = new Date(baseUpdateTime);
    clients.getMemo.mockResolvedValue(
      create(MemoSchema, {
        name: "memos/123",
        content: "server content",
        visibility: Visibility.PRIVATE,
        updateTime: timestampFromDate(new Date(baseUpdateTime)),
      }),
    );
    clients.updateMemo.mockResolvedValue(create(MemoSchema, { name: "memos/123", content: "local edit" }));

    const result = await memoService.save(state, {
      memoName: "memos/123",
      retrying: true,
      baseUpdateTime,
    });

    expect(clients.updateMemo).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ memoName: "memos/123", hasChanges: true });
  });
});
