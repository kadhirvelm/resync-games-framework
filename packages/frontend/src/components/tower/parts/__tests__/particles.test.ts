import { describe, expect, test } from "bun:test";
import {
  burstParticles,
  rainParticles,
  scatter,
  staggerSchedule,
} from "../particles";

describe("scatter", () => {
  test("stays in [0, 1) and repeats for the same input", () => {
    for (let index = 0; index < 50; index += 1) {
      const value = scatter(index, 3);
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
      expect(scatter(index, 3)).toBe(value);
    }
  });
});

describe("burstParticles", () => {
  test("spreads particles around the circle within the distance range", () => {
    const particles = burstParticles(12, {
      maxDistance: 200,
      minDistance: 100,
      palette: 3,
    });
    expect(particles).toHaveLength(12);
    for (const particle of particles) {
      expect(particle.distance).toBeGreaterThanOrEqual(100);
      expect(particle.distance).toBeLessThanOrEqual(200);
      expect(particle.colorIndex).toBeLessThan(3);
    }
    const quarters = new Set(
      particles.map((particle) =>
        Math.floor((((particle.angle % 360) + 360) % 360) / 90),
      ),
    );
    expect(quarters.size).toBe(4);
  });

  test("an empty burst has no particles", () => {
    expect(
      burstParticles(0, { maxDistance: 10, minDistance: 5, palette: 2 }),
    ).toEqual([]);
  });

  test("different seeds give different layouts", () => {
    const options = { maxDistance: 200, minDistance: 50, palette: 2 };
    expect(burstParticles(6, { ...options, seed: 1 })).not.toEqual(
      burstParticles(6, { ...options, seed: 9 }),
    );
  });
});

describe("rainParticles", () => {
  test("covers the screen width with positive fall times", () => {
    const leaves = rainParticles(30, 4);
    expect(leaves).toHaveLength(30);
    for (const leaf of leaves) {
      expect(leaf.x).toBeGreaterThanOrEqual(0);
      expect(leaf.x).toBeLessThanOrEqual(100);
      expect(leaf.duration).toBeGreaterThan(3);
      expect(leaf.colorIndex).toBeLessThan(4);
    }
  });
});

describe("staggerSchedule", () => {
  test("spaces beats evenly and raises the pitch", () => {
    expect(staggerSchedule(3, 100, 50, 0.1)).toEqual([
      { atMs: 100, pitch: 1 },
      { atMs: 150, pitch: 1.1 },
      { atMs: 200, pitch: 1.2 },
    ]);
  });

  test("no beats for nothing", () => {
    expect(staggerSchedule(0, 0, 10)).toEqual([]);
  });
});
