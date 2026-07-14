import { create } from "@bufbuild/protobuf";
import {
  type ImportMemoExportRequest,
  ImportMemoExportRequestSchema,
  type MemoImportPreview,
  type MemoImportResult,
  type PreviewMemoImportRequest,
  PreviewMemoImportRequestSchema,
} from "@/types/proto/api/v1/memo_service_pb";

export const MAX_MEMO_IMPORT_FILE_BYTES = 64 * 1024 * 1024;

export type MemoImportFileErrorCode = "empty" | "not-json" | "too-large";

export class MemoImportFileError extends Error {
  constructor(
    readonly code: MemoImportFileErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "MemoImportFileError";
  }
}

export interface MemoImportClient {
  previewMemoImport: (request: PreviewMemoImportRequest) => Promise<MemoImportPreview>;
  importMemoExport: (request: ImportMemoExportRequest) => Promise<MemoImportResult>;
}

export interface PreparedMemoImport {
  data: Uint8Array;
  preview: MemoImportPreview;
}

const validateImportSize = (size: number) => {
  if (size <= 0) {
    throw new MemoImportFileError("empty", "The selected MemoArk export file is empty.");
  }
  if (size > MAX_MEMO_IMPORT_FILE_BYTES) {
    throw new MemoImportFileError("too-large", "The selected MemoArk export file is larger than 64 MiB.");
  }
};

export const readMemoImportFile = async (file: File): Promise<Uint8Array> => {
  if (!file.name.toLowerCase().endsWith(".json")) {
    throw new MemoImportFileError("not-json", "Select a MemoArk JSON export file.");
  }

  validateImportSize(file.size);
  const data = new Uint8Array(await file.arrayBuffer());
  validateImportSize(data.byteLength);
  return data;
};

export const previewMemoImportFile = async (file: File, client: MemoImportClient): Promise<PreparedMemoImport> => {
  const data = await readMemoImportFile(file);
  const preview = await client.previewMemoImport(create(PreviewMemoImportRequestSchema, { data }));
  return { data, preview };
};

export const importPreparedMemoExport = async (data: Uint8Array, client: MemoImportClient): Promise<MemoImportResult> => {
  validateImportSize(data.byteLength);
  return client.importMemoExport(create(ImportMemoExportRequestSchema, { data }));
};
