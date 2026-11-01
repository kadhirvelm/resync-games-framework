import { describe, expect, test } from "bun:test";
import {
  htmlToPlainText,
  parseEditStatus,
  parseFetchedDocument,
  parseFolderListing,
  parseSearchPassages,
  parseWriteResult,
} from "../productNowLoreParsers";

const folderId = "folder-1";

describe("productNow lore parsers", () => {
  test("keeps search passages filed in the requested folder", () => {
    const passages = parseSearchPassages(
      {
        content: [
          {
            text: JSON.stringify({
              sources: [
                {
                  document: { documentId: "doc-1", folderId },
                  excerpts: [{ content: "  The Verity waits.  " }],
                  title: "Lore",
                  url: "https://example.test/lore",
                },
                {
                  document: { documentId: "doc-2", folderId: "other" },
                  excerpts: [{ content: "A different game." }],
                  title: "Elsewhere",
                  url: "https://example.test/elsewhere",
                },
              ],
            }),
            type: "text",
          },
        ],
      },
      {
        accept: (location) => location.folderId === folderId,
        maxExcerpts: 4,
      },
    );

    expect(passages).toEqual([
      {
        documentId: "doc-1",
        excerpt: "The Verity waits.",
        title: "Lore",
        url: "https://example.test/lore",
      },
    ]);
  });

  test("reads a folder listing and a fetched document", () => {
    const listing = parseFolderListing({
      documents: [
        {
          documentId: "doc-1",
          name: "Bestiary",
          status: "DRAFT",
          updatedAt: "2026-11-01T00:00:00.000Z",
        },
      ],
      folderId,
      folders: [{ folderId: "child", name: "Notes" }],
      name: "3D Sandbox",
    });
    const document = parseFetchedDocument({
      content: [
        {
          text: JSON.stringify({
            documentId: "doc-1",
            folderId,
            name: "Bestiary",
            status: "DRAFT",
            text: "<p>A warder &amp; a core.</p>",
            url: "https://example.test/bestiary",
          }),
          type: "text",
        },
      ],
    });

    expect(listing.folders).toEqual([{ folderId: "child", name: "Notes" }]);
    expect(listing.documents[0]?.name).toBe("Bestiary");
    expect(document?.plainText).toBe("A warder & a core.");
    expect(document?.folderId).toBe(folderId);
  });

  test("reads write results and treats an unknown edit status as running", () => {
    expect(
      parseWriteResult({ documentId: "doc-1", url: "https://example.test" }),
    ).toEqual({
      documentId: "doc-1",
      url: "https://example.test",
    });
    expect(parseEditStatus({ note: "done", status: "idle" }, "doc-1")).toEqual({
      documentId: "doc-1",
      note: "done",
      status: "idle",
    });
    expect(parseEditStatus({}, "doc-1").status).toBe("running");
  });

  test("turns ProductNow HTML into plain text", () => {
    expect(
      htmlToPlainText("<h2>Floors</h2><p>Ten floors.</p><p>No more.</p>"),
    ).toBe("Floors\nTen floors.\nNo more.");
  });
});
