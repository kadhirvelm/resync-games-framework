import { createCombatUnit } from "../combat/combatSimulation";
import type { CombatUnit } from "../combat/types";
import { getUnitDefinition } from "../combat/unitCatalog";
import type { LayerId } from "../layers/layerTypes";
import { getSchedule } from "./catalog";
import {
  announceOmen,
  createWaveState,
  damageWaveUnit,
  readOmen,
  resolveWaveTick,
} from "./clock";
import { TICKS_PER_SECOND } from "./constants";
import type {
  ArenaHazard,
  BossDrops,
  DamageKind,
  DescendGateResult,
  EncounterState,
  OmenPreview,
  SpawnBounds,
  WaveEvent,
  WaveGatePort,
  WaveUnit,
} from "./types";

/**
 * In-memory gate used when the layers runtime is not attached. Opening it
 * still requires a boss casualty; nothing in the intro path calls it.
 */
class LocalBossGate implements WaveGatePort {
  private cleared = false;

  /**
   * Reports the local gate.
   * @returns Whether a boss casualty opened it
   */
  isBossGateCleared(): boolean {
    return this.cleared;
  }

  /**
   * Sets the local gate.
   * @param cleared - Next gate state
   */
  setBossGateCleared(cleared: boolean): void {
    this.cleared = cleared;
  }
}

/**
 * Headless wave clock. The sim module calls the same tick function once per
 * sim tick; this class is the direct entry for tests and for a host that
 * has not registered the module. `step` does nothing while paused. Speed
 * belongs to the sim, which simply steps more ticks per frame.
 */
export class WaveDirector {
  private readonly events: WaveEvent[] = [];
  private readonly gate: WaveGatePort;
  private readonly map: SpawnBounds | undefined;
  private omenTower = false;
  private paused = false;
  private pendingEssence = 0;
  private simTicks = 0;
  private state: ReturnType<typeof createWaveState> | null = null;

  /**
   * Creates a director. Pass the layers runtime so a boss kill can open
   * its descent gate, and the map so spawns fit inside it.
   * @param options - Optional gate port and map bounds (default 64x40)
   */
  constructor(options: { gate?: WaveGatePort; map?: SpawnBounds } = {}) {
    this.gate = options.gate ?? new LocalBossGate();
    this.map = options.map ? { ...options.map } : undefined;
  }

  /** Completed sim ticks since the current layer started. */
  get tick(): number {
    return this.state?.completedTick ?? 0;
  }

  /**
   * Completed sim ticks since the director was created. Never resets on a
   * new layer, so it is the clock the layers runtime expects.
   * @returns Monotonic tick count
   */
  get totalTicks(): number {
    return this.simTicks;
  }

  /**
   * Arms a layer at sim time zero and closes the descent gate.
   * Collected essence and the Omen Tower flag carry over.
   * @param layerId - Layer whose schedule should run
   */
  startLayer(layerId: LayerId): void {
    getSchedule(layerId);
    const essence = this.state?.collectedEssence ?? this.pendingEssence;
    this.state = createWaveState(layerId, 0, this.map);
    this.state.collectedEssence = essence;
    this.state.omenTower = this.omenTower;
    this.pendingEssence = essence;
    this.paused = false;
    this.events.length = 0;
    this.gate.setBossGateCleared(false);
  }

  /**
   * Pauses or resumes the wave clock. Queued work does not run while paused.
   * @param paused - Whether ticks should freeze
   */
  setPaused(paused: boolean): void {
    this.paused = paused;
  }

  /**
   * Records whether an Omen Tower is built. Economy places the building;
   * this flag is how a headless clock sees it. Turning it on inside the
   * 60 second window horns immediately.
   * @param present - Whether the tower is built
   */
  setOmenTowerPresent(present: boolean): void {
    this.omenTower = present;
    if (!this.state) return;
    this.state.omenTower = present;
    this.events.push(...announceOmen(this.state));
  }

  /**
   * Sets harvested essence used by wave power. Later kills add to it.
   * @param amount - Essence stockpile
   */
  setCollectedEssence(amount: number): void {
    const next = Number.isFinite(amount) ? Math.max(0, amount) : 0;
    this.pendingEssence = next;
    if (this.state) this.state.collectedEssence = next;
  }

  /**
   * Advances the layer clock by whole sim ticks. Paused calls advance nothing.
   * @param tickCount - Ticks to resolve, default one
   */
  step(tickCount = 1): void {
    if (!Number.isSafeInteger(tickCount) || tickCount < 0) {
      throw new RangeError(
        `step() needs a non-negative integer, received ${tickCount}`,
      );
    }
    if (tickCount === 0 || this.paused || this.state === null) return;
    for (let index = 0; index < tickCount; index += 1) {
      this.simTicks += 1;
      this.state.completedTick += 1;
      this.events.push(...resolveWaveTick(this.state));
    }
  }

  /**
   * Class mix of the next wave when the Omen Tower can see it.
   * @returns Eta and counts, or null
   */
  getOmen(): OmenPreview | null {
    if (!this.state) return null;
    return readOmen(this.state);
  }

  /**
   * Hell Pressure on the current layer, from 0 to 1.
   * @returns The meter
   */
  getHellPressure(): number {
    return this.state?.hellPressure ?? 0;
  }

  /**
   * Reports whether the attached gate is open.
   * @returns True after the layer boss has died
   */
  isBossGateCleared(): boolean {
    return this.gate.isBossGateCleared();
  }

  /**
   * Asks to descend. Closed while the boss lives. A layers runtime also
   * rejects the final layer and, on success, this clock restarts on the
   * next schedule.
   * @returns Whether descent was accepted
   */
  requestDescend(): DescendGateResult {
    if (!this.state) return { ok: false, reason: "boss_gate_closed" };
    if (!this.gate.descend) {
      if (!this.gate.isBossGateCleared()) {
        return { ok: false, reason: "boss_gate_closed" };
      }
      return { ok: true };
    }
    const result = this.gate.descend(this.simTicks / TICKS_PER_SECOND);
    if (!result.ok) {
      return { ok: false, reason: result.reason ?? "boss_gate_closed" };
    }
    if (result.layer) this.startLayer(result.layer.id);
    return { ok: true };
  }

  /**
   * Applies damage to a horde body. A boss death opens the descent gate.
   * Pass post-armor damage; only the Armored affix is applied here.
   * @param unitId - Body to hit
   * @param amount - Damage after armor
   * @param kind - Physical blows meet Armored; spells do not
   */
  damageUnit(
    unitId: string,
    amount: number,
    kind: DamageKind = "physical",
  ): void {
    if (!this.state) return;
    const opened = this.state.bossGateCleared;
    this.events.push(...damageWaveUnit(this.state, unitId, amount, kind));
    if (!opened && this.state.bossGateCleared) {
      this.gate.setBossGateCleared(true);
    }
  }

  /**
   * Records a fallen building. The clock keeps running and the gate stays
   * shut: one lost building does not end the descent.
   * @param buildingId - Building that fell
   */
  notifyBuildingFell(buildingId: string): void {
    this.events.push({ buildingId, type: "building_fell" });
  }

  /**
   * Living horde bodies.
   * @returns Copies of the current units
   */
  getUnits(): readonly WaveUnit[] {
    if (!this.state) return [];
    return this.state.units.map((unit) => structuredClone(unit));
  }

  /**
   * Combat stubs for the living horde. Each uses a catalog class id.
   * @returns Units the combat chunk can drop into its simulation
   */
  getCombatUnits(): CombatUnit[] {
    return this.getUnits().map((unit) => toCombatUnit(unit));
  }

  /**
   * Events since the layer started, oldest first.
   * @returns Copies of the event log
   */
  getEvents(): readonly WaveEvent[] {
    return this.events.map((event) => structuredClone(event));
  }

  /**
   * Drops from the boss killed on this layer, if any.
   * @returns The reward, or null while the boss lives
   */
  getDrops(): BossDrops | null {
    if (!this.state?.bossDrops) return null;
    return structuredClone(this.state.bossDrops);
  }

  /**
   * Essence paid for horde kills other than the boss drop.
   * @returns Running total for this layer
   */
  getKillEssence(): number {
    return this.state?.killEssence ?? 0;
  }

  /**
   * Arena modifiers from boss phases, including the Warden's rotated rule.
   * @returns Vision, move speed, and the active rule
   */
  getEncounter(): EncounterState {
    if (!this.state) {
      return {
        lifedrain: false,
        moveSpeedMultiplier: 1,
        rotatedRule: null,
        visionMultiplier: 1,
      };
    }
    return structuredClone(this.state.encounter);
  }

  /**
   * Ground hazards placed by boss phases.
   * @returns Copies of the hazard list
   */
  getHazards(): readonly ArenaHazard[] {
    if (!this.state) return [];
    return this.state.hazards.map((hazard) => structuredClone(hazard));
  }
}

/**
 * Builds a combat entity from a wave body so fights use the same class ids.
 * @param unit - Horde body
 * @returns A combat unit flagged as a wave unit
 */
export function toCombatUnit(unit: WaveUnit): CombatUnit {
  const definition = getUnitDefinition(unit.classId);
  const combat = createCombatUnit(definition, {
    factionId: unit.factionId,
    id: unit.id,
    isWaveUnit: true,
    position: { x: unit.x, y: unit.y },
    ...(unit.school ? { school: unit.school } : {}),
  });
  combat.armor = unit.armor;
  combat.damage = unit.damage;
  combat.hitPoints = unit.hitPoints;
  combat.maxHitPoints = unit.maxHitPoints;
  combat.speed = unit.speed;
  combat.vision = unit.vision;
  return combat;
}
