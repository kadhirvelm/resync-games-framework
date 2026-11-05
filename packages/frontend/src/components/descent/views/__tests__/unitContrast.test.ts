import { describe, expect, test } from "bun:test";
import {
  SILHOUETTE_OUTLINE_COLOR,
  selectionRingDiameter,
  unitMarkerDiameter,
  unitOutlineWidth,
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
});
