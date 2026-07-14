import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import Placeholder from "@/components/Placeholder";
import { DEFAULT_MESSAGES } from "@/components/Placeholder/messages";

describe("<Placeholder>", () => {
  it("renders the default message for variant=empty", () => {
    render(<Placeholder variant="empty" />);
    expect(screen.getByText(DEFAULT_MESSAGES.empty)).toBeInTheDocument();
  });

  it("renders the default message for variant=loading", () => {
    render(<Placeholder variant="loading" />);
    expect(screen.getByText(DEFAULT_MESSAGES.loading)).toBeInTheDocument();
  });

  it("renders the default message for variant=noResults", () => {
    render(<Placeholder variant="noResults" />);
    expect(screen.getByText(DEFAULT_MESSAGES.noResults)).toBeInTheDocument();
  });

  it("renders the default message for variant=notFound", () => {
    render(<Placeholder variant="notFound" />);
    expect(screen.getByText(DEFAULT_MESSAGES.notFound)).toBeInTheDocument();
  });

  it("overrides the default message when `message` prop is passed", () => {
    render(<Placeholder variant="empty" message="Custom copy goes here" />);
    expect(screen.getByText("Custom copy goes here")).toBeInTheDocument();
    expect(screen.queryByText(DEFAULT_MESSAGES.empty)).not.toBeInTheDocument();
  });

  it("renders a smooth scalable vector illustration", () => {
    const { container } = render(<Placeholder variant="empty" />);
    const illustration = screen.getByTestId("placeholder-illustration");
    const image = illustration.firstElementChild;

    expect(illustration).toHaveAttribute("aria-hidden", "true");
    expect(illustration).toHaveAttribute("data-illustration-name", expect.stringMatching(/^(OwlNote|EagleLetter|ToucanBookmark)$/));
    expect(illustration).toHaveStyle({
      width: "72px",
      height: "72px",
    });
    expect(image).toHaveAttribute("src", expect.stringMatching(/(\.svg|data:image\/svg\+xml)/));
    expect(image).toHaveAttribute("width", "96");
    expect(image).toHaveAttribute("height", "96");
    expect((image as HTMLElement).style.imageRendering).toBe("");
    expect(container.firstChild).toHaveClass("max-w-md");
  });

  it("does not render registry credit strings in the UI", () => {
    render(<Placeholder variant="empty" />);
    expect(screen.queryByText(/Memos original ASCII art/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/jgs|Joan Stark/i)).not.toBeInTheDocument();
  });

  it('applies role="status" and aria-live="polite" ONLY when variant=loading', () => {
    const { rerender, container } = render(<Placeholder variant="empty" />);
    expect(container.querySelector('[role="status"]')).toBeNull();

    rerender(<Placeholder variant="loading" />);
    const live = container.querySelector('[role="status"]');
    expect(live).not.toBeNull();
    expect(live).toHaveAttribute("aria-live", "polite");
  });

  it("renders children below the message when provided", () => {
    render(
      <Placeholder variant="notFound">
        <button type="button">Go home</button>
      </Placeholder>,
    );
    expect(screen.getByRole("button", { name: "Go home" })).toBeInTheDocument();
  });

  it("merges a custom className onto the outer wrapper", () => {
    const { container } = render(<Placeholder variant="empty" className="custom-test-class" />);
    expect(container.firstChild).toHaveClass("custom-test-class");
  });
});
