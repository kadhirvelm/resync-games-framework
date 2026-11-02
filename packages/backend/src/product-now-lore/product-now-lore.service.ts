import {
  BadGatewayException,
  BadRequestException,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import {
  PRODUCT_NOW_GAME_ID_PATTERN,
  PRODUCT_NOW_GAME_SPACES,
  PRODUCT_NOW_GAMES_FOLDER_ID,
  type ProductNowGameSpace,
  type ProductNowLoreDocument,
  type ProductNowLoreEditStatus,
  type ProductNowLoreEntryResult,
  type ProductNowLorePassage,
  type ProductNowLoreWriteResult,
} from "@resync-game-framework/api";
import { ProductNowMcpService } from "src/product-now-mcp/product-now-mcp.service";
import { readProductNowSessionIdFromCookieHeader } from "src/product-now-mcp/productNowSessionCookie";
import { readProductNowToolError } from "src/product-now-mcp/productNowToolResult";
import {
  type ProductNowFetchedDocument,
  parseCreatedFolderId,
  parseEditStatus,
  parseFetchedDocument,
  parseFolderListing,
  parseSearchPassages,
  parseWriteResult,
} from "./productNowLoreParsers";

const MAX_SEARCH_PASSAGES = 8;

const LIMITS = {
  content: { max: 50_000, min: 1 },
  documentId: { max: 128, min: 1 },
  documentName: { max: 120, min: 1 },
  entry: { max: 20_000, min: 1 },
  heading: { max: 200, min: 1 },
  instructions: { max: 4_000, min: 1 },
  query: { max: 400, min: 2 },
} as const;

/** A game's folder, resolved once per session. */
interface ResolvedGameFolder {
  folderId: string;
  folderName: string;
  loreDocumentId?: string;
}

/** Fields for a new lore document. */
export interface CreateLoreDocumentInput {
  content: string;
  instructions?: string;
  name: string;
}

/** Fields for appending one entry to a named lore document. */
export interface RecordLoreEntryInput {
  documentName: string;
  entry: string;
  heading?: string;
}

/**
 * Game-scoped ProductNow lore storage.
 *
 * Every game reads and writes inside its own ProductNow folder. A registered
 * game in `PRODUCT_NOW_GAME_SPACES` may name a fixed folder. Any other game
 * gets a subfolder under the shared games folder, created on first use.
 * Methods take the ProductNow session explicitly so HTTP controllers, socket
 * gateways, and agent tools can all call them.
 */
@Injectable()
export class ProductNowLoreService {
  private readonly folderRequests = new Map<
    string,
    Promise<ResolvedGameFolder>
  >();
  private readonly entryTails = new Map<string, Promise<void>>();
  private readonly createdEntryDocuments = new Map<string, string>();

  public constructor(private readonly productNow: ProductNowMcpService) {}

  /**
   * Resolves the connected ProductNow session for a socket or other
   * non-HTTP caller from its raw `Cookie` header.
   * @param cookieHeader - Raw `Cookie` header, such as `client.handshake.headers.cookie`
   * @returns Connected session id
   * @throws UnauthorizedException when ProductNow is not connected
   */
  public async requireSession(
    cookieHeader: string | undefined,
  ): Promise<string> {
    const sessionId = await this.productNow.resolveConnectedSessionId(
      readProductNowSessionIdFromCookieHeader(cookieHeader),
    );
    if (sessionId === undefined) {
      throw new UnauthorizedException("Connect ProductNow first");
    }
    return sessionId;
  }

  /**
   * Resolves a game's folder and lists its documents.
   * @param sessionId - Connected ProductNow session
   * @param gameId - Stable game id
   * @param signal - Optional cancellation signal
   * @returns The game's folder and its direct documents
   */
  public async getGameSpace(
    sessionId: string,
    gameId: string,
    signal?: AbortSignal,
  ): Promise<ProductNowGameSpace> {
    const folder = await this.resolveGameFolder(sessionId, gameId, signal);
    const listing = parseFolderListing(
      await this.call(
        sessionId,
        "fetch_folder",
        { folderId: folder.folderId },
        signal,
      ),
    );
    const space: ProductNowGameSpace = {
      documents: listing.documents,
      folderId: folder.folderId,
      folderName: listing.name ?? folder.folderName,
      gameId,
    };
    return folder.loreDocumentId === undefined
      ? space
      : { ...space, loreDocumentId: folder.loreDocumentId };
  }

  /**
   * Searches documents filed directly in the game's folder.
   * @param sessionId - Connected ProductNow session
   * @param gameId - Stable game id
   * @param query - Topic or question
   * @param signal - Optional cancellation signal
   * @returns Matching passages from the game's documents
   */
  public async search(
    sessionId: string,
    gameId: string,
    query: string,
    signal?: AbortSignal,
  ): Promise<{ passages: ProductNowLorePassage[] }> {
    const trimmedQuery = requireText("query", query, LIMITS.query);
    const folder = await this.resolveGameFolder(sessionId, gameId, signal);
    const raw = await this.call(
      sessionId,
      "search",
      {
        folderId: folder.folderId,
        query: trimmedQuery,
        resultType: "documents",
        searchScope: "workspace",
      },
      signal,
    );
    return {
      passages: parseSearchPassages(raw, {
        accept: ({ folderId }) => folderId === folder.folderId,
        maxExcerpts: MAX_SEARCH_PASSAGES,
      }),
    };
  }

  /**
   * Reads one document from the game's folder.
   * @param sessionId - Connected ProductNow session
   * @param gameId - Stable game id
   * @param documentId - Document to read
   * @param signal - Optional cancellation signal
   * @returns The document's HTML and plain text
   * @throws ForbiddenException when the document is outside the game's folder
   */
  public async readDocument(
    sessionId: string,
    gameId: string,
    documentId: string,
    signal?: AbortSignal,
  ): Promise<ProductNowLoreDocument> {
    const folder = await this.resolveGameFolder(sessionId, gameId, signal);
    const { folderId: _folderId, ...document } = await this.fetchOwnedDocument(
      sessionId,
      gameId,
      folder,
      documentId,
      signal,
    );
    return document;
  }

  /**
   * Creates a document in the game's folder with the content kept verbatim.
   * ProductNow keeps generating after this returns; poll {@link getEditStatus}.
   * @param sessionId - Connected ProductNow session
   * @param gameId - Stable game id
   * @param input - Name, body, and optional layout guidance
   * @param signal - Optional cancellation signal
   * @returns The new document's id and URL
   */
  public async createDocument(
    sessionId: string,
    gameId: string,
    input: CreateLoreDocumentInput,
    signal?: AbortSignal,
  ): Promise<ProductNowLoreWriteResult> {
    const name = requireText("name", input.name, LIMITS.documentName);
    const content = requireText("content", input.content, LIMITS.content);
    const instructions = optionalText(
      "instructions",
      input.instructions,
      LIMITS.instructions,
    );
    const folder = await this.resolveGameFolder(sessionId, gameId, signal);
    const raw = await this.call(
      sessionId,
      "create_document",
      {
        context: content,
        folderId: folder.folderId,
        name,
        prompt: renderCreatePrompt(name, instructions),
      },
      signal,
    );
    return requireWriteResult(parseWriteResult(raw), "create_document");
  }

  /**
   * Sends edit instructions for a document in the game's folder.
   * ProductNow applies them after this returns; poll {@link getEditStatus}.
   * @param sessionId - Connected ProductNow session
   * @param gameId - Stable game id
   * @param documentId - Document to edit
   * @param instructions - What to change, written for ProductNow's editing agent
   * @param signal - Optional cancellation signal
   * @returns The edited document's id
   * @throws ForbiddenException when the document is outside the game's folder
   */
  public async editDocument(
    sessionId: string,
    gameId: string,
    documentId: string,
    instructions: string,
    signal?: AbortSignal,
  ): Promise<ProductNowLoreWriteResult> {
    const message = requireText(
      "instructions",
      instructions,
      LIMITS.instructions,
    );
    return this.sendEdit(sessionId, gameId, documentId, message, signal);
  }

  /**
   * Appends one entry to a named document in the game's folder, creating
   * the document when it does not exist yet. Concurrent entries for the same
   * document run in order, so two callers cannot create duplicates.
   * @param sessionId - Connected ProductNow session
   * @param gameId - Stable game id
   * @param input - Document name, entry text, and optional heading
   * @param signal - Optional cancellation signal
   * @returns The document written to and whether it was created
   */
  public async recordEntry(
    sessionId: string,
    gameId: string,
    input: RecordLoreEntryInput,
    signal?: AbortSignal,
  ): Promise<ProductNowLoreEntryResult> {
    const documentName = requireText(
      "documentName",
      input.documentName,
      LIMITS.documentName,
    );
    const entry = requireText("entry", input.entry, LIMITS.entry);
    const heading = optionalText("heading", input.heading, LIMITS.heading);
    const lockKey = `${sessionId}:${requireGameId(gameId)}:${documentName.toLowerCase()}`;

    return this.serializeEntry(lockKey, async () => {
      const existingId = await this.findEntryDocumentId(
        sessionId,
        gameId,
        lockKey,
        documentName,
        signal,
      );
      if (existingId === undefined) {
        const created = await this.createDocument(
          sessionId,
          gameId,
          {
            content: renderEntryBody(entry, heading),
            name: documentName,
          },
          signal,
        );
        this.createdEntryDocuments.set(lockKey, created.documentId);
        return { ...created, created: true };
      }

      const edited = await this.sendEdit(
        sessionId,
        gameId,
        existingId,
        renderAppendInstructions(entry, heading),
        signal,
      );
      return { ...edited, created: false };
    });
  }

  /**
   * Reports whether ProductNow is still writing a document.
   * @param sessionId - Connected ProductNow session
   * @param gameId - Stable game id
   * @param documentId - Document returned by a create or edit call
   * @param signal - Optional cancellation signal
   * @returns `running` until every queued edit has finished, then `idle`
   */
  public async getEditStatus(
    sessionId: string,
    gameId: string,
    documentId: string,
    signal?: AbortSignal,
  ): Promise<ProductNowLoreEditStatus> {
    requireGameId(gameId);
    const id = requireText("documentId", documentId, LIMITS.documentId);
    const raw = await this.call(
      sessionId,
      "get_status",
      { documentId: id },
      signal,
    );
    return parseEditStatus(raw, id);
  }

  /**
   * Finds or creates the game's folder. Lookups are shared per session and
   * game; a failed lookup is forgotten so the next call retries.
   * @param sessionId - Connected ProductNow session
   * @param gameId - Stable game id
   * @param signal - Optional cancellation signal
   * @returns The game's folder
   */
  private resolveGameFolder(
    sessionId: string,
    gameId: string,
    signal?: AbortSignal,
  ): Promise<ResolvedGameFolder> {
    const key = `${sessionId}:${requireGameId(gameId)}`;
    const pending = this.folderRequests.get(key);
    if (pending !== undefined) {
      return pending;
    }

    const request = this.lookUpGameFolder(sessionId, gameId, signal);
    this.folderRequests.set(key, request);
    request.catch(() => {
      if (this.folderRequests.get(key) === request) {
        this.folderRequests.delete(key);
      }
    });
    return request;
  }

  /**
   * @param sessionId - Connected ProductNow session
   * @param gameId - Validated game id
   * @param signal - Optional cancellation signal
   * @returns The registered folder, an existing subfolder, or a new subfolder
   */
  private async lookUpGameFolder(
    sessionId: string,
    gameId: string,
    signal?: AbortSignal,
  ): Promise<ResolvedGameFolder> {
    const registered = PRODUCT_NOW_GAME_SPACES[gameId];
    const folderName = registered?.displayName ?? gameId;
    const loreDocumentId = registered?.loreDocumentId;
    if (registered?.folderId !== undefined) {
      return { folderId: registered.folderId, folderName, loreDocumentId };
    }

    const parent = parseFolderListing(
      await this.call(
        sessionId,
        "fetch_folder",
        { folderId: PRODUCT_NOW_GAMES_FOLDER_ID },
        signal,
      ),
    );
    const existing = parent.folders.find(
      (folder) => folder.name.trim().toLowerCase() === folderName.toLowerCase(),
    );
    if (existing !== undefined) {
      return { folderId: existing.folderId, folderName, loreDocumentId };
    }

    const folderId = parseCreatedFolderId(
      await this.call(
        sessionId,
        "create_folder",
        { name: folderName, parentFolderId: PRODUCT_NOW_GAMES_FOLDER_ID },
        signal,
      ),
    );
    if (folderId === undefined) {
      throw new BadGatewayException(
        `ProductNow did not return a folder for ${folderName}`,
      );
    }
    return { folderId, folderName, loreDocumentId };
  }

  /**
   * Sends an edit for a document after confirming it is in the game's folder.
   * @param sessionId - Connected ProductNow session
   * @param gameId - Stable game id
   * @param documentId - Document to edit
   * @param message - Instructions for ProductNow's editing agent
   * @param signal - Optional cancellation signal
   * @returns The edited document's id
   */
  private async sendEdit(
    sessionId: string,
    gameId: string,
    documentId: string,
    message: string,
    signal?: AbortSignal,
  ): Promise<ProductNowLoreWriteResult> {
    const folder = await this.resolveGameFolder(sessionId, gameId, signal);
    const document = await this.fetchOwnedDocument(
      sessionId,
      gameId,
      folder,
      documentId,
      signal,
    );
    const raw = await this.call(
      sessionId,
      "edit_document",
      { documentId: document.documentId, message },
      signal,
    );
    return requireWriteResult(
      parseWriteResult(raw, document.documentId),
      "edit_document",
    );
  }

  /**
   * Fetches a document and confirms it is filed in the game's folder.
   * @param sessionId - Connected ProductNow session
   * @param gameId - Stable game id, for the error message
   * @param folder - The game's folder
   * @param documentId - Document to fetch
   * @param signal - Optional cancellation signal
   * @returns The fetched document
   * @throws ForbiddenException when the document is outside the game's folder
   */
  private async fetchOwnedDocument(
    sessionId: string,
    gameId: string,
    folder: ResolvedGameFolder,
    documentId: string,
    signal?: AbortSignal,
  ): Promise<ProductNowFetchedDocument> {
    const id = requireText("documentId", documentId, LIMITS.documentId);
    const document = parseFetchedDocument(
      await this.call(sessionId, "fetch", { documentId: id }, signal),
    );
    if (document === undefined) {
      throw new BadGatewayException(`ProductNow did not return document ${id}`);
    }
    if (document.folderId !== folder.folderId) {
      throw new ForbiddenException(
        `Document ${id} is not in the ${gameId} lore folder`,
      );
    }
    return document;
  }

  /**
   * @param sessionId - Connected ProductNow session
   * @param gameId - Stable game id
   * @param lockKey - Entry lock key, which also keys recently created documents
   * @param documentName - Name to match in the game's folder
   * @param signal - Optional cancellation signal
   * @returns The existing document's id, if the folder has one with that name
   */
  private async findEntryDocumentId(
    sessionId: string,
    gameId: string,
    lockKey: string,
    documentName: string,
    signal?: AbortSignal,
  ): Promise<string | undefined> {
    const space = await this.getGameSpace(sessionId, gameId, signal);
    const wanted = documentName.toLowerCase();
    const listed = space.documents.find(
      (document) => document.name.trim().toLowerCase() === wanted,
    );
    return listed?.documentId ?? this.createdEntryDocuments.get(lockKey);
  }

  /**
   * Runs entry writes for one document in order.
   * @param key - Session, game, and document name
   * @param operation - Work to run after earlier entries finish
   * @returns The operation result
   */
  private async serializeEntry<T>(
    key: string,
    operation: () => Promise<T>,
  ): Promise<T> {
    const previous = this.entryTails.get(key) ?? Promise.resolve();
    const result = previous.catch(() => undefined).then(operation);
    const tail = result.then(
      () => undefined,
      () => undefined,
    );
    this.entryTails.set(key, tail);
    try {
      return await result;
    } finally {
      if (this.entryTails.get(key) === tail) {
        this.entryTails.delete(key);
      }
    }
  }

  /**
   * Calls one ProductNow tool and turns a tool-level error into an exception.
   * @param sessionId - Connected ProductNow session
   * @param name - ProductNow MCP tool name
   * @param toolArguments - Tool arguments
   * @param signal - Optional cancellation signal
   * @returns Raw MCP tool result
   * @throws BadGatewayException when ProductNow reports a tool error
   */
  private async call(
    sessionId: string,
    name: string,
    toolArguments: Record<string, unknown>,
    signal?: AbortSignal,
  ): Promise<unknown> {
    const raw = await this.productNow.callTool(
      sessionId,
      name,
      toolArguments,
      signal,
    );
    const error = readProductNowToolError(raw);
    if (error !== undefined) {
      throw new BadGatewayException(`ProductNow ${name} failed: ${error}`);
    }
    return raw;
  }
}

/**
 * @param gameId - Candidate game id
 * @returns The id when it is a valid slug
 * @throws BadRequestException when it is not
 */
function requireGameId(gameId: string): string {
  if (typeof gameId !== "string" || !PRODUCT_NOW_GAME_ID_PATTERN.test(gameId)) {
    throw new BadRequestException(
      "gameId must be a lowercase slug of 3 to 64 letters, digits, or hyphens",
    );
  }
  return gameId;
}

/**
 * @param field - Field name for the error message
 * @param value - Candidate text
 * @param limits - Allowed trimmed length
 * @returns Trimmed text
 * @throws BadRequestException when the text is missing or out of range
 */
function requireText(
  field: string,
  value: unknown,
  limits: { max: number; min: number },
): string {
  const trimmed = typeof value === "string" ? value.trim() : "";
  if (trimmed.length < limits.min || trimmed.length > limits.max) {
    throw new BadRequestException(
      `${field} must be ${limits.min} to ${limits.max} characters`,
    );
  }
  return trimmed;
}

/**
 * @param field - Field name for the error message
 * @param value - Candidate text, which may be omitted
 * @param limits - Allowed trimmed length
 * @returns Trimmed text, or undefined when omitted or blank
 * @throws BadRequestException when the text is too long
 */
function optionalText(
  field: string,
  value: unknown,
  limits: { max: number; min: number },
): string | undefined {
  if (typeof value !== "string" || value.trim() === "") {
    return undefined;
  }
  return requireText(field, value, limits);
}

/**
 * @param result - Parsed write result
 * @param tool - Tool name for the error message
 * @returns The result
 * @throws BadGatewayException when ProductNow returned no document id
 */
function requireWriteResult(
  result: ProductNowLoreWriteResult | undefined,
  tool: string,
): ProductNowLoreWriteResult {
  if (result === undefined) {
    throw new BadGatewayException(`ProductNow ${tool} returned no document id`);
  }
  return result;
}

/**
 * ProductNow generates documents from a prompt, so the body goes in
 * `context` and the prompt asks for it unchanged.
 * @param name - Document name
 * @param instructions - Optional layout guidance from the game
 * @returns The `create_document` prompt
 */
function renderCreatePrompt(name: string, instructions?: string): string {
  const lines = [
    `Create the lore document "${name}".`,
    "Its body is the attached context. Reproduce that context exactly, word for word, in the same order and paragraphs.",
    "Do not summarize, expand, reorder, or invent content.",
  ];
  if (instructions !== undefined) {
    lines.push(
      `Layout guidance, which must not change the wording: ${instructions}`,
    );
  }
  return lines.join("\n");
}

/**
 * @param entry - Entry text
 * @param heading - Optional heading
 * @returns Body for a new entry document
 */
function renderEntryBody(entry: string, heading?: string): string {
  return heading === undefined ? entry : `${heading}\n\n${entry}`;
}

/**
 * @param entry - Entry text kept verbatim
 * @param heading - Optional heading above the entry
 * @returns Instructions for ProductNow's editing agent
 */
function renderAppendInstructions(entry: string, heading?: string): string {
  const lines = [
    "Append one new entry at the very end of the document. Do not change, reorder, or remove anything already in it.",
  ];
  if (heading !== undefined) {
    lines.push(
      `Put the heading "${heading}" as a level-3 heading above the entry.`,
    );
  }
  lines.push(
    "Reproduce the entry between the markers exactly, word for word, without the markers:",
    "<<<ENTRY",
    entry,
    "ENTRY>>>",
  );
  return lines.join("\n");
}
