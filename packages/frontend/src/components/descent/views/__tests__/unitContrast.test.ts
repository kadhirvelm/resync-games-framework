import { describe, expect, test } from "bun:test";
import {
  isCultivatorAssetRole,
  SILHOUETTE_OUTLINE_COLOR,
  selectionRingDiameter,
  unitFallbackScale,
  unitHealthBarHeight,
  unitMarkerDiameter,
  unitOutlineWidth,
  unitOwnerRingColor,
  unitTargetHeight,
} from "../unitContrast";

describe("descent unit contrast", () => {
  test("outlines figures in dark ink rather than a light rim", () => {
    const channels = [1, 3, 5].map((start) =>
      Number.parseInt(SILHOUETTE_OUTLINE_COLOR.slice(start, start + 2), 16),
    );
    for (const channel of channels) expect(channel).toBeLessThan(32);
  });

  test("keeps a thin outline at both zoom extents", () => {
    const near = unitOutlineWidth(11, 800, 0.8);
    const far = unitOutlineWidth(72, 800, 0.8);

    expect(far).toBeGreaterThan(near);
    expect(near).toBeGreaterThanOrEqual(0.012);
    expect(far).toBeLessThanOrEqual(0.1);
  });

  test("gives a boss a wider foot marker and a selection ring outside it", () => {
    expect(unitMarkerDiameter("cinderjaw")).toBeGreaterThan(
      unitMarkerDiameter("warden"),
    );
    expect(selectionRingDiameter("warden")).toBeGreaterThan(
      unitMarkerDiameter("warden"),
    );
    expect(selectionRingDiameter("cinderjaw")).toBeGreaterThan(
      unitMarkerDiameter("cinderjaw"),
    );
  });

  test("makes cultivators visibly larger than ordinary soldiers while keeping bosses largest", () => {
    for (const role of [
      "cultivator",
      "swordSage",
      "formationMaster",
      "emberCultivator",
      "rimeCultivator",
      "bloodCultivator",
    ]) {
      expect(isCultivatorAssetRole(role)).toBe(true);
      expect(unitTargetHeight(role)).toBeGreaterThan(
        unitTargetHeight("warden"),
      );
      expect(unitFallbackScale(role)).toBeGreaterThan(
        unitFallbackScale("adept"),
      );
      expect(unitHealthBarHeight(role)).toBeGreaterThan(
        unitHealthBarHeight("warden"),
      );
      expect(unitMarkerDiameter(role)).toBeGreaterThan(
        unitMarkerDiameter("warden"),
      );
      expect(unitMarkerDiameter("cinderjaw")).toBeGreaterThan(
        unitMarkerDiameter(role),
      );
    }
    expect(isCultivatorAssetRole("warden")).toBe(false);
    expect(isCultivatorAssetRole("adept")).toBe(false);
  });

  test("uses the assigned player color with faction fallbacks", () => {
    expect(unitOwnerRingColor("hold", "#4db8ff")).toBe("#4db8ff");
    expect(unitOwnerRingColor("hold")).toBe("#e8bf6a");
    expect(unitOwnerRingColor("horde", "#4db8ff")).toBe("#e0523c");
  });
});
