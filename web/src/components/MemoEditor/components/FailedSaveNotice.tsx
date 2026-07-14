import { CloudOffIcon, RefreshCwIcon } from "lucide-react";
import type { FC } from "react";
import { Button } from "@/components/ui/button";
import { useTranslate } from "@/utils/i18n";

interface FailedSaveNoticeProps {
  savedAt: string;
  retrying: boolean;
  onRetry: () => void;
}

function formatSavedAt(savedAt: string): string | undefined {
  const date = new Date(savedAt);
  return Number.isNaN(date.getTime()) ? undefined : date.toLocaleString();
}

export const FailedSaveNotice: FC<FailedSaveNoticeProps> = ({ savedAt, retrying, onRetry }) => {
  const t = useTranslate();
  const savedAtLabel = formatSavedAt(savedAt);

  return (
    <div
      className="w-full flex flex-col sm:flex-row sm:items-center gap-2 rounded-md border border-amber-500/50 bg-amber-500/10 px-3 py-2"
      role="status"
    >
      <CloudOffIcon className="size-4 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">{t("editor.failed-save.title")}</p>
        <p className="text-xs text-muted-foreground">{t("editor.failed-save.description")}</p>
        {savedAtLabel && <p className="text-xs text-muted-foreground">{t("editor.failed-save.saved-at", { time: savedAtLabel })}</p>}
      </div>
      <Button type="button" size="sm" onClick={onRetry} disabled={retrying} className="shrink-0 self-end sm:self-center">
        <RefreshCwIcon className={retrying ? "animate-spin" : undefined} aria-hidden="true" />
        {retrying ? t("editor.failed-save.retrying") : t("editor.failed-save.retry")}
      </Button>
    </div>
  );
};
