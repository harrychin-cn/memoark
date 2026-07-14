import { create } from "@bufbuild/protobuf";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { PropsWithChildren } from "react";
import { describe, expect, it, vi } from "vitest";
import MemoImportDialog from "@/components/Settings/MemoImportDialog";
import { memoKeys } from "@/hooks/useMemoQueries";
import { userKeys } from "@/hooks/useUserQueries";
import type { MemoImportClient } from "@/services/memoImportService";
import { MemoImportPreviewSchema, MemoImportResultSchema, MemoImportSkippedCountsSchema } from "@/types/proto/api/v1/memo_service_pb";

vi.mock("@/connect", () => ({
  memoServiceClient: {},
}));

vi.mock("@/utils/i18n", () => ({
  useTranslate: () => (key: string, params?: Record<string, unknown>) =>
    params
      ? `${key} ${Object.entries(params)
          .map(([name, value]) => `${name}=${value}`)
          .join(" ")}`
      : key,
}));

const makeFile = (): File => {
  const bytes = new TextEncoder().encode('{"format":"memoark.memo-export"}');
  return {
    name: "memoark-export.json",
    size: bytes.byteLength,
    arrayBuffer: vi.fn(async () => bytes.slice().buffer),
  } as unknown as File;
};

const makeClient = (preview = create(MemoImportPreviewSchema), result = create(MemoImportResultSchema)): MemoImportClient => ({
  previewMemoImport: vi.fn(async () => preview),
  importMemoExport: vi.fn(async () => result),
});

const renderDialog = (client: MemoImportClient) => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  const onOpenChange = vi.fn();
  const Wrapper = ({ children }: PropsWithChildren) => <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;

  render(<MemoImportDialog open onOpenChange={onOpenChange} client={client} />, { wrapper: Wrapper });
  return { onOpenChange, queryClient };
};

const selectFile = () => {
  fireEvent.change(screen.getByLabelText("setting.account.import-select-file"), { target: { files: [makeFile()] } });
};

describe("<MemoImportDialog>", () => {
  it("moves focus to the file selector when opened", async () => {
    renderDialog(makeClient());

    await waitFor(() => expect(screen.getByLabelText("setting.account.import-select-file")).toHaveFocus());
  });

  it("previews, explicitly confirms, imports once, and invalidates memo and stats caches", async () => {
    const preview = create(MemoImportPreviewSchema, {
      envelopeValid: true,
      canImport: true,
      total: 7,
      normal: 2,
      archived: 1,
      invalid: 0,
      unsupported: 4,
      sourceUser: "alice",
      exportedAt: "2026-07-13T12:34:56Z",
      skipped: create(MemoImportSkippedCountsSchema, { attachments: 2, comments: 1, relations: 1 }),
    });
    const result = create(MemoImportResultSchema, {
      restored: 3,
      skippedTotal: 4,
      failed: 0,
      normal: 2,
      archived: 1,
    });
    const client = makeClient(preview, result);
    const { queryClient } = renderDialog(client);
    const memoQueryKey = [...memoKeys.lists(), "cached"];
    const statsQueryKey = [...userKeys.stats(), "cached"];
    queryClient.setQueryData(memoQueryKey, { memos: [] });
    queryClient.setQueryData(statsQueryKey, { memoCount: 0 });

    selectFile();

    expect(await screen.findByText("alice")).toBeInTheDocument();
    expect(screen.getByText("2026-07-13T12:34:56Z")).toBeInTheDocument();
    expect(screen.getByText("setting.account.import-stat-total").previousElementSibling).toHaveTextContent("7");
    expect(screen.getByText("setting.account.import-stat-normal").previousElementSibling).toHaveTextContent("2");
    expect(screen.getByText("setting.account.import-stat-archived").previousElementSibling).toHaveTextContent("1");
    expect(screen.getByText("setting.account.import-stat-invalid").previousElementSibling).toHaveTextContent("0");
    expect(screen.getByText("setting.account.import-stat-unsupported").previousElementSibling).toHaveTextContent("4");
    expect(screen.getByText("setting.account.import-skipped-attachments").nextElementSibling).toHaveTextContent("2");
    expect(client.importMemoExport).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "setting.account.import-continue" }));
    expect(screen.getByText("setting.account.import-confirm-title")).toBeInTheDocument();
    expect(screen.getByText("setting.account.import-confirm-description count=3")).toBeInTheDocument();
    expect(client.importMemoExport).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "setting.account.import-memos" }));

    expect(await screen.findByText("setting.account.import-result-title")).toBeInTheDocument();
    expect(screen.getByText("setting.account.import-result-summary restored=3 skipped=4 failed=0")).toBeInTheDocument();
    expect(client.importMemoExport).toHaveBeenCalledOnce();
    await waitFor(() => {
      expect(queryClient.getQueryState(memoQueryKey)?.isInvalidated).toBe(true);
      expect(queryClient.getQueryState(statsQueryKey)?.isInvalidated).toBe(true);
    });
  });

  it.each([
    ["a non-empty target", true, "This account already has memos."],
    ["a wrong export version", false, "Unsupported MemoArk export version."],
  ])("blocks confirmation for %s", async (_caseName, envelopeValid, blockingReason) => {
    const client = makeClient(
      create(MemoImportPreviewSchema, {
        envelopeValid,
        canImport: false,
        blockingReason,
        total: envelopeValid ? 1 : 0,
      }),
    );
    renderDialog(client);

    selectFile();

    expect(await screen.findByText(blockingReason)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "setting.account.import-continue" })).toBeDisabled();
    expect(client.importMemoExport).not.toHaveBeenCalled();
  });

  it("can be cancelled after preflight without writing anything", async () => {
    const client = makeClient(create(MemoImportPreviewSchema, { envelopeValid: true, canImport: true, total: 1 }));
    const { onOpenChange } = renderDialog(client);

    selectFile();
    await screen.findByRole("button", { name: "setting.account.import-continue" });
    fireEvent.click(screen.getByRole("button", { name: "setting.account.import-continue" }));
    fireEvent.click(screen.getByRole("button", { name: "common.cancel" }));

    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(client.importMemoExport).not.toHaveBeenCalled();
  });

  it("shows an understandable import error and retries only when explicitly requested", async () => {
    const preview = create(MemoImportPreviewSchema, {
      envelopeValid: true,
      canImport: true,
      total: 1,
      normal: 1,
    });
    const result = create(MemoImportResultSchema, { restored: 1, normal: 1 });
    const client = makeClient(preview, result);
    vi.mocked(client.importMemoExport)
      .mockRejectedValueOnce(new Error("Import service unavailable"))
      .mockResolvedValueOnce(result);
    renderDialog(client);

    selectFile();
    fireEvent.click(await screen.findByRole("button", { name: "setting.account.import-continue" }));
    fireEvent.click(screen.getByRole("button", { name: "setting.account.import-memos" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Import service unavailable");
    expect(client.importMemoExport).toHaveBeenCalledOnce();
    expect(screen.queryByText("setting.account.import-result-title")).not.toBeInTheDocument();

    const retryButton = screen.getByRole("button", { name: "setting.account.import-memos" });
    await waitFor(() => expect(retryButton).toBeEnabled());
    fireEvent.click(retryButton);

    expect(await screen.findByText("setting.account.import-result-title")).toBeInTheDocument();
    expect(client.importMemoExport).toHaveBeenCalledTimes(2);
    expect(vi.mocked(client.importMemoExport).mock.calls[1][0].data).toBe(vi.mocked(client.importMemoExport).mock.calls[0][0].data);
  });
});
