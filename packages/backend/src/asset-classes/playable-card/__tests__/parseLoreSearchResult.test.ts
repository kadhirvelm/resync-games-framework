import { describe, expect, test } from "bun:test";
import { parseLoreSearchResult } from "../parseLoreSearchResult";

const LORE_DOCUMENT_ID = "configured-lore-document";

const loreExcerpt =
  "The earliest recorded Coreborn bond belongs to Licensed Climber Tamsin Korr on floor 4.";

describe("parseLoreSearchResult", () => {
  test("keeps Lore passages and drops other documents in the same result", () => {
    const sources = parseLoreSearchResult(
      {
        sources: [
          {
            document: {
              documentId: "4d910971-c925-497c-b7b7-f2a269367289",
              name: "Towers of Coreborn",
            },
            excerpts: [{ content: "Status effects are cut from scope." }],
            id: "4d910971-c925-497c-b7b7-f2a269367289",
            title: "Towers of Coreborn",
            url: "https://app.productnow.ai/design",
          },
          {
            document: { documentId: LORE_DOCUMENT_ID, name: "Lore" },
            excerpts: [{ content: `  ${loreExcerpt}  ` }, { content: "   " }],
            id: LORE_DOCUMENT_ID,
            title: "Lore",
            url: "https://app.productnow.ai/lore",
          },
        ],
      },
      LORE_DOCUMENT_ID,
    );

    expect(sources).toEqual([
      {
        documentId: LORE_DOCUMENT_ID,
        excerpt: loreExcerpt,
        title: "Lore",
        url: "https://app.productnow.ai/lore",
      },
    ]);
  });

  test("reads a Lore search wrapped in an MCP text envelope", () => {
    const sources = parseLoreSearchResult(
      {
        content: [
          {
            text: JSON.stringify({
              sources: [
                {
                  document: { documentId: LORE_DOCUMENT_ID, name: "Lore" },
                  excerpts: [{ content: loreExcerpt }],
                  title: "Lore",
                  url: "https://app.productnow.ai/lore",
                },
              ],
            }),
            type: "text",
          },
        ],
      },
      LORE_DOCUMENT_ID,
    );

    expect(sources).toHaveLength(1);
    expect(sources[0]?.excerpt).toBe(loreExcerpt);
  });

  test("keeps every passage when no Lore document is configured", () => {
    const sources = parseLoreSearchResult({
      sources: [
        {
          document: { documentId: "design", name: "Design" },
          excerpts: [{ content: "Status effects are cut from scope." }],
          title: "Design",
          url: "https://example.test/design",
        },
        {
          document: { documentId: "lore", name: "Lore" },
          excerpts: [{ content: loreExcerpt }],
          title: "Lore",
          url: "https://example.test/lore",
        },
      ],
    });

    expect(sources.map((source) => source.documentId)).toEqual([
      "design",
      "lore",
    ]);
  });

  test("returns nothing when the Lore document is absent", () => {
    expect(parseLoreSearchResult({ sources: [] })).toEqual([]);
    expect(parseLoreSearchResult("not json")).toEqual([]);
  });
});
