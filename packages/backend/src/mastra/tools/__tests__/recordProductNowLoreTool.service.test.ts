import { describe, expect, mock, test } from "bun:test";
import { RecordProductNowLoreToolService } from "../recordProductNowLoreTool.service";

/**
 * Reads the execute function Mastra stored on a created tool.
 * @param tool - Tool returned by `createTool`
 * @returns The execute function
 */
function executeOf(tool: unknown) {
  const execute = (tool as { execute?: unknown }).execute;
  if (typeof execute !== "function") {
    throw new Error("The lore tool did not expose execute");
  }
  return execute as (
    input: {
      documentName: string;
      entry: string;
      gameId?: string;
      heading?: string;
    },
    context?: {
      abortSignal?: AbortSignal;
      requestContext?: { getRaw(key: string): unknown };
    },
  ) => Promise<unknown>;
}

describe("RecordProductNowLoreToolService", () => {
  test("records an entry with the session from the agent request", async () => {
    const recordEntry = mock(
      async (_sessionId: string, _gameId: string, _input: unknown) => ({
        created: true,
        documentId: "doc-1",
      }),
    );
    const tool = new RecordProductNowLoreToolService({
      recordEntry,
    } as never).createTool();

    const result = await executeOf(tool)(
      { documentName: "Bestiary", entry: "A glass eel." },
      { requestContext: { getRaw: () => "session-1" } },
    );

    expect(result).toEqual({ created: true, documentId: "doc-1" });
    expect(recordEntry).toHaveBeenCalledTimes(1);
    expect(recordEntry.mock.calls[0]?.[0]).toBe("session-1");
    expect(recordEntry.mock.calls[0]?.[1]).toBe("towers-of-coreborn");
  });

  test("refuses to append to the canon Lore document", async () => {
    const tool = new RecordProductNowLoreToolService({
      recordEntry: mock(async () => ({})),
    } as never).createTool();

    await expect(
      executeOf(tool)(
        { documentName: "Lore", entry: "Invented history." },
        { requestContext: { getRaw: () => "session-1" } },
      ),
    ).rejects.toThrow("canon Lore document");
  });

  test("refuses to record lore without a ProductNow session", async () => {
    const tool = new RecordProductNowLoreToolService({
      recordEntry: mock(async () => ({})),
    } as never).createTool();

    await expect(
      executeOf(tool)(
        { documentName: "Bestiary", entry: "A glass eel." },
        { requestContext: { getRaw: () => undefined } },
      ),
    ).rejects.toThrow("Connect ProductNow before recording lore");
  });
});
