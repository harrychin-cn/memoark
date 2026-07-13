import { AlertTriangleIcon, FileClockIcon } from "lucide-react";
import type { FC } from "react";
import { Button } from "@/components/ui/button";
import { useTranslate } from "@/utils/i18n";

interface DraftRecoveryNoticeProps {
  savedAt?: string;
  hasServerChanges: boolean;
  onRestore: () => void;
  onDiscard: () => void;
}

function formatSavedAt(savedAt?: string): string | undefined {
  if (!savedAt) return undefined;

  const date = new Date(savedAt);
  return Number.isNaN(date.getTime()) ? undefined : date.toLocaleString();
}

export const DraftRecoveryNotice: FC<DraftRecoveryNoticeProps> = ({ savedAt, hasServerChanges, onRestore, onDiscard }) => {
  const t = useTranslate();
  const savedAtLabel = formatSavedAt(savedAt);
  const Icon = hasServerChanges ? AlertTriangleIcon : FileClockIcon;

  return (
    <div
      className={
        hasServerChanges
          ? "w-full flex flex-col sm:flex-row sm:items-center gap-2 rounded-md border border-amber-500/50 bg-amber-500/10 px-3 py-2"
          : "w-full flex flex-col sm:flex-row sm:items-center gap-2 rounded-md border border-border bg-muted/50 px-3 py-2"
      }
      role="status"
    >
      <Icon
        className={hasServerChanges ? "size-4 shrink-0 text-amber-600 dark:text-amber-400" : "size-4 shrink-0 text-muted-foreground"}
        aria-hidden="true"
      />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">{t("editor.draft-recovery.title")}</p>
        <p className="text-xs text-muted-foreground">
          {t(hasServerChanges ? "editor.draft-recovery.conflict-description" : "editor.draft-recovery.description")}
        </p>
        {savedAtLabel && <p className="text-xs text-muted-foreground">{t("editor.draft-recovery.saved-at", { time: savedAtLabel })}</p>}
      </div>
      <div className="flex shrink-0 items-center gap-1 self-end sm:self-center">
        <Button type="button" variant="ghost" size="sm" onClick={onDiscard}>
          {t("editor.draft-recovery.discard")}
        </Button>
        <Button type="button" size="sm" onClick={onRestore}>
          {t("editor.draft-recovery.restore")}
        </Button>
      </div>
    </div>
  );
};
