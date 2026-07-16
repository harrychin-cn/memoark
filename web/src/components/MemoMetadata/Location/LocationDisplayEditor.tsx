import { MapPinIcon, XIcon } from "lucide-react";
import type { FC } from "react";
import { cn } from "@/lib/utils";
import type { Location } from "@/types/proto/api/v1/memo_service_pb";
import { useTranslate } from "@/utils/i18n";
import { getLocationCoordinatesText, getLocationDisplayText } from "./locationHelpers";

interface LocationDisplayEditorProps {
  location: Location;
  onRemove?: () => void;
  className?: string;
}

const LocationDisplayEditor: FC<LocationDisplayEditorProps> = ({ location, onRemove, className }) => {
  const t = useTranslate();
  const displayText = getLocationDisplayText(location);

  return (
    <div
      className={cn(
        "relative flex items-center gap-1.5 px-1.5 py-1 rounded border border-border bg-muted/20 hover:bg-accent/20 transition-all w-full",
        className,
      )}
    >
      <MapPinIcon className="w-3.5 h-3.5 shrink-0 text-muted-foreground" />

      <div className="flex items-center gap-1.5 min-w-0 flex-1">
        <span className="text-xs truncate" title={displayText}>
          {displayText}
        </span>
        <span className="text-[11px] text-muted-foreground shrink-0 hidden sm:inline">{getLocationCoordinatesText(location)}</span>
      </div>

      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          className="p-0.5 rounded hover:bg-destructive/10 active:bg-destructive/10 transition-colors touch-manipulation shrink-0 ml-auto"
          title={t("common.delete")}
          aria-label={t("ui.remove-location")}
        >
          <XIcon className="w-3 h-3 text-muted-foreground hover:text-destructive" />
        </button>
      )}
    </div>
  );
};

export default LocationDisplayEditor;
