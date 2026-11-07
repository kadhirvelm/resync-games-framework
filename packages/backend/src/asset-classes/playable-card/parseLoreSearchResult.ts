import type { PlayableCardLoreSource } from "@resync-game-framework/api";
import { parseSearchPassages } from "src/product-now-lore/productNowLoreParsers";

const MAX_EXCERPTS = 4;

/**
 * Passages from a ProductNow search that belong to the Lore document.
 * When a Lore document id is configured, passages from other documents are
 * dropped. Without one, every passage the search returned is kept.
 * @param raw - MCP `search` tool result, either the payload or a content envelope
 * @param loreDocumentId - Configured Lore document, when there is one
 * @returns Up to four Lore excerpts
 */
export function parseLoreSearchResult(
  raw: unknown,
  loreDocumentId?: string,
): PlayableCardLoreSource[] {
  return parseSearchPassages(raw, {
    accept: ({ documentId }) =>
      loreDocumentId === undefined || documentId === loreDocumentId,
    fallbackTitle: "Lore",
    maxExcerpts: MAX_EXCERPTS,
  });
}
