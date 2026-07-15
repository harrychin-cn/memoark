import type { Root, Text } from "mdast";
import type { Position, Node as UnistNode } from "unist";
import type { TagNode, TagNodeData } from "@/types/markdown";

const MAX_TAG_LENGTH = 100;

type Segment = { type: "text"; value: string } | { type: "tag"; value: string };

function isTagChar(char: string): boolean {
  if (/\p{L}/u.test(char)) {
    return true;
  }

  if (/\p{M}/u.test(char)) {
    return true;
  }

  if (/\p{N}/u.test(char)) {
    return true;
  }

  if (/\p{S}/u.test(char)) {
    return true;
  }

  return char === "_" || char === "-" || char === "/" || char === "&";
}

function isAsciiPunctuation(char: string): boolean {
  if (char.length !== 1) {
    return false;
  }

  const code = char.charCodeAt(0);
  return (
    (code >= 0x21 && code <= 0x2f) || (code >= 0x3a && code <= 0x40) || (code >= 0x5b && code <= 0x60) || (code >= 0x7b && code <= 0x7e)
  );
}

function unescapeBackslashes(source: string): { chars: string[]; escaped: boolean[] } {
  const codePoints = [...source];
  const chars: string[] = [];
  const escaped: boolean[] = [];

  for (let i = 0; i < codePoints.length; i++) {
    if (codePoints[i] === "\\" && i + 1 < codePoints.length && isAsciiPunctuation(codePoints[i + 1])) {
      chars.push(codePoints[i + 1]);
      escaped.push(true);
      i++;
      continue;
    }
    chars.push(codePoints[i]);
    escaped.push(false);
  }

  return { chars, escaped };
}

function parseSegments(chars: string[], escaped: boolean[]): Segment[] {
  const segments: Segment[] = [];

  let i = 0;

  while (i < chars.length) {
    if (chars[i] === "#" && !escaped[i] && i + 1 < chars.length && isTagChar(chars[i + 1])) {
      const prevChar = i > 0 ? chars[i - 1] : "";
      const nextChar = chars[i + 1];

      if (prevChar === "#" || nextChar === "#" || nextChar === " ") {
        segments.push({ type: "text", value: chars[i] });
        i++;
        continue;
      }

      let j = i + 1;
      while (j < chars.length && isTagChar(chars[j])) {
        j++;
      }

      const tagContent = chars.slice(i + 1, j).join("");

      const runeCount = [...tagContent].length;
      if (runeCount > 0 && runeCount <= MAX_TAG_LENGTH) {
        segments.push({ type: "tag", value: tagContent });
        i = j;
        continue;
      }
    }

    let j = i + 1;
    while (j < chars.length && !(chars[j] === "#" && !escaped[j])) {
      j++;
    }
    segments.push({ type: "text", value: chars.slice(i, j).join("") });
    i = j;
  }

  return segments;
}

function segmentsForTextNode(value: string, position: Position | undefined, source: string): Segment[] {
  const startOffset = position?.start?.offset;
  const endOffset = position?.end?.offset;

  if (source && startOffset != null && endOffset != null) {
    const slice = source.slice(startOffset, endOffset);
    const { chars, escaped } = unescapeBackslashes(slice);
    if (chars.join("") === value) {
      return parseSegments(chars, escaped);
    }
  }

  const chars = [...value];
  return parseSegments(
    chars,
    chars.map(() => false),
  );
}

function createTagNode(tagValue: string): TagNode {
  const data: TagNodeData = {
    hName: "span",
    hProperties: {
      className: "tag",
      "data-tag": tagValue,
    },
    hChildren: [{ type: "text", value: `#${tagValue}` }],
  };

  return {
    type: "tagNode",
    value: tagValue,
    data,
  } as TagNode;
}

type ParentNode = UnistNode & { children: UnistNode[] };

function isParentNode(node: UnistNode): node is ParentNode {
  return Array.isArray((node as { children?: unknown }).children);
}

function isLinkNode(node: UnistNode): boolean {
  return node.type === "link" || node.type === "linkReference";
}

function transformTagTextNodes(parent: ParentNode, insideLink: boolean, source: string): void {
  for (let index = 0; index < parent.children.length; index++) {
    const child = parent.children[index];
    const childInsideLink = insideLink || isLinkNode(child);

    if (child.type === "text" && !childInsideLink) {
      const textNode = child as Text;
      const segments = segmentsForTextNode(textNode.value, textNode.position, source);

      if (segments.every((seg) => seg.type === "text")) {
        continue;
      }

      const newNodes = segments.map((segment) => {
        if (segment.type === "tag") {
          return createTagNode(segment.value);
        }
        return {
          type: "text",
          value: segment.value,
        } as Text;
      });

      parent.children.splice(index, 1, ...(newNodes as UnistNode[]));
      index += newNodes.length - 1;
      continue;
    }

    if (isParentNode(child)) {
      transformTagTextNodes(child, childInsideLink, source);
    }
  }
}

type VFileLike = { value?: string | Uint8Array };

export const remarkTag = () => {
  return (tree: Root, file: VFileLike) => {
    const source = typeof file?.value === "string" ? file.value : "";
    transformTagTextNodes(tree as ParentNode, false, source);
  };
};
