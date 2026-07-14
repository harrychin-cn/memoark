import { create } from "@bufbuild/protobuf";
import { timestampFromDate } from "@bufbuild/protobuf/wkt";
import { Code, ConnectError } from "@connectrpc/connect";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { PropsWithChildren } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import MemoEditor from "@/components/MemoEditor";
import { cacheService } from "@/components/MemoEditor/services/cacheService";
import { errorService } from "@/components/MemoEditor/services/errorService";
import { memoService } from "@/components/MemoEditor/services/memoService";
import { MemoSchema, Visibility } from "@/types/proto/api/v1/memo_service_pb";

const stableMocks = vi.hoisted(() => ({
  fetchSetting: vi.fn(async () => undefined),
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ userGeneralSetting: undefined }),
}));

vi.mock("@/contexts/InstanceContext", () => ({
  useInstance: () => ({
    aiSetting: { providers: [], transcription: undefined },
    fetchSetting: stableMocks.fetchSetting,
  }),
}));

vi.mock("@/hooks/useCurrentUser", () => ({
  default: () => ({ name: "users/test" }),
}));

vi.mock("@/components/MemoEditor/hooks", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/components/MemoEditor/hooks")>();
  return {
    ...actual,
    useAudioRecorder: () => ({
      startRecording: vi.fn(async () => undefined),
      stopRecording: vi.fn(() => false),
      resetRecording: vi.fn(),
      recordingStream: null,
    }),
    useFocusMode: vi.fn(),
    useKeyboard: vi.fn(),
  };
});

vi.mock("@/components/MemoEditor/components", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/components/MemoEditor/components")>();
  return {
    ...actual,
    AudioRecorderPanel: () => null,
    EditorMetadata: () => null,
    EditorToolbar: ({ onSave }: { onSave: () => void }) => (
      <button type="button" data-testid="save-memo" onClick={onSave}>
        Save
      </button>
    ),
    FocusModeExitButton: () => null,
    FocusModeOverlay: () => null,
    TimestampPopover: () => null,
  };
});

function makeWrapper() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: PropsWithChildren) => <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

describe("memo editor failed-save recovery", () => {
  beforeEach(() => {
    localStorage.clear();
    cacheService.clearAll();
    vi.clearAllMocks();
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
  });

  afterEach(() => {
    cacheService.clearAll();
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it("keeps a failed create locally and retries it with the same request id after remount", async () => {
    let rejectFirstSave: ((reason: unknown) => void) | undefined;
    const firstSave = new Promise<never>((_resolve, reject) => {
      rejectFirstSave = reject;
    });
    const saveSpy = vi.spyOn(memoService, "save").mockReturnValueOnce(firstSave);
    const classifySpy = vi.spyOn(errorService, "classifySaveError");
    const saveNowSpy = vi.spyOn(cacheService, "saveNow");
    const onConfirm = vi.fn();
    const cacheKey = "home-memo-editor";
    const draftKey = cacheService.key("users/test", cacheKey);
    const firstOpen = render(<MemoEditor cacheKey={cacheKey} onConfirm={onConfirm} />, { wrapper: makeWrapper() });

    const editor = await screen.findByRole("textbox");
    fireEvent.input(editor, { target: { value: "survives a lost response" } });
    fireEvent.click(screen.getByTestId("save-memo"));
    fireEvent.click(screen.getByTestId("save-memo"));

    expect(saveSpy).toHaveBeenCalledTimes(1);
    await act(async () => {
      rejectFirstSave?.(new ConnectError("Failed to fetch", Code.Unknown, undefined, undefined, new TypeError("Failed to fetch")));
      await firstSave.catch(() => undefined);
    });

    const failedNotice = await screen.findByRole("status");
    expect(classifySpy).toHaveReturnedWith("network");
    expect(saveNowSpy.mock.results[0]?.value).toBe(true);
    expect(saveNowSpy.mock.calls.map((call) => call[2]?.pending)).toEqual([true]);
    expect(within(failedNotice).getByRole("button")).toBeEnabled();
    expect(editor).toHaveValue("survives a lost response");

    const firstDraft = cacheService.loadDraft(draftKey);
    expect(firstDraft).toMatchObject({
      content: "survives a lost response",
      pending: true,
    });
    expect(firstDraft?.requestId).toBeTruthy();

    firstOpen.unmount();
    saveSpy.mockResolvedValueOnce({ memoName: `memos/${firstDraft?.requestId}`, hasChanges: true });
    render(<MemoEditor cacheKey={cacheKey} onConfirm={onConfirm} />, { wrapper: makeWrapper() });

    expect(await screen.findByRole("textbox")).toHaveValue("survives a lost response");
    const recoveredNotice = await screen.findByRole("status");
    fireEvent.click(within(recoveredNotice).getByRole("button"));

    await waitFor(() => expect(saveSpy).toHaveBeenCalledTimes(2));
    expect(saveSpy.mock.calls[1]?.[1]).toMatchObject({
      requestId: firstDraft?.requestId,
      retrying: true,
    });
    await waitFor(() => expect(onConfirm).toHaveBeenCalledWith(`memos/${firstDraft?.requestId}`));
    expect(cacheService.loadDraft(draftKey)).toBeNull();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("restores a failed edit after reload, retries it once, and clears the cache only after success", async () => {
    const memo = create(MemoSchema, {
      name: "memos/edit-retry",
      content: "server content",
      visibility: Visibility.PRIVATE,
      updateTime: timestampFromDate(new Date("2026-07-13T09:00:00.000Z")),
    });
    const cacheKey = `edit-${memo.name}`;
    const draftKey = cacheService.key("users/test", cacheKey);
    const saveSpy = vi
      .spyOn(memoService, "save")
      .mockRejectedValueOnce(new ConnectError("offline", Code.Unavailable))
      .mockResolvedValueOnce({ memoName: memo.name, hasChanges: true });
    const onConfirm = vi.fn();
    const firstOpen = render(<MemoEditor memo={memo} onConfirm={onConfirm} />, { wrapper: makeWrapper() });

    const editor = await screen.findByRole("textbox");
    fireEvent.input(editor, { target: { value: "local edit awaiting retry" } });
    fireEvent.click(screen.getByTestId("save-memo"));

    await screen.findByRole("status");
    expect(cacheService.loadDraft(draftKey)).toMatchObject({
      mode: "edit",
      memoName: memo.name,
      content: "local edit awaiting retry",
      pending: true,
    });

    firstOpen.unmount();
    render(<MemoEditor memo={memo} onConfirm={onConfirm} />, { wrapper: makeWrapper() });

    expect(await screen.findByRole("textbox")).toHaveValue("server content");
    const recoveryNotice = await screen.findByRole("status");
    const recoveryActions = within(recoveryNotice).getAllByRole("button");
    expect(recoveryActions).toHaveLength(2);
    fireEvent.click(recoveryActions[1]);

    await waitFor(() => expect(screen.getByRole("textbox")).toHaveValue("local edit awaiting retry"));
    await waitFor(() => expect(within(screen.getByRole("status")).getAllByRole("button")).toHaveLength(1));
    fireEvent.click(within(screen.getByRole("status")).getByRole("button"));

    await waitFor(() => expect(saveSpy).toHaveBeenCalledTimes(2));
    expect(saveSpy.mock.calls[1]?.[1]).toMatchObject({
      memoName: memo.name,
      retrying: true,
    });
    await waitFor(() => expect(onConfirm).toHaveBeenCalledWith(memo.name));
    expect(cacheService.loadDraft(draftKey)).toBeNull();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("keeps a validation rejection actionable and does not mislabel it as an offline save", async () => {
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const classifySpy = vi.spyOn(errorService, "classifySaveError");
    const saveSpy = vi
      .spyOn(memoService, "save")
      .mockRejectedValueOnce(new ConnectError("invalid memo", Code.InvalidArgument))
      .mockResolvedValueOnce({ memoName: "memos/validated", hasChanges: true });
    const onConfirm = vi.fn();
    const cacheKey = "validation-editor";
    const draftKey = cacheService.key("users/test", cacheKey);
    render(<MemoEditor cacheKey={cacheKey} onConfirm={onConfirm} />, { wrapper: makeWrapper() });

    const editor = await screen.findByRole("textbox");
    fireEvent.input(editor, { target: { value: "content rejected by server" } });
    fireEvent.click(screen.getByTestId("save-memo"));

    await waitFor(() => expect(classifySpy).toHaveReturnedWith("server"));
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(editor).toHaveValue("content rejected by server");
    expect(editor).not.toHaveAttribute("readonly");
    expect(cacheService.loadDraft(draftKey)).toMatchObject({
      content: "content rejected by server",
      pending: false,
    });

    fireEvent.input(editor, { target: { value: "corrected content" } });
    fireEvent.click(screen.getByTestId("save-memo"));

    await waitFor(() => expect(saveSpy).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(onConfirm).toHaveBeenCalledWith("memos/validated"));
    expect(cacheService.loadDraft(draftKey)).toBeNull();
  });
});
