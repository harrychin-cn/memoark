import { describe, expect, it } from "vitest";
import { BIRD_ILLUSTRATIONS, pickBirdIllustration } from "@/components/Placeholder/birdIllustrations";
import { DEFAULT_MESSAGES, type PlaceholderVariant } from "@/components/Placeholder/messages";

describe("BIRD_ILLUSTRATIONS integrity", () => {
  it("registers a cohesive vector illustration family", () => {
    expect(BIRD_ILLUSTRATIONS.map((illustration) => illustration.name)).toEqual(["OwlNote", "EagleLetter", "ToucanBookmark"]);

    for (const illustration of BIRD_ILLUSTRATIONS) {
      expect(illustration.name).toMatch(/^[A-Z][A-Za-z]+$/);
      expect(illustration.src).toMatch(/(\.svg|data:image\/svg\+xml)/);
      expect(illustration.motionDelay).toMatch(/^-?\d+ms$/);
    }
  });

  it("returns a registered illustration from the pool", () => {
    const illustration = pickBirdIllustration();
    expect(BIRD_ILLUSTRATIONS).toContain(illustration);
  });
});

describe("DEFAULT_MESSAGES", () => {
  it("provides a non-empty message for every variant", () => {
    for (const variant of Object.keys(DEFAULT_MESSAGES) as PlaceholderVariant[]) {
      expect(DEFAULT_MESSAGES[variant], `variant=${variant}`).toBeTruthy();
      expect(DEFAULT_MESSAGES[variant].trim().length).toBeGreaterThan(0);
    }
  });
});
