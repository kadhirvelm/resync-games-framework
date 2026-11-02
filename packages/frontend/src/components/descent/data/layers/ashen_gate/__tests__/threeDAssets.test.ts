import { describe, expect, test } from "bun:test";
import type { ThreeDAsset, ThreeDAssetKind } from "@resync-game-framework/api";
import {
  assetRoleForBuilding,
  assetRoleForResource,
  assetRoleForUnit,
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

  test("resolves the canonical ember vent prop", () => {
    const vent = asset(
      "Descent Ember Vent",
      "2026-11-01T00:00:00.000Z",
      "prop",
    );
    expect(resolveAshenGateAssets([vent]).emberVent?.id).toBe(vent.id);
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
    expect(assetRoleForBuilding("barracks")).toBe("barracks");
    expect(assetRoleForBuilding("fire_ward_wall")).toBe("fireWard");
    expect(assetRoleForResource("food")).toBe("resourceGrove");
    expect(assetRoleForResource("spirit_herbs")).toBe("resourceGrove");
    expect(assetRoleForResource("wood")).toBe("resourceTree");
    expect(assetRoleForResource("iron")).toBe("resourceOutcrop");
    expect(assetRoleForResource("essence")).toBe("resourceWell");
  });
});
