import { describe, expect, test } from "bun:test";
import type { ConfigurationService } from "src/configuration/configuration.service";
import { readProductNowWorkspace } from "../productNowWorkspace";

/**
 * @param values - Configuration values keyed by name
 * @returns A configuration stand-in that reads from `values`
 */
function configuration(
  values: Record<string, string | undefined>,
): Pick<ConfigurationService, "get"> {
  return {
    get: ((key: string) => values[key]) as ConfigurationService["get"],
  };
}

describe("readProductNowWorkspace", () => {
  test("reads the configured games folder and Lore document", () => {
    expect(
      readProductNowWorkspace(
        configuration({
          PRODUCTNOW_GAMES_FOLDER_ID: " games-folder ",
          PRODUCTNOW_LORE_DOCUMENT_ID: "lore-document",
        }),
      ),
    ).toEqual({
      gamesFolderId: "games-folder",
      loreDocumentId: "lore-document",
    });
  });

  test("leaves out blank or missing ids", () => {
    expect(
      readProductNowWorkspace(
        configuration({ PRODUCTNOW_GAMES_FOLDER_ID: "  " }),
      ),
    ).toEqual({ gamesFolderId: undefined, loreDocumentId: undefined });
  });
});
