import { describe, expect, test } from "bun:test";
import {
  BACKDROP_IMAGE_KEY,
  cardImageKey,
  listBattleAssetRequests,
  unitImageKey,
} from "../battleAssetRequests";

describe("listBattleAssetRequests", () => {
  test("loads each card design once and skips units without art", () => {
    const definition = {
      id: "palm",
      imageUrl: "/static/playable-cards/palm/card.webp",
      rules: { aetherCost: 1, effects: [], name: "Palm" },
    };
    const requests = listBattleAssetRequests(
      {
        room: {
          backdropUrl: "https://cdn.test/room.webp",
          floor: 1,
          floorCount: 7,
          isBoss: false,
          title: "Gate",
        },
        setup: {
          aetherPerTurn: 3,
          cards: [
            { definition, instanceId: "a", ownerId: "cultivator" },
            { definition, instanceId: "b", ownerId: "cultivator" },
          ],
          enemies: [
            {
              description: "",
              id: "e1",
              isBoss: false,
              maxHitPoints: 10,
              moves: [],
              name: "E",
              templateId: "e",
            },
          ],
          party: [
            {
              block: 0,
              hitPoints: 10,
              id: "cultivator",
              isCultivator: true,
              maxHitPoints: 10,
              name: "You",
              portraitUrl: "https://cdn.test/me.webp",
              tier: 1,
            },
          ],
          randomState: 1,
        },
      },
      "https://localhost:8080",
    );
    expect(requests).toEqual([
      { key: BACKDROP_IMAGE_KEY, url: "https://cdn.test/room.webp" },
      { key: unitImageKey("cultivator"), url: "https://cdn.test/me.webp" },
      {
        key: cardImageKey("palm"),
        url: "https://localhost:8080/static/playable-cards/palm/card.webp",
      },
    ]);
  });
});
