import type {
  ProductNowLoreDocument,
  ProductNowLoreDocumentSummary,
  ProductNowLoreEditStatus,
  ProductNowLorePassage,
  ProductNowLoreWriteResult,
} from "@resync-game-framework/api";
import {
  isRecord,
  readFirstString,
  unwrapProductNowToolResult,
} from "src/product-now-mcp/productNowToolResult";

const MAX_EXCERPT_LENGTH = 800;

/** Where a search source is filed, used to keep hits inside one game. */
export interface ProductNowSearchSourceLocation {
  documentId: string;
  folderId?: string;
}

/** A folder listing from ProductNow's `fetch_folder`. */
export interface ProductNowFolderListing {
  documents: ProductNowLoreDocumentSummary[];
  folderId?: string;
  folders: { folderId: string; name: string }[];
  name?: string;
}

/** A document from ProductNow's `fetch`, with the folder it is filed in. */
export interface ProductNowFetchedDocument extends ProductNowLoreDocument {
  folderId?: string;
}

/**
 * Reads search excerpts from a ProductNow `search` result.
 * @param raw - MCP `search` result, either the payload or a content envelope
 * @param options - Which sources to keep, how many excerpts, and a fallback title
 * @returns Up to `maxExcerpts` passages from accepted sources
 */
export function parseSearchPassages(
  raw: unknown,
  options: {
    accept: (location: ProductNowSearchSourceLocation) => boolean;
    fallbackTitle?: string;
    maxExcerpts: number;
  },
): ProductNowLorePassage[] {
  const payload = unwrapProductNowToolResult(raw);
  if (!isRecord(payload) || !Array.isArray(payload.sources)) {
    return [];
  }

  const passages: ProductNowLorePassage[] = [];
  for (const source of payload.sources) {
    appendSourcePassages(passages, source, options);
    if (passages.length >= options.maxExcerpts) {
      return passages.slice(0, options.maxExcerpts);
    }
  }
  return passages;
}

/**
 * Reads a ProductNow `fetch_folder` listing.
 * @param raw - MCP `fetch_folder` result
 * @returns The folder's direct documents and subfolders
 */
export function parseFolderListing(raw: unknown): ProductNowFolderListing {
  const payload = unwrapProductNowToolResult(raw);
  if (!isRecord(payload)) {
    return { documents: [], folders: [] };
  }

  return {
    documents: readArray(payload.documents).flatMap(readDocumentSummary),
    folderId: readFirstString(payload, "folderId", "id"),
    folders: readArray(payload.folders).flatMap(readFolderSummary),
    name: readFirstString(payload, "name"),
  };
}

/**
 * Reads a ProductNow `fetch` document.
 * @param raw - MCP `fetch` result
 * @returns The document, or undefined when the result has no document id
 */
export function parseFetchedDocument(
  raw: unknown,
): ProductNowFetchedDocument | undefined {
  const payload = unwrapProductNowToolResult(raw);
  if (!isRecord(payload)) {
    return undefined;
  }
  const documentId = readFirstString(payload, "documentId", "id");
  if (documentId === undefined) {
    return undefined;
  }

  const html = readFirstString(payload, "text", "content") ?? "";
  return {
    documentId,
    folderId: readFirstString(payload, "folderId"),
    html,
    name: readFirstString(payload, "name", "title") ?? "Untitled",
    plainText: htmlToPlainText(html),
    status: readFirstString(payload, "status"),
    url: readFirstString(payload, "url") ?? "",
  };
}

/**
 * Reads the document id and URL from `create_document` or `edit_document`.
 * @param raw - MCP write result
 * @param fallbackDocumentId - Id to report when the result omits one
 * @returns The written document, or undefined when no id is known
 */
export function parseWriteResult(
  raw: unknown,
  fallbackDocumentId?: string,
): ProductNowLoreWriteResult | undefined {
  const payload = unwrapProductNowToolResult(raw);
  const record = isRecord(payload) ? payload : {};
  const nested = isRecord(record.document) ? record.document : {};
  const documentId =
    readFirstString(record, "documentId", "id") ??
    readFirstString(nested, "documentId", "id") ??
    fallbackDocumentId;
  if (documentId === undefined) {
    return undefined;
  }
  const url = readFirstString(record, "url") ?? readFirstString(nested, "url");
  return url === undefined ? { documentId } : { documentId, url };
}

/**
 * Reads the new folder's id from `create_folder`.
 * @param raw - MCP `create_folder` result
 * @returns Folder id, when ProductNow returned one
 */
export function parseCreatedFolderId(raw: unknown): string | undefined {
  const payload = unwrapProductNowToolResult(raw);
  if (!isRecord(payload)) {
    return undefined;
  }
  const nested = isRecord(payload.folder) ? payload.folder : {};
  return (
    readFirstString(payload, "folderId", "id") ??
    readFirstString(nested, "folderId", "id")
  );
}

/**
 * Reads ProductNow's `get_status` for a document's editing agent.
 * Anything other than an explicit idle counts as running, so callers keep
 * polling instead of reading a half-written document.
 * @param raw - MCP `get_status` result
 * @param documentId - Document that was polled
 * @returns Edit status for that document
 */
export function parseEditStatus(
  raw: unknown,
  documentId: string,
): ProductNowLoreEditStatus {
  const payload = unwrapProductNowToolResult(raw);
  const record = isRecord(payload) ? payload : {};
  const status = readFirstString(record, "status")?.toLowerCase();
  const note = readFirstString(record, "note", "summary", "lastAction");
  const result: ProductNowLoreEditStatus = {
    documentId,
    status: status === "idle" ? "idle" : "running",
  };
  return note === undefined ? result : { ...result, note };
}

/**
 * Turns ProductNow document HTML into readable plain text.
 * Block tags become line breaks; common entities are decoded.
 * @param html - Document HTML
 * @returns Plain text with collapsed blank lines
 */
export function htmlToPlainText(html: string): string {
  return decodeEntities(
    html
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/(p|h[1-6]|li|callout|div|tr|ul|ol|mermaid)>/gi, "\n")
      .replace(/<[^>]+>/g, ""),
  )
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * @param text - Text with HTML entities
 * @returns Text with the common named and numeric entities decoded
 */
function decodeEntities(text: string): string {
  const named: Record<string, string> = {
    amp: "&",
    apos: "'",
    gt: ">",
    lt: "<",
    nbsp: " ",
    quot: '"',
  };
  return text.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (entity, code: string) => {
    if (code.startsWith("#x") || code.startsWith("#X")) {
      return String.fromCodePoint(Number.parseInt(code.slice(2), 16));
    }
    if (code.startsWith("#")) {
      return String.fromCodePoint(Number.parseInt(code.slice(1), 10));
    }
    return named[code.toLowerCase()] ?? entity;
  });
}

/**
 * Adds excerpts from one search source when its location is accepted.
 * @param passages - Accumulator of accepted passages
 * @param source - One ProductNow search source
 * @param options - Source filter, excerpt cap, and fallback title
 */
function appendSourcePassages(
  passages: ProductNowLorePassage[],
  source: unknown,
  options: {
    accept: (location: ProductNowSearchSourceLocation) => boolean;
    fallbackTitle?: string;
    maxExcerpts: number;
  },
): void {
  if (!isRecord(source) || !Array.isArray(source.excerpts)) {
    return;
  }
  const document = isRecord(source.document) ? source.document : {};
  const documentId =
    readFirstString(document, "documentId") ??
    readFirstString(source, "documentId", "id");
  if (documentId === undefined) {
    return;
  }
  const folderId =
    readFirstString(document, "folderId") ??
    readFirstString(source, "folderId");
  if (!options.accept({ documentId, folderId })) {
    return;
  }

  const title =
    readFirstString(source, "title") ??
    readFirstString(document, "name") ??
    options.fallbackTitle ??
    "Untitled";
  const url = readFirstString(source, "url") ?? "";
  for (const excerpt of source.excerpts) {
    const text = readExcerpt(excerpt);
    if (text === undefined) {
      continue;
    }
    passages.push({ documentId, excerpt: text, title, url });
    if (passages.length >= options.maxExcerpts) {
      return;
    }
  }
}

/**
 * @param excerpt - One excerpt entry
 * @returns Trimmed excerpt text, capped in length
 */
function readExcerpt(excerpt: unknown): string | undefined {
  if (!isRecord(excerpt) || typeof excerpt.content !== "string") {
    return undefined;
  }
  const trimmed = excerpt.content.trim();
  if (trimmed === "") {
    return undefined;
  }
  return trimmed.slice(0, MAX_EXCERPT_LENGTH);
}

/**
 * @param value - Unknown JSON value
 * @returns The value when it is an array, otherwise an empty array
 */
function readArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

/**
 * @param value - One document entry from a folder listing
 * @returns The summary, or nothing when the entry has no id
 */
function readDocumentSummary(value: unknown): ProductNowLoreDocumentSummary[] {
  if (!isRecord(value)) {
    return [];
  }
  const documentId = readFirstString(value, "documentId", "id");
  if (documentId === undefined) {
    return [];
  }
  const summary: ProductNowLoreDocumentSummary = {
    documentId,
    name: readFirstString(value, "name", "title") ?? "Untitled",
  };
  const status = readFirstString(value, "status");
  const updatedAt = readFirstString(value, "updatedAt");
  return [
    {
      ...summary,
      ...(status === undefined ? {} : { status }),
      ...(updatedAt === undefined ? {} : { updatedAt }),
    },
  ];
}

/**
 * @param value - One folder entry from a folder listing
 * @returns The folder id and name, or nothing when either is missing
 */
function readFolderSummary(
  value: unknown,
): { folderId: string; name: string }[] {
  if (!isRecord(value)) {
    return [];
  }
  const folderId = readFirstString(value, "folderId", "id");
  const name = readFirstString(value, "name");
  if (folderId === undefined || name === undefined) {
    return [];
  }
  return [{ folderId, name }];
}
