import type { PlayableCardLoreSource } from "@resync-game-framework/api";
import { parseSearchPassages } from "src/product-now-lore/productNowLoreParsers";
import { LORE_DOCUMENT_ID } from "./playableCardSpec";

const MAX_EXCERPTS = 4;

/**
 * Passages from a ProductNow search that belong to the Lore document.
 * Other documents in the same result are dropped.
 * @param raw - MCP `search` tool result, either the payload or a content envelope
 * @returns Up to four Lore excerpts
 */
export function parseLoreSearchResult(raw: unknown): PlayableCardLoreSource[] {
  return parseSearchPassages(raw, {
    accept: ({ documentId }) => documentId === LORE_DOCUMENT_ID,
    fallbackTitle: "Lore",
    maxExcerpts: MAX_EXCERPTS,
  });
}
