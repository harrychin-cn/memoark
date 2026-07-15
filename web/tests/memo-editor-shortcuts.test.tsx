import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import Editor from "@/components/MemoEditor/Editor";

vi.mock("@/components/MemoEditor/Editor/TagSuggestions", () => ({
  default: () => null,
}));

vi.mock("@/components/MemoEditor/Editor/SlashCommands", () => ({
  default: () => null,
}));

function renderEditor(initialContent: string, options: { isInIME?: boolean; readOnly?: boolean } = {}) {
  const view = render(
    <Editor
      className=""
      initialContent={initialContent}
      placeholder="memo"
      onContentChange={vi.fn()}
      onPaste={vi.fn()}
      isInIME={options.isInIME}
      readOnly={options.readOnly}
    />,
  );

  return {
    textarea: screen.getByPlaceholderText("memo") as HTMLTextAreaElement,
    unmount: view.unmount,
  };
}

describe("memo editor markdown shortcuts", () => {
  it("wraps selected text with bold markdown for Ctrl+B and Cmd+B", () => {
    const { textarea } = renderEditor("read the docs");
    textarea.setSelectionRange(9, 13);

    fireEvent.keyDown(textarea, { key: "b", ctrlKey: true });

    expect(textarea).toHaveValue("read the **docs**");

    textarea.setSelectionRange(9, 17);
    fireEvent.keyDown(textarea, { key: "b", metaKey: true });

    expect(textarea).toHaveValue("read the docs");
  });

  it("wraps selected text with italics without stripping existing bold markdown", () => {
    const { textarea } = renderEditor("read the **docs**");
    textarea.setSelectionRange(9, 17);

    fireEvent.keyDown(textarea, { key: "i", ctrlKey: true });

    expect(textarea).toHaveValue("read the ***docs***");
  });

  it("removes italic markdown with Cmd+I", () => {
    const { textarea } = renderEditor("read the *docs*");
    textarea.setSelectionRange(9, 15);

    fireEvent.keyDown(textarea, { key: "i", metaKey: true });

    expect(textarea).toHaveValue("read the docs");
  });

  it("does not apply shortcuts while composing with an IME or in a read-only editor", () => {
    const { textarea: composingTextarea, unmount } = renderEditor("测试", { isInIME: true });
    composingTextarea.setSelectionRange(0, 2);

    fireEvent.keyDown(composingTextarea, { key: "b", ctrlKey: true });

    expect(composingTextarea).toHaveValue("测试");

    unmount();
    const { textarea: readOnlyTextarea } = renderEditor("read the docs", { readOnly: true });
    readOnlyTextarea.setSelectionRange(9, 13);

    fireEvent.keyDown(readOnlyTextarea, { key: "b", ctrlKey: true });

    expect(readOnlyTextarea).toHaveValue("read the docs");
  });

  it("does not take over Ctrl+K", () => {
    const { textarea } = renderEditor("read the docs");
    textarea.setSelectionRange(9, 13);

    expect(fireEvent.keyDown(textarea, { key: "k", ctrlKey: true })).toBe(true);
    expect(textarea).toHaveValue("read the docs");
  });
});
