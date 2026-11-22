import { describe, expect, test } from "bun:test";
import {
  DESCENT_ROOM_QUERY_KEY,
  hrefWithDescentRoom,
  readDescentRoomFromSearch,
} from "../roomLocation";

describe("roomLocation", () => {
  test("reads and normalizes a valid room code from the query string", () => {
    expect(readDescentRoomFromSearch(`?${DESCENT_ROOM_QUERY_KEY}=abc234`)).toBe(
      "ABC234",
    );
    expect(
      readDescentRoomFromSearch(
        `?foo=1&${DESCENT_ROOM_QUERY_KEY}=%20xy789z%20`,
      ),
    ).toBe("XY789Z");
  });

  test("returns null when the room query parameter is missing or malformed", () => {
    expect(readDescentRoomFromSearch("")).toBeNull();
    expect(readDescentRoomFromSearch("?other=value")).toBeNull();
    expect(readDescentRoomFromSearch("?room=")).toBeNull();
    expect(readDescentRoomFromSearch("?room=AB")).toBeNull();
    expect(readDescentRoomFromSearch("?room=ABC-123")).toBeNull();
  });

  test("sets, updates, and clears the room parameter while preserving query and hash", () => {
    expect(
      hrefWithDescentRoom("https://localhost:3000/descent", "abc234"),
    ).toBe("/descent?room=ABC234");
    expect(
      hrefWithDescentRoom(
        "https://localhost:3000/descent?foo=bar&room=OLD123#top",
        "new456",
      ),
    ).toBe("/descent?foo=bar&room=NEW456#top");
    expect(
      hrefWithDescentRoom(
        "https://localhost:3000/descent?foo=bar&room=ABC234#top",
        null,
      ),
    ).toBe("/descent?foo=bar#top");
    expect(
      hrefWithDescentRoom("https://localhost:3000/descent?room=ABC234", null),
    ).toBe("/descent");
  });
});
