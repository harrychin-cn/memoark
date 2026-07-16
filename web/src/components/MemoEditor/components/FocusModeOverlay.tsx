import { Minimize2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTranslate } from "@/utils/i18n";
import { FOCUS_MODE_STYLES } from "../constants";
import type { FocusModeExitButtonProps, FocusModeOverlayProps } from "../types";

export function FocusModeOverlay({ isActive, onToggle }: FocusModeOverlayProps) {
  const t = useTranslate();
  if (!isActive) return null;

  return <button type="button" className={FOCUS_MODE_STYLES.backdrop} onClick={onToggle} aria-label={t("editor.exit-focus-mode")} />;
}

export function FocusModeExitButton({ isActive, onToggle, title }: FocusModeExitButtonProps) {
  if (!isActive) return null;

  return (
    <Button variant="ghost" size="icon" className={FOCUS_MODE_STYLES.exitButton} onClick={onToggle} title={title}>
      <Minimize2Icon className="w-4 h-4" />
    </Button>
  );
}
