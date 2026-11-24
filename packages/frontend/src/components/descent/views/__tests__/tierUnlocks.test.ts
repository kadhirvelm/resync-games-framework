import { afterEach, describe, expect, jest, test } from "bun:test";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { HoldTier } from "../../logic/economy/model";
import { TIER_UNLOCK_BANNER_MS, TierUnlockBanner } from "../TierUnlockBanner";
import {
  didHoldTierAdvance,
  HOLD_TIER_ORDER,
  holdTierRank,
  tierUnlockSummary,
} from "../tierUnlocks";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

describe("tierUnlockSummary", () => {
  test("returns null for Camp", () => {
    expect(tierUnlockSummary("Camp")).toBeNull();
  });

  test("returns Outpost units and buildings", () => {
    const summary = tierUnlockSummary("Outpost");
    expect(summary).not.toBeNull();
    expect(summary?.tier).toBe("Outpost");
    expect(summary?.units).toEqual([
      "Hunters",
      "Riders",
      "Sword & Flying-Sword Cultivators",
    ]);
    expect(summary?.buildings).toEqual([
      "Ward Tower",
      "Farm",
      "Gate",
      "Omen Tower",
      "Cultivator Sanctum",
      "Spirit Array",
      "Cultivation Hall",
    ]);
    expect(summary?.headline).toContain("Outpost");
    expect(summary?.summary).toContain("Hunters");
  });

  test("returns Stronghold buildings", () => {
    const summary = tierUnlockSummary("Stronghold");
    expect(summary).not.toBeNull();
    expect(summary?.tier).toBe("Stronghold");
    expect(summary?.units).toEqual(["Formation Masters"]);
    expect(summary?.buildings).toEqual(["Hell Market", "Meditation Pavilion"]);
  });

  test("returns Citadel buildings", () => {
    const summary = tierUnlockSummary("Citadel");
    expect(summary).not.toBeNull();
    expect(summary?.tier).toBe("Citadel");
    expect(summary?.units).toEqual([]);
    expect(summary?.buildings).toEqual([
      "Spirit Herb Garden",
      "Alchemy Furnace",
    ]);
  });

  test("ranks Hold tiers strictly in ascending order", () => {
    expect(HOLD_TIER_ORDER.map(holdTierRank)).toEqual([0, 1, 2, 3]);
    expect(didHoldTierAdvance("Camp", "Outpost")).toBe(true);
    expect(didHoldTierAdvance("Outpost", "Stronghold")).toBe(true);
    expect(didHoldTierAdvance("Stronghold", "Citadel")).toBe(true);
    expect(didHoldTierAdvance("Outpost", "Outpost")).toBe(false);
    expect(didHoldTierAdvance("Stronghold", "Camp")).toBe(false);
  });
});

describe("TierUnlockBanner", () => {
  let container: HTMLDivElement | undefined;
  let root: Root | undefined;

  afterEach(async () => {
    jest.useRealTimers();
    if (root !== undefined) {
      const currentRoot = root;
      root = undefined;
      await act(async () => {
        currentRoot.unmount();
      });
    }
    container?.remove();
    container = undefined;
  });

  /**
   * Mounts or updates TierUnlockBanner with a Hold tier.
   * @param holdTier - Current Hold tier
   */
  async function renderTier(holdTier: HoldTier) {
    if (container === undefined || root === undefined) {
      container = document.createElement("div");
      document.body.appendChild(container);
      root = createRoot(container);
    }
    const targetRoot = root;
    await act(async () => {
      targetRoot.render(createElement(TierUnlockBanner, { holdTier }));
    });
  }

  test("does not render on initial mount, even when loading a save at Outpost", async () => {
    await renderTier("Outpost");
    expect(
      container?.querySelector('[data-testid="tier-unlock-banner"]'),
    ).toBeNull();
  });

  test("displays when holdTier advances and dismisses on button click", async () => {
    await renderTier("Camp");
    expect(
      container?.querySelector('[data-testid="tier-unlock-banner"]'),
    ).toBeNull();

    await renderTier("Outpost");
    const banner = container?.querySelector(
      '[data-testid="tier-unlock-banner"]',
    );
    expect(banner).not.toBeNull();
    expect(banner?.getAttribute("data-tier")).toBe("Outpost");
    expect(banner?.textContent).toContain("Hold Upgraded: Outpost");
    expect(banner?.textContent).toContain("Hunters");
    expect(banner?.textContent).toContain("Ward Tower");

    const dismiss = banner?.querySelector("button");
    expect(dismiss).not.toBeNull();
    await act(async () => {
      dismiss?.click();
    });
    expect(
      container?.querySelector('[data-testid="tier-unlock-banner"]'),
    ).toBeNull();
  });

  test("auto-dismisses after the configured duration", async () => {
    jest.useFakeTimers();
    await renderTier("Outpost");
    await renderTier("Stronghold");
    expect(
      container?.querySelector('[data-testid="tier-unlock-banner"]'),
    ).not.toBeNull();

    await act(async () => {
      jest.advanceTimersByTime(TIER_UNLOCK_BANNER_MS);
    });
    expect(
      container?.querySelector('[data-testid="tier-unlock-banner"]'),
    ).toBeNull();
  });
});
