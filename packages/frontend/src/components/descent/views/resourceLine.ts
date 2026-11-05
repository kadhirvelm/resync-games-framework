import { resourceIconSrc } from "./text";

/** One slice of a cost line: plain copy, or a resource shown as its icon. */
export type ResourceLinePart =
  | { key: string; kind: "text"; text: string }
  | { iconSrc: string; key: string; kind: "resource"; name: string };

/** Resource words that cost lines print, longest first so "Spirit Herbs" wins. */
const RESOURCE_WORDS: readonly { iconSrc: string; name: string }[] = [
  { iconSrc: resourceIconSrc("spirit_herbs"), name: "Spirit Herbs" },
  { iconSrc: resourceIconSrc("coin"), name: "Coin" },
  { iconSrc: resourceIconSrc("essence"), name: "Essence" },
  { iconSrc: resourceIconSrc("food"), name: "Food" },
  { iconSrc: resourceIconSrc("iron"), name: "Iron" },
  { iconSrc: resourceIconSrc("spirit_herbs"), name: "Herbs" },
  { iconSrc: resourceIconSrc("stone"), name: "Stone" },
  { iconSrc: resourceIconSrc("water"), name: "Water" },
  { iconSrc: resourceIconSrc("wood"), name: "Wood" },
];

const RESOURCE_WORD = new RegExp(
  `\\b(?:${RESOURCE_WORDS.map((entry) => entry.name.replace(" ", "\\s+")).join("|")})\\b`,
  "g",
);

const ICON_BY_NAME = new Map(
  RESOURCE_WORDS.map((entry) => [entry.name, entry.iconSrc]),
);

/**
 * Splits a cost line so each resource name can render as its HUD icon.
 * Amounts, separators, and other words stay as text. Names that are not
 * stockpile resources are left alone.
 * @param text - A cost or status line such as "Food 30 · Water 15 · 4s"
 * @returns Ordered text and resource parts covering the whole line
 */
export function resourceLineParts(text: string): ResourceLinePart[] {
  const parts: ResourceLinePart[] = [];
  let cursor = 0;
  for (const match of text.matchAll(RESOURCE_WORD)) {
    const name = match[0]?.replace(/\s+/g, " ");
    const index = match.index ?? 0;
    const iconSrc = name === undefined ? undefined : ICON_BY_NAME.get(name);
    if (iconSrc === undefined) continue;
    if (index > cursor) {
      parts.push({
        key: `text-${cursor}`,
        kind: "text",
        text: text.slice(cursor, index),
      });
    }
    parts.push({ iconSrc, key: `resource-${index}`, kind: "resource", name });
    cursor = index + match[0].length;
  }
  if (cursor < text.length) {
    parts.push({
      key: `text-${cursor}`,
      kind: "text",
      text: text.slice(cursor),
    });
  }
  if (parts.length === 0) return [{ key: "text-0", kind: "text", text }];
  return parts;
}
