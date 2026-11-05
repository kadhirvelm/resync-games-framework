import { describe, expect, test } from "bun:test";
import { createFogOfWar, revealFogOfWar } from "../../logic/fog";
import type { SimSnapshot } from "../../logic/types";
import { effectsInSight, exploredFeatures, visibleToHold } from "../fogFilter";
import { FOG_SHADE, fogShadeGrid, fogShadePixels } from "../fogShade";
import { buildShellModel } from "../shellModel";

/** 20×10 map: seen around (3,5), currently in sight around (16,5). */
const fog = revealFogOfWar(
  revealFogOfWar(createFogOfWar({ height: 10, width: 20 }), [
    { radius: 2, x: 3, y: 5 },
  ]),
  [{ radius: 2, x: 16, y: 5 }],
);

describe("fog filtering", () => {
  test("horde bodies show only in sight; the Hold always shows", () => {
    const entries = [
      { factionId: "hold" as const, id: "hold-dark", x: 10, y: 1 },
      { factionId: "horde" as const, id: "horde-seen", x: 3, y: 5 },
      { factionId: "horde" as const, id: "horde-live", x: 16, y: 5 },
    ];
    expect(visibleToHold(entries, fog).map((entry) => entry.id)).toEqual([
      "hold-dark",
      "horde-live",
    ]);
    expect(visibleToHold(entries, null)).toHaveLength(3);
  });

  test("deposits show once explored and effects only in sight", () => {
    const features = [
      { id: "remembered", x: 3, y: 5 },
      { id: "unknown", x: 10, y: 1 },
    ];
    expect(exploredFeatures(features, fog).map((entry) => entry.id)).toEqual([
      "remembered",
    ]);
    expect(
      effectsInSight(
        [
          { id: 1, kind: "death", tick: 0, x: 3, y: 5 },
          {
            from: { x: 16, y: 5 },
            id: 2,
            kind: "projectile",
            tick: 0,
            to: { x: 10, y: 1 },
          },
        ],
        fog,
      ).map((effect) => effect.id),
    ).toEqual([2]);
  });

  test("the shell model hides a horde body out of sight", () => {
    const snapshot: SimSnapshot = {
      buildings: [],
      layerId: "ashen_gate",
      map: { height: 10, width: 20 },
      meta: {
        ui: {
          fog,
          units: {
            near: { factionId: "horde" },
            scout: { factionId: "hold" },
            seen: { factionId: "horde" },
          },
        },
      },
      paused: false,
      resources: {
        coin: 0,
        essence: 0,
        food: 0,
        iron: 0,
        spirit_herbs: 0,
        stone: 0,
        water: 0,
        wood: 0,
      },
      speed: 1,
      tick: 0,
      units: [
        { classId: "warden", id: "scout", x: 16, y: 5 },
        { classId: "raider", id: "near", x: 17, y: 5 },
        { classId: "raider", id: "seen", x: 3, y: 5 },
      ],
    };
    const model = buildShellModel(snapshot);
    expect(model.units.map((unit) => unit.id)).toEqual(["scout", "near"]);
  });
});

describe("fog shading", () => {
  test("shades each state and repeats edge tiles into the margin", () => {
    const grid = fogShadeGrid(fog, 2);
    expect(grid.width).toBe(24);
    expect(grid.height).toBe(14);
    const at = (x: number, y: number) => grid.alpha[(y + 2) * 24 + (x + 2)];
    expect(at(16, 5)).toBe(Math.round(FOG_SHADE.visible * 255));
    expect(at(3, 5)).toBe(Math.round(FOG_SHADE.explored * 255));
    expect(at(10, 1)).toBe(255);
    expect(at(-2, 5)).toBe(at(0, 5));
    expect(at(21, 5)).toBe(at(19, 5));
  });

  test("expands opacity into fog-colored pixels", () => {
    const pixels = fogShadePixels(fogShadeGrid(fog));
    expect(pixels).toHaveLength(20 * 10 * 4);
    expect(pixels[3]).toBe(255);
  });
});
