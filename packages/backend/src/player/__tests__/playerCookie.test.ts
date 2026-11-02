import { describe, expect, mock, test } from "bun:test";
import type { Request } from "express";
import {
  PLAYER_COOKIE_NAME,
  readPlayerId,
  resolvePlayerId,
} from "../playerCookie";

const PLAYER_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

/**
 * @param cookie - Cookie header, if any
 * @returns A request stub with a response whose `cookie` is a mock
 */
function request(cookie?: string) {
  const setCookie = mock(() => undefined);
  const stub = {
    headers: { cookie },
    res: { cookie: setCookie },
  } as unknown as Request;
  return { request: stub, setCookie };
}

describe("player cookie", () => {
  test("reads a valid player id among other cookies", () => {
    expect(
      readPlayerId(request(`a=1; ${PLAYER_COOKIE_NAME}=${PLAYER_ID}`).request),
    ).toBe(PLAYER_ID);
  });

  test("ignores a player cookie that is not a UUID", () => {
    expect(
      readPlayerId(request(`${PLAYER_COOKIE_NAME}=admin`).request),
    ).toBeUndefined();
  });

  test("copies a previous player cookie onto the current name", () => {
    const { request: stub, setCookie } = request(`toc_player=${PLAYER_ID}`);
    expect(resolvePlayerId(stub, "https://api.example.com")).toBe(PLAYER_ID);
    expect(setCookie).toHaveBeenCalledTimes(1);
    const [name, value] = setCookie.mock.calls[0] as unknown as [
      string,
      string,
    ];
    expect([name, value]).toEqual([PLAYER_COOKIE_NAME, PLAYER_ID]);
  });

  test("keeps an existing player without setting a cookie", () => {
    const { request: stub, setCookie } = request(
      `${PLAYER_COOKIE_NAME}=${PLAYER_ID}`,
    );
    expect(resolvePlayerId(stub, "https://api.example.com")).toBe(PLAYER_ID);
    expect(setCookie).toHaveBeenCalledTimes(0);
  });

  test("makes a new player and sets a secure cookie over HTTPS", () => {
    const { request: stub, setCookie } = request();
    const playerId = resolvePlayerId(stub, "https://api.example.com");
    expect(/^[0-9a-f-]{36}$/.test(playerId)).toBe(true);
    const [name, value, options] = setCookie.mock.calls[0] as unknown as [
      string,
      string,
      { httpOnly: boolean; sameSite: string; secure: boolean },
    ];
    expect([name, value]).toEqual([PLAYER_COOKIE_NAME, playerId]);
    expect([options.httpOnly, options.sameSite, options.secure]).toEqual([
      true,
      "none",
      true,
    ]);
  });
});
