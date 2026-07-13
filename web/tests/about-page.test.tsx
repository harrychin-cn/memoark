import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { TILE_SPRITES } from "@/components/Placeholder/tileSprites";
import About from "@/pages/About";

describe("<About>", () => {
  it("renders the MemoArk product story, attribution, and current bird sprites", () => {
    render(<About />);

    expect(screen.getByRole("heading", { name: "MemoArk" })).toBeInTheDocument();
    expect(screen.getByText(/Write freely/i)).toBeInTheDocument();
    expect(screen.getByText(/draft safety/i)).toBeInTheDocument();
    expect(screen.getByText(/independent project based on Memos v0.29.1/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /GitHub/i })).toHaveAttribute("href", "https://github.com/harrychin-cn/memoark");
    expect(screen.getByRole("link", { name: /Upstream/i })).toHaveAttribute("href", "https://github.com/usememos/memos");

    const birds = screen.getByRole("region", { name: "Birds" });
    expect(within(birds).getAllByTestId("about-bird-sprite")).toHaveLength(TILE_SPRITES.length);

    for (const sprite of TILE_SPRITES) {
      expect(within(birds).getByText(sprite.name)).toBeInTheDocument();
    }
  });
});
