import type { ConfigurationService } from "src/configuration/configuration.service";

/**
 * Where game lore lives in the connected ProductNow workspace.
 * Both ids are optional so the framework runs against any workspace.
 */
export interface ProductNowWorkspace {
  /** Folder that holds each game's lore folder */
  gamesFolderId?: string;
  /** Document Towers of Coreborn reads as its canon */
  loreDocumentId?: string;
}

/**
 * Reads the configured ProductNow workspace ids.
 * @param configuration - Source of `PRODUCTNOW_GAMES_FOLDER_ID` and `PRODUCTNOW_LORE_DOCUMENT_ID`
 * @returns The ids that are set; blank or missing values are left out
 */
export function readProductNowWorkspace(
  configuration: Pick<ConfigurationService, "get">,
): ProductNowWorkspace {
  return {
    gamesFolderId: nonEmpty(configuration.get("PRODUCTNOW_GAMES_FOLDER_ID")),
    loreDocumentId: nonEmpty(configuration.get("PRODUCTNOW_LORE_DOCUMENT_ID")),
  };
}

/**
 * @param value - Configured value, possibly blank or missing
 * @returns The trimmed value, or undefined when it is blank or missing
 */
function nonEmpty(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}
