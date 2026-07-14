import type { CSSProperties } from "react";
import { cn } from "@/lib/utils";
import type { BirdIllustration as BirdIllustrationAsset } from "./birdIllustrations";

interface BirdIllustrationProps {
  illustration: BirdIllustrationAsset;
  size?: number;
  className?: string;
  testId?: string;
}

const BirdIllustration = ({ illustration, size = 72, className, testId }: BirdIllustrationProps) => {
  const motionStyle = { "--memoark-bird-delay": illustration.motionDelay } as CSSProperties;

  return (
    <div
      aria-hidden="true"
      data-illustration-name={illustration.name}
      data-testid={testId}
      className={cn("memoark-bird-illustration relative shrink-0", className)}
      style={{ width: size, height: size, ...motionStyle }}
    >
      <img className="block size-full select-none" src={illustration.src} alt="" width="96" height="96" draggable={false} />
    </div>
  );
};

export default BirdIllustration;
