import { useQueryClient } from "@tanstack/react-query";
import { AlertTriangleIcon, CheckCircle2Icon, FileJsonIcon, LoaderCircleIcon } from "lucide-react";
import { useRef, useState } from "react";
import toast from "react-hot-toast";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { memoServiceClient } from "@/connect";
import { memoKeys } from "@/hooks/useMemoQueries";
import { userKeys } from "@/hooks/useUserQueries";
import { getErrorMessage, handleError } from "@/lib/error";
import { importPreparedMemoExport, type MemoImportClient, MemoImportFileError, previewMemoImportFile } from "@/services/memoImportService";
import type { MemoImportPreview, MemoImportResult, MemoImportSkippedCounts } from "@/types/proto/api/v1/memo_service_pb";
import { useTranslate } from "@/utils/i18n";

interface MemoImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  client?: MemoImportClient;
}

type ImportPhase = "select" | "preview" | "confirm" | "result";

const emptySkippedCounts: MemoImportSkippedCounts = {
  $typeName: "memos.api.v1.MemoImportSkippedCounts",
  attachments: 0,
  comments: 0,
  relations: 0,
  reactions: 0,
  locations: 0,
  settings: 0,
};

const MemoImportDialog = ({ open, onOpenChange, client = memoServiceClient }: MemoImportDialogProps) => {
  const t = useTranslate();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [phase, setPhase] = useState<ImportPhase>("select");
  const [busy, setBusy] = useState(false);
  const [filename, setFilename] = useState("");
  const [data, setData] = useState<Uint8Array>();
  const [preview, setPreview] = useState<MemoImportPreview>();
  const [result, setResult] = useState<MemoImportResult>();
  const [errorMessage, setErrorMessage] = useState("");

  const reset = () => {
    setPhase("select");
    setBusy(false);
    setFilename("");
    setData(undefined);
    setPreview(undefined);
    setResult(undefined);
    setErrorMessage("");
  };

  const handleOpenChange = (nextOpen: boolean) => {
    if (busy) {
      return;
    }
    if (!nextOpen) {
      reset();
    }
    onOpenChange(nextOpen);
  };

  const getLocalizedError = (error: unknown): string => {
    if (error instanceof MemoImportFileError) {
      switch (error.code) {
        case "empty":
          return t("setting.account.import-file-empty");
        case "not-json":
          return t("setting.account.import-file-not-json");
        case "too-large":
          return t("setting.account.import-file-too-large");
      }
    }
    return getErrorMessage(error, t("setting.account.import-error"));
  };

  const reportError = (error: unknown) => {
    const message = getLocalizedError(error);
    setErrorMessage(message);
    handleError(error, () => toast.error(message), { fallbackMessage: message });
  };

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || busy) {
      return;
    }

    setBusy(true);
    setFilename(file.name);
    setData(undefined);
    setPreview(undefined);
    setResult(undefined);
    setErrorMessage("");
    setPhase("select");
    try {
      const prepared = await previewMemoImportFile(file, client);
      setData(prepared.data);
      setPreview(prepared.preview);
      setPhase("preview");
    } catch (error) {
      reportError(error);
    } finally {
      setBusy(false);
    }
  };

  const handleImport = async () => {
    if (busy || !data || !preview?.canImport) {
      return;
    }

    setBusy(true);
    setErrorMessage("");
    try {
      const importResult = await importPreparedMemoExport(data, client);
      setResult(importResult);
      setPhase("result");
      await Promise.allSettled([
        queryClient.invalidateQueries({ queryKey: memoKeys.all }),
        queryClient.invalidateQueries({ queryKey: userKeys.stats() }),
      ]);
    } catch (error) {
      reportError(error);
    } finally {
      setBusy(false);
    }
  };

  const skipped = preview?.skipped ?? emptySkippedCounts;
  const restorableCount = (preview?.normal ?? 0) + (preview?.archived ?? 0);

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        size="lg"
        showCloseButton={!busy}
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          fileInputRef.current?.focus();
        }}
      >
        <DialogHeader>
          <DialogTitle>{t("setting.account.import-memos")}</DialogTitle>
          <DialogDescription>{t("setting.account.import-dialog-description")}</DialogDescription>
        </DialogHeader>

        {phase !== "result" && (
          <div className="space-y-1 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-sm">
            <p className="font-medium text-foreground">{t("setting.account.import-empty-account-only")}</p>
            <p className="text-muted-foreground">{t("setting.account.import-limitations")}</p>
          </div>
        )}

        {(phase === "select" || phase === "preview") && (
          <div className="space-y-2">
            <Input
              ref={fileInputRef}
              type="file"
              accept="application/json,.json"
              aria-label={t("setting.account.import-select-file")}
              disabled={busy}
              onChange={handleFileChange}
            />
            <p className="text-xs text-muted-foreground">{t("setting.account.import-file-help")}</p>
            {filename && <p className="truncate text-xs font-medium text-foreground">{filename}</p>}
          </div>
        )}

        {busy && phase === "select" && (
          <div role="status" className="flex items-center gap-2 rounded-lg border p-3 text-sm text-muted-foreground">
            <LoaderCircleIcon className="h-4 w-4 animate-spin" />
            {t("setting.account.import-previewing")}
          </div>
        )}

        {errorMessage && (
          <div
            role="alert"
            className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"
          >
            <AlertTriangleIcon className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}

        {phase === "preview" && preview && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-2 rounded-lg border p-3 text-sm sm:grid-cols-2">
              <div>
                <span className="text-muted-foreground">{t("setting.account.import-source-user")}: </span>
                <span className="font-medium">{preview.sourceUser || "—"}</span>
              </div>
              <div>
                <span className="text-muted-foreground">{t("setting.account.import-exported-at")}: </span>
                <span className="font-medium">{preview.exportedAt || "—"}</span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
              {[
                [t("setting.account.import-stat-total"), preview.total],
                [t("setting.account.import-stat-normal"), preview.normal],
                [t("setting.account.import-stat-archived"), preview.archived],
                [t("setting.account.import-stat-invalid"), preview.invalid],
                [t("setting.account.import-stat-unsupported"), preview.unsupported],
              ].map(([label, count]) => (
                <div key={String(label)} className="rounded-lg border p-2 text-center">
                  <div className="text-lg font-semibold">{count}</div>
                  <div className="text-xs text-muted-foreground">{label}</div>
                </div>
              ))}
            </div>

            <div className="space-y-2 rounded-lg border p-3">
              <p className="text-sm font-medium">{t("setting.account.import-skipped-title")}</p>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm sm:grid-cols-3">
                {[
                  [t("setting.account.import-skipped-attachments"), skipped.attachments],
                  [t("setting.account.import-skipped-comments"), skipped.comments],
                  [t("setting.account.import-skipped-relations"), skipped.relations],
                  [t("setting.account.import-skipped-reactions"), skipped.reactions],
                  [t("setting.account.import-skipped-locations"), skipped.locations],
                  [t("setting.account.import-skipped-settings"), skipped.settings],
                ].map(([label, count]) => (
                  <div key={String(label)} className="flex justify-between gap-2">
                    <span className="text-muted-foreground">{label}</span>
                    <span className="font-medium">{count}</span>
                  </div>
                ))}
              </div>
            </div>

            {preview.issues.length > 0 && (
              <div className="space-y-2 rounded-lg border p-3">
                <p className="text-sm font-medium">{t("setting.account.import-issues-title")}</p>
                <ul className="max-h-28 list-disc space-y-1 overflow-y-auto pl-5 text-xs text-muted-foreground">
                  {preview.issues.map((issue, index) => (
                    <li key={`${issue.recordIndex}-${issue.sourceName}-${index}`}>{issue.message}</li>
                  ))}
                </ul>
              </div>
            )}

            {!preview.canImport && (
              <div role="alert" className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm">
                <AlertTriangleIcon className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
                <div>
                  <p className="font-medium text-destructive">{t("setting.account.import-blocked")}</p>
                  <p className="text-muted-foreground">{preview.blockingReason || t("setting.account.import-error")}</p>
                </div>
              </div>
            )}
          </div>
        )}

        {phase === "confirm" && preview && (
          <div className="space-y-3 rounded-lg border p-4">
            <div className="flex items-center gap-2">
              <FileJsonIcon className="h-5 w-5 text-primary" />
              <p className="font-medium">{t("setting.account.import-confirm-title")}</p>
            </div>
            <p className="text-sm text-muted-foreground">{t("setting.account.import-confirm-description", { count: restorableCount })}</p>
          </div>
        )}

        {phase === "result" && result && (
          <div className="space-y-4">
            <div className="flex items-start gap-3 rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-4">
              <CheckCircle2Icon className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
              <div className="space-y-1">
                <p className="font-medium">{t("setting.account.import-result-title")}</p>
                <p className="text-sm text-muted-foreground">
                  {t("setting.account.import-result-summary", {
                    restored: result.restored,
                    skipped: result.skippedTotal,
                    failed: result.failed,
                  })}
                </p>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2 text-center">
              {[
                [t("setting.account.import-result-normal"), result.normal],
                [t("setting.account.import-result-archived"), result.archived],
                [t("setting.account.import-result-failed"), result.failed],
              ].map(([label, count]) => (
                <div key={String(label)} className="rounded-lg border p-3">
                  <div className="text-lg font-semibold">{count}</div>
                  <div className="text-xs text-muted-foreground">{label}</div>
                </div>
              ))}
            </div>
            {result.warnings.length > 0 && (
              <div className="space-y-2 rounded-lg border p-3">
                <p className="text-sm font-medium">{t("setting.account.import-warnings-title")}</p>
                <ul className="list-disc space-y-1 pl-5 text-xs text-muted-foreground">
                  {result.warnings.map((warning, index) => (
                    <li key={`${warning}-${index}`}>{warning}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          {phase === "result" ? (
            <Button disabled={busy} onClick={() => handleOpenChange(false)}>
              {t("setting.account.import-done")}
            </Button>
          ) : (
            <>
              <Button variant="ghost" disabled={busy} onClick={() => handleOpenChange(false)}>
                {t("common.cancel")}
              </Button>
              {phase === "preview" && (
                <Button disabled={busy || !preview?.canImport} onClick={() => setPhase("confirm")}>
                  {t("setting.account.import-continue")}
                </Button>
              )}
              {phase === "confirm" && (
                <Button disabled={busy} onClick={handleImport}>
                  {busy ? t("setting.account.importing") : t("setting.account.import-memos")}
                </Button>
              )}
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default MemoImportDialog;
