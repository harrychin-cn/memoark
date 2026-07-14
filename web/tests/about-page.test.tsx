import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { BIRD_ILLUSTRATIONS } from "@/components/Placeholder/birdIllustrations";
import About from "@/pages/About";

describe("<About>", () => {
  it("renders the MemoArk product story, attribution, and current vector bird family", () => {
    render(<About />);

    expect(screen.getByRole("heading", { name: "MemoArk" })).toBeInTheDocument();
    expect(screen.getByText(/Write freely/i)).toBeInTheDocument();
    expect(screen.getByText(/draft safety/i)).toBeInTheDocument();
    expect(screen.getByText(/independent project based on Memos v0.29.1/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /GitHub/i })).toHaveAttribute("href", "https://github.com/harrychin-cn/memoark");
    expect(screen.getByRole("link", { name: /Upstream/i })).toHaveAttribute("href", "https://github.com/usememos/memos");

    const birds = screen.getByRole("region", { name: "Birds" });
    expect(within(birds).getAllByTestId("about-bird-illustration")).toHaveLength(BIRD_ILLUSTRATIONS.length);

    for (const illustration of BIRD_ILLUSTRATIONS) {
      expect(within(birds).getByText(illustration.name)).toBeInTheDocument();
    }
  });
});
