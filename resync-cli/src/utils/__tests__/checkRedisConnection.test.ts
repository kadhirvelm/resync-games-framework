import { describe, expect, spyOn, test } from "bun:test";
import { checkRedisConnection } from "../checkRedisConnection";

describe("checkRedisConnection", () => {
  test("reports an unavailable server without an unhandled ioredis event", async () => {
    const consoleError = spyOn(console, "error").mockImplementation(() => {});

    try {
      await expect(checkRedisConnection("127.0.0.1", 1, 1, 0)).rejects.toThrow(
        "Failed to connect to Redis after 1 attempts. Make sure Redis is running on 127.0.0.1:1",
      );
      expect(
        consoleError.mock.calls.some((call) =>
          call.some((value) => String(value).includes("[ioredis]")),
        ),
      ).toBe(false);
    } finally {
      consoleError.mockRestore();
    }
  });
});
