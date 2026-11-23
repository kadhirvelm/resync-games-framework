import { describe, expect, test } from "bun:test";
import type { ThreeDAsset, ThreeDAssetKind } from "@resync-game-framework/api";
import {
  assetRoleForBuilding,
  assetRoleForResource,
  assetRoleForUnit,
  assetRoleForVent,
  isCharacterAssetRole,
  isResourceAssetRole,
  isSceneryAssetRole,
  resolveAshenGateAssets,
} from "../threeDAssets";

/**
 * Builds the asset fields needed by role resolution tests.
 * @param name - Canonical model name
 * @param createdAt - Version timestamp
 * @param kind - Asset category
 * @returns A valid asset
 */
function asset(
  name: string,
  createdAt: string,
  kind: ThreeDAssetKind = "character",
): ThreeDAsset {
  return {
    createdAt,
    id: `${name}-${createdAt}`,
    kind,
    name,
    prompt: name,
    provenance: {
      elapsedMs: 1,
      estimatedCredits: null,
      jobIds: [],
      provider: "design",
    },
    thumbnailUrl: "/preview.png",
    url: "/model.glb",
    validation: {
      animations: [],
      bounds: { max: [1, 2, 1], min: [-1, 0, -1] },
      bytes: 1,
      materials: 1,
      meshes: 1,
      skins: 1,
      textures: 0,
      triangles: 12,
      valid: true,
      warnings: [],
    },
  };
}

describe("Ashen Gate 3D asset routing", () => {
  test("keeps the newest canonical generated model", () => {
    const older = asset("Descent Warden", "2026-01-01T00:00:00.000Z");
    const newer = asset("Descent Warden", "2026-02-01T00:00:00.000Z");
    expect(resolveAshenGateAssets([older, newer]).warden?.id).toBe(newer.id);
  });

  test("resolves canonical resource props into the live roster", () => {
    const grove = asset(
      "Descent Harvest Grove",
      "2026-11-01T00:00:00.000Z",
      "prop",
    );
    expect(resolveAshenGateAssets([grove]).resourceGrove?.id).toBe(grove.id);
  });

  test("resolves distinct resource and utility building props", () => {
    const definitions = [
      ["Descent Spirit Herb Patch", "resourceSpiritHerbs"],
      ["Descent Essence Spring", "resourceEssence"],
      ["Descent Iron Outcrop", "resourceIron"],
      ["Descent Coin Hoard", "resourceCoin"],
      ["Descent Storehouse", "storehouse"],
      ["Descent Palisade Wall", "wall"],
      ["Descent Hold Gate", "holdGate"],
      ["Descent Omen Tower", "omenTower"],
    ] as const;
    const assets = definitions.map(([name], index) =>
      asset(
        name,
        `2026-12-${String(index + 1).padStart(2, "0")}T00:00:00.000Z`,
        "prop",
      ),
    );
    const resolved = resolveAshenGateAssets(assets);
    for (const [index, [, role]] of definitions.entries()) {
      expect(resolved[role]?.id).toBe(assets[index]?.id);
    }
  });

  test("resolves the canonical Rider character", () => {
    const rider = asset("Descent Rider", "2026-11-04T00:00:00.000Z");
    expect(resolveAshenGateAssets([rider]).rider?.id).toBe(rider.id);
  });

  test("resolves the canonical ember vent prop", () => {
    const vent = asset(
      "Descent Ember Vent",
      "2026-11-01T00:00:00.000Z",
      "prop",
    );
    expect(resolveAshenGateAssets([vent]).emberVent?.id).toBe(vent.id);
  });

  test("resolves the Meshy explorer cache with its generated subtitle", () => {
    const cache = asset(
      "Descent Explorer Cache — a single ornate ancient treasure ch",
      "2026-11-23T00:00:00.000Z",
      "prop",
    );
    expect(resolveAshenGateAssets([cache]).explorerCache?.id).toBe(cache.id);
  });

  test("maps gameplay identities to a small reusable model roster", () => {
    expect(
      assetRoleForUnit({
        classId: "breaker",
        factionId: "horde",
        name: "Cinderjaw",
      }),
    ).toBe("cinderjaw");
    expect(
      assetRoleForUnit({
        classId: "adept",
        factionId: "hold",
        name: "Adept",
      }),
    ).toBe("adept");
    expect(
      assetRoleForUnit({
        classId: "rider",
        factionId: "hold",
        name: "Rider",
      }),
    ).toBe("rider");
    expect(
      assetRoleForUnit({
        classId: "raider",
        factionId: "hold",
        name: "Raider",
      }),
    ).toBe("holdRaider");
    expect(
      assetRoleForUnit({
        classId: "hunter",
        factionId: "horde",
        name: "Imp Hunter",
      }),
    ).toBe("hordeHunter");
    expect(
      assetRoleForUnit({
        classId: "breaker",
        factionId: "horde",
        name: "Imp Breaker",
      }),
    ).toBe("hordeBreaker");
    expect(
      assetRoleForUnit({
        classId: "villager",
        factionId: "hold",
        name: "Villager",
      }),
    ).toBe("villager");
    expect(
      assetRoleForUnit({
        classId: "cultivator",
        factionId: "hold",
        name: "Cultivator",
      }),
    ).toBe("cultivator");
    expect(assetRoleForBuilding("barracks")).toBe("barracks");
    expect(assetRoleForBuilding("cultivator_sanctum")).toBe(
      "cultivatorSanctum",
    );
    expect(assetRoleForBuilding("storehouse")).toBe("storehouse");
    expect(assetRoleForBuilding("omen_tower")).toBe("omenTower");
    expect(assetRoleForBuilding("wall")).toBe("wall");
    expect(assetRoleForBuilding("gate")).toBe("holdGate");
    expect(assetRoleForBuilding("fire_ward_wall")).toBe("fireWard");
    expect(assetRoleForBuilding("well")).toBe("well");
    expect(assetRoleForBuilding("farm")).toBe("farm");
    expect(assetRoleForBuilding("forest")).toBe("forest");
    expect(assetRoleForBuilding("hell_market")).toBe("market");
    expect(assetRoleForBuilding("spirit_herb_garden")).toBe("spiritHerbGarden");
    expect(assetRoleForResource("food")).toBe("resourceGrove");
    expect(assetRoleForResource("spirit_herbs")).toBe("resourceSpiritHerbs");
    expect(assetRoleForResource("wood")).toBe("resourceTree");
    expect(assetRoleForResource("stone")).toBe("resourceOutcrop");
    expect(assetRoleForResource("iron")).toBe("resourceIron");
    expect(assetRoleForResource("coin")).toBe("resourceCoin");
    expect(assetRoleForResource("water")).toBe("resourceWell");
    expect(assetRoleForResource("essence")).toBe("resourceEssence");
    expect(isCharacterAssetRole("warden")).toBe(true);
    expect(isCharacterAssetRole("cinderjaw")).toBe(true);
    expect(isCharacterAssetRole("camp")).toBe(false);
    expect(isCharacterAssetRole("basaltBoulders")).toBe(false);
  });

  test("uses stable former rim assets on real resource and hazard features", () => {
    const ids = Array.from({ length: 24 }, (_, index) => `feature-${index}`);
    const boulderNode = ids.find(
      (id) => assetRoleForResource("stone", id) === "basaltBoulders",
    );
    const oreNode = ids.find(
      (id) => assetRoleForResource("stone", id) === "resourceOutcrop",
    );
    expect(boulderNode).toBeDefined();
    expect(oreNode).toBeDefined();
    expect(assetRoleForResource("stone")).toBe("resourceOutcrop");
    expect(assetRoleForResource("stone", boulderNode)).toBe("basaltBoulders");
    expect(assetRoleForResource("stone", "ashen-stone-near")).toBe(
      "basaltBoulders",
    );
    expect(assetRoleForResource("stone", "ashen-stone-near-cluster")).toBe(
      "resourceOutcrop",
    );

    const spireVent = ids.find((id) => assetRoleForVent(id) === "abyssSpire");
    const ordinaryVent = ids.find((id) => assetRoleForVent(id) === "emberVent");
    expect(spireVent).toBeDefined();
    expect(ordinaryVent).toBeDefined();
    expect(assetRoleForVent(spireVent ?? "")).toBe("abyssSpire");
    expect(isResourceAssetRole("basaltBoulders")).toBe(true);
    expect(isSceneryAssetRole("spiritCrystals")).toBe(true);
    expect(isSceneryAssetRole("rimRuin")).toBe(true);
    expect(isSceneryAssetRole("abyssSpire")).toBe(true);
  });

  test("the Camp grows through Outpost, Stronghold, and Citadel, and Housing and Ward Tower use their own meshes", () => {
    expect(assetRoleForBuilding("camp")).toBe("camp");
    expect(assetRoleForBuilding("camp", "Camp")).toBe("camp");
    expect(assetRoleForBuilding("camp", "Outpost")).toBe("outpost");
    expect(assetRoleForBuilding("camp", "Stronghold")).toBe("stronghold");
    expect(assetRoleForBuilding("camp", "Citadel")).toBe("citadel");
    expect(assetRoleForBuilding("housing", "Camp")).toBe("housing");
    expect(assetRoleForBuilding("ward_tower", "Outpost")).toBe("wardTower");
    expect(assetRoleForBuilding("barracks", "Stronghold")).toBe("barracks");
  });

  test("resolves Qi attack Meshy props including prompt-prefixed names", () => {
    const sword = asset(
      "Descent Qi Flying Sword: stylized dark-fantasy xianxia",
      "2026-11-23T00:00:00.000Z",
      "prop",
    );
    const lotus = asset(
      "Descent Qi Spirit Lotus",
      "2026-11-23T00:00:00.000Z",
      "prop",
    );
    const resolved = resolveAshenGateAssets([sword, lotus]);
    expect(resolved.qiSword?.id).toBe(sword.id);
    expect(resolved.qiLotus?.id).toBe(lotus.id);
  });
});
