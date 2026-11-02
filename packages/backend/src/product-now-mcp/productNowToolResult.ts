/**
 * Reads the payload of a ProductNow MCP tool result.
 * Prefers structured MCP content, then a JSON text part, then the value itself.
 * @param raw - Tool result from `ProductNowMcpService.callTool`
 * @returns The tool's payload when one can be found, otherwise `raw`
 */
export function unwrapProductNowToolResult(raw: unknown): unknown {
  if (!isRecord(raw)) {
    return raw;
  }

  if (isRecord(raw.structuredContent)) {
    return raw.structuredContent;
  }

  const text = readProductNowToolText(raw);
  if (text === undefined) {
    return raw;
  }
  const trimmed = text.trim();
  if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) {
    return raw;
  }

  try {
    return JSON.parse(trimmed) as unknown;
  } catch {
    return raw;
  }
}

/**
 * Reports a tool-level failure. MCP returns these as a normal result with
 * `isError: true` rather than as a transport error.
 * @param raw - Tool result from `ProductNowMcpService.callTool`
 * @returns ProductNow's error text, or undefined when the call succeeded
 */
export function readProductNowToolError(raw: unknown): string | undefined {
  if (!isRecord(raw) || raw.isError !== true) {
    return undefined;
  }
  return readProductNowToolText(raw)?.trim() || "ProductNow reported an error";
}

/**
 * Joins the text parts of an MCP tool result.
 * @param raw - Tool result from `ProductNowMcpService.callTool`
 * @returns Joined text, or undefined when the result has no text parts
 */
export function readProductNowToolText(raw: unknown): string | undefined {
  if (!isRecord(raw) || !Array.isArray(raw.content)) {
    return undefined;
  }

  const parts: string[] = [];
  for (const part of raw.content) {
    if (!isRecord(part) || typeof part.text !== "string") {
      continue;
    }
    parts.push(part.text);
  }

  if (parts.length === 0) {
    return undefined;
  }
  return parts.join("\n");
}

/**
 * @param value - Unknown JSON value
 * @returns Whether the value is a non-null, non-array object
 */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Reads the first non-empty string among several keys.
 * @param record - Object to read
 * @param keys - Keys to try in order
 * @returns The first non-empty string value, if any
 */
export function readFirstString(
  record: Record<string, unknown>,
  ...keys: string[]
): string | undefined {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value !== "") {
      return value;
    }
  }
  return undefined;
}
