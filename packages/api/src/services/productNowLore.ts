import type { Service, ServiceDefinition } from "../genericTypes/service";

/** Lowercase slug a game uses to address its ProductNow lore space. */
export const PRODUCT_NOW_GAME_ID_PATTERN = /^[a-z0-9][a-z0-9-]{1,62}[a-z0-9]$/;

/** A game's place in ProductNow. */
export interface ProductNowGameSpaceDefinition {
  /** Folder name, also used to find or create the folder */
  displayName: string;
  /**
   * When true, the game files lore directly in the backend's configured
   * games folder (`PRODUCTNOW_GAMES_FOLDER_ID`) and reads the configured
   * Lore document (`PRODUCTNOW_LORE_DOCUMENT_ID`) as its canon. Otherwise
   * the backend finds or creates a subfolder named `displayName`.
   */
  usesGamesFolder?: boolean;
}

/**
 * Registered game spaces. Any other valid game id gets a subfolder named
 * after the id under the backend's configured games folder.
 */
export const PRODUCT_NOW_GAME_SPACES: Readonly<
  Record<string, ProductNowGameSpaceDefinition>
> = {
  "three-d-sandbox": { displayName: "3D Sandbox" },
  "towers-of-coreborn": {
    displayName: "Towers of Coreborn",
    usesGamesFolder: true,
  },
};

/** One ProductNow document filed in a game's folder. */
export interface ProductNowLoreDocumentSummary {
  documentId: string;
  name: string;
  /** DRAFT, REVIEW, or PUBLISHED */
  status?: string;
  updatedAt?: string;
}

/** A game's resolved ProductNow folder and its documents. */
export interface ProductNowGameSpace {
  documents: ProductNowLoreDocumentSummary[];
  folderId: string;
  folderName: string;
  gameId: string;
  loreDocumentId?: string;
}

/** One search excerpt from a document in the game's folder. */
export interface ProductNowLorePassage {
  documentId: string;
  excerpt: string;
  title: string;
  url: string;
}

/** One full document read from the game's folder. */
export interface ProductNowLoreDocument {
  documentId: string;
  /** Document body as ProductNow HTML */
  html: string;
  name: string;
  /** Document body with tags removed, for prompts and in-game text */
  plainText: string;
  status?: string;
  url: string;
}

/** A document ProductNow accepted for creation or editing. */
export interface ProductNowLoreWriteResult {
  documentId: string;
  url?: string;
}

/** Result of appending one entry to a named lore document. */
export interface ProductNowLoreEntryResult extends ProductNowLoreWriteResult {
  /** True when the named document did not exist and was created */
  created: boolean;
}

/** Whether ProductNow's editing agent is still writing a document. */
export interface ProductNowLoreEditStatus {
  documentId: string;
  note?: string;
  status: "idle" | "running";
}

/** Payload shared by every game-scoped lore call. */
interface GameScopedPayload {
  /** Stable game id, for example a `GameExperienceId` */
  gameId: string;
}

/**
 * Game-scoped ProductNow lore storage. Reads and writes stay inside the
 * game's own folder. Writes are asynchronous in ProductNow: poll
 * `getEditStatus` until it is idle before reading the result.
 */
export interface ProductNowLoreServiceApi extends Service {
  createDocument: {
    payload: GameScopedPayload & {
      /** Body kept verbatim */
      content: string;
      /** Optional layout guidance, such as headings to add around the body */
      instructions?: string;
      name: string;
    };
    response: ProductNowLoreWriteResult;
  };
  editDocument: {
    payload: GameScopedPayload & {
      documentId: string;
      /** What to change, written for ProductNow's editing agent */
      instructions: string;
    };
    response: ProductNowLoreWriteResult;
  };
  getEditStatus: {
    payload: GameScopedPayload & { documentId: string };
    response: ProductNowLoreEditStatus;
  };
  getGameSpace: {
    payload: GameScopedPayload;
    response: ProductNowGameSpace;
  };
  readDocument: {
    payload: GameScopedPayload & { documentId: string };
    response: ProductNowLoreDocument;
  };
  recordEntry: {
    payload: GameScopedPayload & {
      /** Document to append to; created in the game's folder when missing */
      documentName: string;
      /** Entry kept verbatim */
      entry: string;
      /** Optional heading placed above the entry */
      heading?: string;
    };
    response: ProductNowLoreEntryResult;
  };
  search: {
    payload: GameScopedPayload & { query: string };
    response: { passages: ProductNowLorePassage[] };
  };
}

export const ProductNowLoreServiceDefinition: ServiceDefinition<ProductNowLoreServiceApi> =
  {
    controller: "productnow-lore",
    endpoints: {
      createDocument: { method: "POST", path: "documents/create" },
      editDocument: { method: "POST", path: "documents/edit" },
      getEditStatus: { method: "POST", path: "documents/status" },
      getGameSpace: { method: "POST", path: "space" },
      readDocument: { method: "POST", path: "documents/read" },
      recordEntry: { method: "POST", path: "entries" },
      search: { method: "POST", path: "search" },
    },
  };
