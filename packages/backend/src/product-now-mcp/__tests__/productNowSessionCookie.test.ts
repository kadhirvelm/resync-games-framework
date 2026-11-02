import { describe, expect, test } from "bun:test";
import { UnauthorizedException } from "@nestjs/common";
import type { Request } from "express";
import {
  PRODUCT_NOW_SESSION_COOKIE_NAME,
  productNowSessionCookieOptions,
  readProductNowSessionId,
  requireProductNowSessionId,
} from "../productNowSessionCookie";

describe("productNow session cookie", () => {
  test("reads and decodes the session cookie", () => {
    const request = {
      headers: {
        cookie: `other=1; ${PRODUCT_NOW_SESSION_COOKIE_NAME}=abc%201`,
      },
    } as Request;

    expect(readProductNowSessionId(request)).toBe("abc 1");
  });

  test("still reads the previous session cookie", () => {
    const request = {
      headers: { cookie: "toc_productnow_session=legacy-session" },
    } as Request;

    expect(readProductNowSessionId(request)).toBe("legacy-session");
  });

  test("rejects a request that has not started a ProductNow session", () => {
    const request = { headers: {} } as Request;

    expect(readProductNowSessionId(request)).toBeUndefined();
    let message = "";
    try {
      requireProductNowSessionId(request);
    } catch (error) {
      message = error instanceof UnauthorizedException ? error.message : "";
    }
    expect(message).toBe("Connect ProductNow first");
  });

  test("sends the session cookie on cross-origin HTTPS API calls", () => {
    const options = productNowSessionCookieOptions("https://localhost:8080");

    expect(options.httpOnly).toBe(true);
    expect(options.sameSite).toBe("none");
    expect(options.secure).toBe(true);
  });

  test("keeps an HTTP session cookie same-site", () => {
    const options = productNowSessionCookieOptions("http://localhost:8080");

    expect(options.sameSite).toBe("lax");
    expect(options.secure).toBe(false);
  });
});
