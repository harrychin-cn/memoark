import EagleLetter from "./illustrations/EagleLetter.svg?url";
import OwlNote from "./illustrations/OwlNote.svg?url";
import ToucanBookmark from "./illustrations/ToucanBookmark.svg?url";

export interface BirdIllustration {
  name: string;
  src: string;
  motionDelay: string;
}

export const BIRD_ILLUSTRATIONS: BirdIllustration[] = [
  { name: "OwlNote", src: OwlNote, motionDelay: "0ms" },
  { name: "EagleLetter", src: EagleLetter, motionDelay: "-900ms" },
  { name: "ToucanBookmark", src: ToucanBookmark, motionDelay: "-1800ms" },
];

export function pickBirdIllustration(): BirdIllustration {
  return BIRD_ILLUSTRATIONS[Math.floor(Math.random() * BIRD_ILLUSTRATIONS.length)];
}
