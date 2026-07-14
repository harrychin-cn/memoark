import { type ReactNode, useState } from "react";
import { cn } from "@/lib/utils";
import BirdIllustration from "./BirdIllustration";
import { pickBirdIllustration } from "./birdIllustrations";
import { DEFAULT_MESSAGES, type PlaceholderVariant } from "./messages";

interface PlaceholderProps {
  variant: PlaceholderVariant;
  message?: string;
  children?: ReactNode;
  className?: string;
}

const Placeholder = ({ variant, message, children, className }: PlaceholderProps) => {
  const [illustration] = useState(pickBirdIllustration);
  const resolvedMessage = message ?? DEFAULT_MESSAGES[variant];
  const isLoading = variant === "loading";

  return (
    <div
      role={isLoading ? "status" : undefined}
      aria-live={isLoading ? "polite" : undefined}
      className={cn("flex flex-col items-center justify-center max-w-md mx-auto px-4 py-8", className)}
    >
      <BirdIllustration illustration={illustration} size={72} testId="placeholder-illustration" />
      <p className="mt-3 font-mono text-sm text-muted-foreground">{resolvedMessage}</p>
      {children && <div className="mt-4">{children}</div>}
    </div>
  );
};

export default Placeholder;
