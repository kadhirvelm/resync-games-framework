"use client";

import {
  isServiceError,
  type ProductNowGameSpace,
  type ProductNowLoreDocument,
  type ProductNowLoreEditStatus,
  type ProductNowLoreEntryResult,
  type ProductNowLorePassage,
  type ProductNowLoreWriteResult,
  type ServiceError,
} from "@resync-game-framework/api";
import { useCallback, useMemo } from "react";
import { useClientServiceCallers } from "@/services/clientServiceCallers";
import {
  type ProductNowConnectionState,
  useProductNowConnection,
} from "./ProductNowProvider";

/** How long to wait between ProductNow edit-status checks. */
const EDIT_POLL_DELAY_MS = 2000;

/** How many status checks to make before giving up on one write. */
const EDIT_POLL_ATTEMPTS = 30;

/** Fields for a new document in the game's lore folder. */
export interface CreateProductNowDocumentInput {
  content: string;
  instructions?: string;
  name: string;
}

/** Fields for one appended lore entry. */
export interface RecordProductNowEntryInput {
  documentName: string;
  entry: string;
  heading?: string;
}

/** Lore reads and writes for one game, plus the shared connection. */
export interface ProductNowLoreClient extends ProductNowConnectionState {
  /** Creates a document. ProductNow finishes writing after this resolves. */
  createDocument: (
    input: CreateProductNowDocumentInput,
  ) => Promise<ProductNowLoreWriteResult | ServiceError>;
  /** Sends edit instructions. ProductNow finishes writing after this resolves. */
  editDocument: (
    documentId: string,
    instructions: string,
  ) => Promise<ProductNowLoreWriteResult | ServiceError>;
  /** Reports whether ProductNow is still writing one document. */
  getEditStatus: (
    documentId: string,
  ) => Promise<ProductNowLoreEditStatus | ServiceError>;
  /** Resolves the game's folder and lists its documents. */
  getGameSpace: () => Promise<ProductNowGameSpace | ServiceError>;
  /** Reads one document filed in the game's folder. */
  readDocument: (
    documentId: string,
  ) => Promise<ProductNowLoreDocument | ServiceError>;
  /**
   * Appends one entry to a named document, creating the document when it
   * does not exist yet.
   */
  recordEntry: (
    input: RecordProductNowEntryInput,
  ) => Promise<ProductNowLoreEntryResult | ServiceError>;
  /** Searches documents filed in the game's folder. */
  search: (
    query: string,
  ) => Promise<{ passages: ProductNowLorePassage[] } | ServiceError>;
  /**
   * Polls until ProductNow has finished a create or edit, or the attempt
   * limit is reached. The last status is returned either way.
   */
  waitForEdit: (
    documentId: string,
  ) => Promise<ProductNowLoreEditStatus | ServiceError>;
}

/**
 * ProductNow lore for one game. Reads and writes stay in that game's folder.
 * Call this from any client component; the root layout provides the connection.
 * @param gameId - Stable game id, such as `towers-of-coreborn`
 * @returns Connection state and lore operations bound to `gameId`
 */
export function useProductNowLore(gameId: string): ProductNowLoreClient {
  const connection = useProductNowConnection();
  const { clientServiceCallers } = useClientServiceCallers();
  const lore = clientServiceCallers.productNowLore;

  const getGameSpace = useCallback(
    () => lore.getGameSpace({ gameId }),
    [gameId, lore],
  );
  const search = useCallback(
    (query: string) => lore.search({ gameId, query }),
    [gameId, lore],
  );
  const readDocument = useCallback(
    (documentId: string) => lore.readDocument({ documentId, gameId }),
    [gameId, lore],
  );
  const createDocument = useCallback(
    (input: CreateProductNowDocumentInput) =>
      lore.createDocument({ ...input, gameId }),
    [gameId, lore],
  );
  const editDocument = useCallback(
    (documentId: string, instructions: string) =>
      lore.editDocument({ documentId, gameId, instructions }),
    [gameId, lore],
  );
  const recordEntry = useCallback(
    (input: RecordProductNowEntryInput) =>
      lore.recordEntry({ ...input, gameId }),
    [gameId, lore],
  );
  const getEditStatus = useCallback(
    (documentId: string) => lore.getEditStatus({ documentId, gameId }),
    [gameId, lore],
  );
  const waitForEdit = useCallback(
    async (documentId: string) => {
      let latest: ProductNowLoreEditStatus | ServiceError = {
        code: 504,
        message: "ProductNow did not finish writing",
        path: "productnow-lore/documents/status",
        type: "error",
      };
      for (let attempt = 0; attempt < EDIT_POLL_ATTEMPTS; attempt += 1) {
        latest = await getEditStatus(documentId);
        if (isServiceError(latest) || latest.status === "idle") {
          return latest;
        }
        await delay(EDIT_POLL_DELAY_MS);
      }
      return latest;
    },
    [getEditStatus],
  );

  return useMemo(
    () => ({
      ...connection,
      createDocument,
      editDocument,
      getEditStatus,
      getGameSpace,
      readDocument,
      recordEntry,
      search,
      waitForEdit,
    }),
    [
      connection,
      createDocument,
      editDocument,
      getEditStatus,
      getGameSpace,
      readDocument,
      recordEntry,
      search,
      waitForEdit,
    ],
  );
}

/**
 * @param delayMs - How long to wait
 * @returns A promise that resolves after the delay
 */
function delay(delayMs: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, delayMs);
  });
}
