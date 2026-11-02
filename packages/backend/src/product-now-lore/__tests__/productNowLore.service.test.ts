import { describe, expect, test } from "bun:test";
import { PRODUCT_NOW_GAMES_FOLDER_ID } from "@towers-of-coreborn/api";
import { ProductNowLoreService } from "../product-now-lore.service";

/** One scripted ProductNow tool response. */
type ToolHandler = (args: Record<string, unknown>) => unknown;

/**
 * Builds a lore service over a scripted ProductNow client.
 * @param handlers - Responses keyed by ProductNow tool name
 * @returns The service and the calls it made
 */
function createService(handlers: Record<string, ToolHandler>) {
  const calls: { args: Record<string, unknown>; name: string }[] = [];
  const productNow = {
    callTool: async (
      _sessionId: string,
      name: string,
      args: Record<string, unknown> = {},
    ) => {
      calls.push({ args, name });
      const handler = handlers[name];
      if (handler === undefined) {
        throw new Error(`Unexpected ProductNow tool ${name}`);
      }
      return handler(args);
    },
    resolveConnectedSessionId: async (sessionId?: string) =>
      sessionId ?? "stored-session",
  };
  return {
    calls,
    service: new ProductNowLoreService(productNow as never),
  };
}

describe("ProductNowLoreService", () => {
  test("searches the registered Towers of Coreborn folder", async () => {
    const { calls, service } = createService({
      search: () => ({
        sources: [
          {
            document: {
              documentId: "lore",
              folderId: PRODUCT_NOW_GAMES_FOLDER_ID,
            },
            excerpts: [{ content: "Floor 4 holds the first bond." }],
            title: "Lore",
            url: "https://example.test/lore",
          },
          {
            document: { documentId: "other", folderId: "somewhere-else" },
            excerpts: [{ content: "Not this game." }],
            title: "Other",
            url: "https://example.test/other",
          },
        ],
      }),
    });

    const result = await service.search(
      "session-1",
      "towers-of-coreborn",
      "floor 4",
    );

    expect(result.passages).toHaveLength(1);
    expect(result.passages[0]?.excerpt).toBe("Floor 4 holds the first bond.");
    expect(calls[0]).toEqual({
      args: {
        folderId: PRODUCT_NOW_GAMES_FOLDER_ID,
        query: "floor 4",
        resultType: "documents",
        searchScope: "workspace",
      },
      name: "search",
    });
  });

  test("refuses to read a document filed outside the game folder", async () => {
    const { service } = createService({
      fetch: () => ({
        documentId: "doc-1",
        folderId: "somewhere-else",
        name: "Notes",
        text: "<p>Hidden.</p>",
        url: "https://example.test/notes",
      }),
    });

    await expect(
      service.readDocument("session-1", "towers-of-coreborn", "doc-1"),
    ).rejects.toThrow("not in the towers-of-coreborn lore folder");
  });

  test("creates a game folder once, then appends later entries to the same document", async () => {
    let folderCreated = false;
    const { calls, service } = createService({
      create_document: () => ({
        documentId: "bestiary",
        url: "https://example.test/bestiary",
      }),
      create_folder: () => {
        folderCreated = true;
        return { folderId: "tide-folder" };
      },
      edit_document: () => ({ documentId: "bestiary" }),
      fetch: () => ({
        documentId: "bestiary",
        folderId: "tide-folder",
        name: "Bestiary",
        text: "<p>First.</p>",
        url: "https://example.test/bestiary",
      }),
      fetch_folder: (args) => {
        if (args.folderId === PRODUCT_NOW_GAMES_FOLDER_ID) {
          return {
            documents: [],
            folderId: PRODUCT_NOW_GAMES_FOLDER_ID,
            folders: folderCreated
              ? [{ folderId: "tide-folder", name: "tide-cards" }]
              : [],
            name: "Card game thing",
          };
        }
        return {
          documents: [],
          folderId: "tide-folder",
          folders: [],
          name: "tide-cards",
        };
      },
    });

    const [first, second] = await Promise.all([
      service.recordEntry("session-1", "tide-cards", {
        documentName: "Bestiary",
        entry: "A glass eel.",
      }),
      service.recordEntry("session-1", "tide-cards", {
        documentName: "Bestiary",
        entry: "A second eel.",
      }),
    ]);

    expect(first.created).toBe(true);
    expect(second.created).toBe(false);
    expect(second.documentId).toBe("bestiary");
    expect(calls.filter((call) => call.name === "create_folder")).toHaveLength(
      1,
    );
    expect(
      calls.filter((call) => call.name === "create_document"),
    ).toHaveLength(1);
    expect(calls.filter((call) => call.name === "edit_document")).toHaveLength(
      1,
    );
  });

  test("rejects a game id that is not a slug", async () => {
    const { service } = createService({});

    await expect(
      service.search("session-1", "Tide Cards", "eels"),
    ).rejects.toThrow("gameId must be a lowercase slug");
  });

  test("resolves a socket session from the handshake cookie", async () => {
    const { service } = createService({});

    expect(
      await service.requireSession("toc_productnow_session=browser-1"),
    ).toBe("browser-1");
    expect(await service.requireSession(undefined)).toBe("stored-session");
  });

  test("reports a missing ProductNow connection", async () => {
    const productNow = {
      resolveConnectedSessionId: async () => undefined,
    };
    const service = new ProductNowLoreService(productNow as never);

    await expect(service.requireSession(undefined)).rejects.toThrow(
      "Connect ProductNow first",
    );
  });

  test("turns a ProductNow tool error into a gateway failure", async () => {
    const { service } = createService({
      get_status: () => ({
        content: [{ text: "document missing", type: "text" }],
        isError: true,
      }),
    });

    await expect(
      service.getEditStatus("session-1", "towers-of-coreborn", "doc-1"),
    ).rejects.toThrow("ProductNow get_status failed");
  });
});
