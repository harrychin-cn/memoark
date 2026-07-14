import { create } from "@bufbuild/protobuf";
import { describe, expect, it, vi } from "vitest";
import {
  importPreparedMemoExport,
  MAX_MEMO_IMPORT_FILE_BYTES,
  type MemoImportClient,
  MemoImportFileError,
  previewMemoImportFile,
  readMemoImportFile,
} from "@/services/memoImportService";
import { MemoImportPreviewSchema, MemoImportResultSchema } from "@/types/proto/api/v1/memo_service_pb";

const makeFile = (name: string, content: string): File => {
  const bytes = new TextEncoder().encode(content);
  return {
    name,
    size: bytes.byteLength,
    arrayBuffer: vi.fn(async () => bytes.slice().buffer),
  } as unknown as File;
};

describe("memoImportService", () => {
  it("keeps the preflighted bytes and sends them to both generated RPCs", async () => {
    const preview = create(MemoImportPreviewSchema, { envelopeValid: true, canImport: true, total: 2 });
    const result = create(MemoImportResultSchema, { restored: 2, normal: 1, archived: 1 });
    const client: MemoImportClient = {
      previewMemoImport: vi.fn(async () => preview),
      importMemoExport: vi.fn(async () => result),
    };
    const file = makeFile("memoark-export.json", '{"format":"memoark.memo-export"}');

    const prepared = await previewMemoImportFile(file, client);
    const imported = await importPreparedMemoExport(prepared.data, client);

    expect(prepared.preview).toBe(preview);
    expect(imported).toBe(result);
    expect(client.previewMemoImport).toHaveBeenCalledOnce();
    expect(client.importMemoExport).toHaveBeenCalledOnce();
    expect(Array.from(vi.mocked(client.previewMemoImport).mock.calls[0][0].data)).toEqual(Array.from(prepared.data));
    expect(vi.mocked(client.importMemoExport).mock.calls[0][0].data).toBe(prepared.data);
  });

  it("rejects empty and non-JSON files before any RPC", async () => {
    await expect(readMemoImportFile(makeFile("empty.json", ""))).rejects.toMatchObject<Partial<MemoImportFileError>>({ code: "empty" });
    await expect(readMemoImportFile(makeFile("backup.txt", "{}"))).rejects.toMatchObject<Partial<MemoImportFileError>>({
      code: "not-json",
    });
  });

  it("rejects files larger than 64 MiB without reading them", async () => {
    const arrayBuffer = vi.fn(async () => new ArrayBuffer(1));
    const file = {
      name: "too-large.json",
      size: MAX_MEMO_IMPORT_FILE_BYTES + 1,
      arrayBuffer,
    } as unknown as File;

    await expect(readMemoImportFile(file)).rejects.toMatchObject<Partial<MemoImportFileError>>({ code: "too-large" });
    expect(arrayBuffer).not.toHaveBeenCalled();
  });
});
