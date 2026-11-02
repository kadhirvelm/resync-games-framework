import { describe, expect, test } from "bun:test";
import {
  readProductNowToolError,
  unwrapProductNowToolResult,
} from "../productNowToolResult";

describe("ProductNow tool results", () => {
  test("reads a JSON payload out of an MCP text part", () => {
    expect(
      unwrapProductNowToolResult({
        content: [{ text: '{"documentId":"doc-1"}', type: "text" }],
      }),
    ).toEqual({ documentId: "doc-1" });
  });

  test("reports a tool error without treating it as a payload", () => {
    const raw = {
      content: [{ text: "not allowed", type: "text" }],
      isError: true,
    };

    expect(readProductNowToolError(raw)).toBe("not allowed");
    expect(readProductNowToolError({ content: [] })).toBeUndefined();
  });
});
