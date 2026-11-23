import { describe, expect, test } from "bun:test";
import type { AttackAlert } from "../attackAlert";
import {
  attackAlertsToMinimapPings,
  MINIMAP_PING_DURATION_MS,
  minimapPingPresentation,
  pruneMinimapPings,
} from "../minimapPings";

describe("minimap attack pings", () => {
  test("converts alerts to world-space markers with one shared timestamp", () => {
    const alerts: AttackAlert[] = [
      {
        id: "fx:4",
        severity: "critical",
        targetId: "camp",
        targetKind: "building",
        worldPosition: { x: 12, y: 18 },
      },
    ];
    expect(attackAlertsToMinimapPings(alerts, 500)).toEqual([
      { id: "fx:4", severity: "critical", startedAt: 500, x: 12, y: 18 },
    ]);
  });

  test("expands and fades for 2.5 seconds", () => {
    const ping = { severity: "warning" as const, startedAt: 1_000, x: 5, y: 6 };
    expect(minimapPingPresentation(ping, 1_000, false)).toEqual({
      opacity: 0.95,
      radius: 1.25,
    });
    expect(
      minimapPingPresentation(
        ping,
        1_000 + MINIMAP_PING_DURATION_MS / 2,
        false,
      ),
    ).toEqual({ opacity: 0.475, radius: 4.125 });
    expect(
      minimapPingPresentation(ping, 1_000 + MINIMAP_PING_DURATION_MS, false),
    ).toBeNull();
  });

  test("keeps reduced-motion rings static until they expire", () => {
    const ping = {
      severity: "critical" as const,
      startedAt: 1_000,
      x: 5,
      y: 6,
    };
    const initial = minimapPingPresentation(ping, 1_000, true);
    const middle = minimapPingPresentation(ping, 2_000, true);
    expect(middle).toEqual(initial);
    expect(minimapPingPresentation(ping, 3_500, true)).toBeNull();
  });

  test("prunes expired rings and retains future-dated rings", () => {
    const expired = {
      severity: "warning" as const,
      startedAt: 100,
      x: 1,
      y: 1,
    };
    const future = {
      severity: "warning" as const,
      startedAt: 4_000,
      x: 2,
      y: 2,
    };
    expect(pruneMinimapPings([expired, future], 3_000)).toEqual([future]);
  });
});
