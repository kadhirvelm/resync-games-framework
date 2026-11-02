import { describe, expect, test } from "bun:test";
import { productNowConnectUrl } from "../ProductNowProvider";

describe("productNowConnectUrl", () => {
  test("sends the browser back to the page that started the connection", () => {
    const previous = process.env.NEXT_PUBLIC_API_CLIENT_URL;
    process.env.NEXT_PUBLIC_API_CLIENT_URL = "https://api.test";

    expect(productNowConnectUrl("/assets?tab=dungeon")).toBe(
      "https://api.test/productnow-mcp/oauth/connect?returnTo=%2Fassets%3Ftab%3Ddungeon",
    );

    process.env.NEXT_PUBLIC_API_CLIENT_URL = previous;
  });
});
