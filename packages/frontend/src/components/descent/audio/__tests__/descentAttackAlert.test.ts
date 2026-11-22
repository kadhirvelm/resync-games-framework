import { describe, expect, test } from "bun:test";
import type { AttackAlert } from "../../views/attackAlert";
import {
  DESCENT_ATTACK_ALERT_AUDIO_SPEC,
  emitDescentAttackAlert,
  emitDescentAttackAlerts,
  playDescentAttackAlert,
  subscribeDescentAttackAlerts,
} from "../descentAttackAlert";

/**
 * Creates one alert for publication tests.
 * @param id - Stable alert id
 * @returns Warning-severity unit alert
 */
function alert(id: string): AttackAlert {
  return {
    id,
    severity: "warning",
    targetId: `unit-${id}`,
    targetKind: "unit",
    worldPosition: { x: 4, y: 5 },
  };
}

describe("descentAttackAlert", () => {
  test("defines a short generated warning outside the contested manifest", () => {
    expect(DESCENT_ATTACK_ALERT_AUDIO_SPEC.id).toBe("under-attack");
    expect(DESCENT_ATTACK_ALERT_AUDIO_SPEC.loop).toBe(false);
    expect(DESCENT_ATTACK_ALERT_AUDIO_SPEC.direction).toContain("war-drum");
    expect(DESCENT_ATTACK_ALERT_AUDIO_SPEC.direction).toContain(
      "under 1.2 seconds",
    );
  });

  test("publishes each alert and stops after unsubscribe", () => {
    const received: AttackAlert[] = [];
    const unsubscribe = subscribeDescentAttackAlerts((alert) => {
      received.push(alert);
    });
    emitDescentAttackAlerts([alert("one"), alert("two")]);
    unsubscribe();
    emitDescentAttackAlert(alert("three"));
    expect(received.map((entry) => entry.id)).toEqual(["one", "two"]);
  });

  test("ignores empty batches and degrades to silence before audio unlock", () => {
    const received: AttackAlert[] = [];
    const unsubscribe = subscribeDescentAttackAlerts((alert) => {
      received.push(alert);
    });
    emitDescentAttackAlerts([]);
    expect(() => playDescentAttackAlert("critical")).not.toThrow();
    unsubscribe();
    expect(received).toEqual([]);
  });
});
