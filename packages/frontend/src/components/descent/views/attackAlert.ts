import type { CombatEvent } from "../logic/combat/types";
import type { SimSnapshot } from "../logic/types";
import {
  type FxReadout,
  type ReadPresentation,
  readPresentation,
} from "./presentation";
import { isLocalPlayerOwned, type MapPoint } from "./selection";

/** Minimum wall-clock time between alerts from one world region. */
export const ATTACK_ALERT_COOLDOWN_MS = 8_000;

/** Side of a square alert-rate-limit region, in world units. */
export const ATTACK_ALERT_REGION_SIZE = 16;

/** Oldest published effect age after the sim increments its snapshot tick. */
const PUBLISHED_EFFECT_MAX_AGE_TICKS = 17;

/** Meta key owned by the Ashen Gate integration slice. */
const ASHEN_GATE_SLICE_META_KEY = "ashenGateSlice";

/** Maximum distance between an effect and its published target position. */
const TARGET_POSITION_TOLERANCE = 0.9;

/** Maximum distance between an attack effect and its attacker's new position. */
const SOURCE_POSITION_TOLERANCE = 1.25;

/** Combat-body prefix used by armed buildings. */
const TOWER_BODY_PREFIX = "tower:";

/** Urgency carried by an alert and its minimap ping. */
export type AttackAlertSeverity = "critical" | "warning";

/** One enemy-damage alert for the local player. */
export interface AttackAlert {
  /** Stable id for deduplicating React keys and sound batches. */
  id: string;
  severity: AttackAlertSeverity;
  targetId: string;
  targetKind: "building" | "unit";
  worldPosition: MapPoint;
}

/** Serializable reducer state; no timers or mutable browser handles. */
export interface AttackAlertState {
  readonly lastAlertAtByRegion: Readonly<Record<string, number>>;
  readonly previousSnapshot: SimSnapshot | null;
}

/** Inputs for one pure alert-detection update. */
export interface AttackAlertInput {
  /** Exact combat events when a caller has them; otherwise snapshot FX is used. */
  events?: readonly CombatEvent[];
  /** Local co-op owner id; omitted means the solo Hold. */
  localPlayerId?: string;
  /** Wall-clock milliseconds used only for cooldown decisions. */
  now: number;
  snapshot: SimSnapshot;
}

/** Alerts emitted by an update and the state to pass to the next update. */
export interface AttackAlertUpdate {
  alerts: readonly AttackAlert[];
  state: AttackAlertState;
}

interface AttackEntity {
  factionId: "hold" | "horde";
  hitPoints: number | null;
  id: string;
  kind: "building" | "unit";
  maxHitPoints: number | null;
  ownerId?: string;
  /** Boss area radius published by the wave clock, if this body has one. */
  splashRadius: number | null;
  x: number;
  y: number;
}

interface SnapshotIndex {
  entities: ReadonlyMap<string, AttackEntity>;
  fx: ReadPresentation["fx"];
  lastHitTick: Readonly<Record<string, number>>;
  tick: number;
}

type DamageEffect = Extract<FxReadout, { kind: "damage" }>;

/** Creates empty state for a new Descent session. */
export function createAttackAlertState(): AttackAlertState {
  return { lastAlertAtByRegion: {}, previousSnapshot: null };
}

/**
 * Returns the cooldown bucket containing a world position.
 * @param point - Position in sim map units
 * @returns Stable region key
 */
export function attackAlertRegionKey(point: MapPoint): string {
  const x = Math.floor(point.x / ATTACK_ALERT_REGION_SIZE);
  const y = Math.floor(point.y / ATTACK_ALERT_REGION_SIZE);
  return `${x}:${y}`;
}

/**
 * Detects enemy damage to locally owned Hold entities without reading clocks or
 * mutating inputs. Call once per new snapshot and feed the returned state back.
 * Snapshot loading and unchanged ticks emit nothing. Exact combat events take
 * precedence; otherwise new damage FX identify unit/turret hits and HP changes
 * plus hostile attack FX identify direct building hits. Boss splash uses its
 * published wave radius. Vent-only HP loss has no damage FX and does not raise
 * an alert. Damage older than the sim's published FX history cannot be
 * reconstructed from snapshots alone; callers with that history can use
 * `events` instead.
 * @param state - Previous reducer state
 * @param input - Current snapshot, ownership, optional events, and time
 * @returns At most one alert per region per cooldown window and the next state
 */
export function updateAttackAlerts(
  state: AttackAlertState,
  input: AttackAlertInput,
): AttackAlertUpdate {
  const restarted = hasRestarted(state.previousSnapshot, input.snapshot);
  if (restarted) {
    return {
      alerts: [],
      state: { lastAlertAtByRegion: {}, previousSnapshot: input.snapshot },
    };
  }
  const previousSnapshot = state.previousSnapshot;
  const unchanged = previousSnapshot?.tick === input.snapshot.tick;
  let candidates: AttackAlert[] = [];
  if (!unchanged && input.events !== undefined) {
    candidates = alertsFromEvents(input, previousSnapshot);
  }
  if (!unchanged && input.events === undefined && previousSnapshot !== null) {
    candidates = alertsFromSnapshots(input, previousSnapshot);
  }
  const limited = limitAlerts(candidates, input.now, state.lastAlertAtByRegion);
  return {
    alerts: limited.alerts,
    state: {
      lastAlertAtByRegion: limited.lastAlertAtByRegion,
      previousSnapshot: input.snapshot,
    },
  };
}

/**
 * Checks whether a snapshot belongs to a fresh run or a different layer.
 * @param previous - Previously processed snapshot
 * @param current - Current snapshot
 * @returns Whether history and cooldowns should be discarded
 */
function hasRestarted(
  previous: SimSnapshot | null,
  current: SimSnapshot,
): boolean {
  if (previous === null) return false;
  if (current.tick < previous.tick) return true;
  return current.layerId !== previous.layerId;
}

/**
 * Converts exact combat damage events into candidate alerts.
 * @param input - Current alert input
 * @param previousSnapshot - Prior snapshot, used for fallen targets/attackers
 * @returns Unthrottled local enemy-damage alerts
 */
function alertsFromEvents(
  input: AttackAlertInput,
  previousSnapshot: SimSnapshot | null,
): AttackAlert[] {
  const current = indexSnapshot(input.snapshot);
  const previous =
    previousSnapshot === null ? null : indexSnapshot(previousSnapshot);
  const alerts: AttackAlert[] = [];
  for (const [index, event] of (input.events ?? []).entries()) {
    if (event.kind !== "damage_applied" && event.kind !== "building_damaged") {
      continue;
    }
    if (!(event.amount > 0)) continue;
    const source = entityById(event.sourceId, current, previous);
    if (source?.factionId !== "horde") continue;
    const target = entityById(event.targetId, current, previous);
    if (!isLocalTarget(target, input.localPlayerId)) continue;
    const hitPoints =
      event.kind === "building_damaged" ? event.hitPoints : undefined;
    alerts.push(
      makeAlert(
        `event:${input.snapshot.tick}:${index}`,
        target,
        current,
        hitPoints,
      ),
    );
  }
  return alerts;
}

/**
 * Converts newly published presentation data into candidate alerts.
 * @param input - Current alert input
 * @param previousSnapshot - Prior snapshot
 * @returns Unthrottled local enemy-damage alerts
 */
function alertsFromSnapshots(
  input: AttackAlertInput,
  previousSnapshot: SimSnapshot,
): AttackAlert[] {
  const current = indexSnapshot(input.snapshot);
  const previous = indexSnapshot(previousSnapshot);
  const previousFxIds = new Set(previous.fx.map((effect) => effect.id));
  const newDamage = current.fx.filter(
    (effect): effect is DamageEffect =>
      effect.kind === "damage" &&
      !previousFxIds.has(effect.id) &&
      effect.tick >= previousSnapshot.tick &&
      effect.amount > 0,
  );
  const alerts: AttackAlert[] = [];
  const alertedTargetIds = new Set<string>();
  for (const effect of newDamage) {
    const target = damagedTargetAt(
      effect,
      current,
      previous,
      input.localPlayerId,
    );
    if (target === undefined) continue;
    alerts.push(makeAlert(`fx:${effect.id}`, target, current));
    alertedTargetIds.add(target.id);
  }
  const targets = historicalEntities(current, previous);
  for (const target of targets.values()) {
    if (alertedTargetIds.has(target.id)) continue;
    if (!isLocalTarget(target, input.localPlayerId)) continue;
    if (target.kind === "unit") {
      const damageTick = unitDamageTicks(target.id, current, previous).find(
        (tick) => hasBossSplashAt(target, tick, current, previous),
      );
      if (damageTick === undefined) continue;
      alerts.push(
        makeAlert(`splash:${target.id}:${damageTick}`, target, current),
      );
      alertedTargetIds.add(target.id);
      continue;
    }
    if (!buildingLostHitPoints(target.id, current, previous)) continue;
    if (!hasHostileAttackAt(target, current, previous)) continue;
    alerts.push(
      makeAlert(
        `building:${target.id}:${input.snapshot.tick}`,
        target,
        current,
      ),
    );
  }
  return alerts;
}

/**
 * Finds the local entity actually hit by a new damage effect.
 * @param effect - Published unit/turret damage cue
 * @param current - Current snapshot index
 * @param previous - Previous snapshot index
 * @param localPlayerId - Local co-op owner, if any
 * @returns Nearest damaged local target, if one can be attributed
 */
function damagedTargetAt(
  effect: DamageEffect,
  current: SnapshotIndex,
  previous: SnapshotIndex,
  localPlayerId?: string,
): AttackEntity | undefined {
  const candidates = historicalEntities(current, previous);
  let nearest: AttackEntity | undefined;
  let nearestDistance = Number.POSITIVE_INFINITY;
  for (const target of candidates.values()) {
    if (!isLocalTarget(target, localPlayerId)) continue;
    if (!wasDamagedByEffect(target.id, effect.tick, current, previous))
      continue;
    const distance = distanceToEntity(effect, target.id, current, previous);
    if (distance > TARGET_POSITION_TOLERANCE || distance >= nearestDistance) {
      continue;
    }
    nearest = target;
    nearestDistance = distance;
  }
  return nearest;
}

/**
 * Combines previous and current entities, preferring current positions/HP.
 * @param current - Current snapshot index
 * @param previous - Previous snapshot index
 * @returns Mutable lookup used only inside one pure update
 */
function historicalEntities(
  current: SnapshotIndex,
  previous: SnapshotIndex,
): Map<string, AttackEntity> {
  const entities = new Map(previous.entities);
  for (const [id, entity] of current.entities) entities.set(id, entity);
  return entities;
}

/**
 * Checks the sim's damage bookkeeping or displayed HP for a matching hit.
 * @param targetId - Candidate target id
 * @param effectTick - Tick that produced the damage effect
 * @param current - Current snapshot index
 * @param previous - Previous snapshot index
 * @returns Whether this target took the published hit
 */
function wasDamagedByEffect(
  targetId: string,
  effectTick: number,
  current: SnapshotIndex,
  previous: SnapshotIndex,
): boolean {
  const before = previous.entities.get(targetId);
  const after = current.entities.get(targetId);
  if (before !== undefined && after === undefined) return true;
  if (current.lastHitTick[targetId] === effectTick) return true;
  if (before?.hitPoints === null || before?.hitPoints === undefined)
    return false;
  if (after?.hitPoints === null || after?.hitPoints === undefined) return false;
  return after.hitPoints < before.hitPoints;
}

/**
 * Reads the closest published position of an entity to an effect.
 * @param point - Effect position
 * @param targetId - Entity id
 * @param current - Current snapshot index
 * @param previous - Previous snapshot index
 * @returns Distance in world units, or infinity when the entity is absent
 */
function distanceToEntity(
  point: MapPoint,
  targetId: string,
  current: SnapshotIndex,
  previous: SnapshotIndex,
): number {
  const distances: number[] = [];
  const after = current.entities.get(targetId);
  const before = previous.entities.get(targetId);
  if (after !== undefined) distances.push(distance(point, after));
  if (before !== undefined) distances.push(distance(point, before));
  return distances.length === 0
    ? Number.POSITIVE_INFINITY
    : Math.min(...distances);
}

/**
 * Checks whether a building's published HP fell during this snapshot step.
 * @param targetId - Building id
 * @param current - Current snapshot index
 * @param previous - Previous snapshot index
 * @returns Whether direct structure damage needs attribution
 */
function buildingLostHitPoints(
  targetId: string,
  current: SnapshotIndex,
  previous: SnapshotIndex,
): boolean {
  const before = previous.entities.get(targetId)?.hitPoints;
  const after = current.entities.get(targetId)?.hitPoints;
  if (before === null || before === undefined || before <= 0) return false;
  if (after === undefined && !current.entities.has(targetId)) return true;
  if (after === null || after === undefined) return false;
  return after < before;
}

/**
 * Matches direct building damage to a recent attack launched by a horde body.
 * @param target - Damaged structure
 * @param current - Current snapshot index
 * @param previous - Previous snapshot index
 * @returns Whether a hostile attack effect names this structure's position
 */
function hasHostileAttackAt(
  target: AttackEntity,
  current: SnapshotIndex,
  previous: SnapshotIndex,
): boolean {
  return current.fx.some((effect) => {
    if (effect.kind !== "melee" && effect.kind !== "projectile") return false;
    if (effect.tick > current.tick) return false;
    if (current.tick - effect.tick > PUBLISHED_EFFECT_MAX_AGE_TICKS) {
      return false;
    }
    if (distance(effect.to, target) > TARGET_POSITION_TOLERANCE) return false;
    return hasHordeSourceAt(effect, current, previous);
  });
}

/**
 * Checks that an attack effect originated at a current or recent horde body.
 * @param effect - Published attack effect
 * @param current - Current snapshot index
 * @param previous - Previous snapshot index
 * @returns Whether an enemy attacker can be attributed
 */
function hasHordeSourceAt(
  effect: { from: MapPoint },
  current: SnapshotIndex,
  previous: SnapshotIndex,
): boolean {
  return attackSourceAt(effect.from, current, previous) !== undefined;
}

/**
 * Checks an unexplained HP drop against a same-tick boss area attack.
 * @param target - Local unit whose HP fell
 * @param damageTick - Tick shared by the hit and boss attack
 * @param current - Current snapshot index
 * @param previous - Previous snapshot index
 * @returns Whether the unit stood in a boss's published splash radius
 */
function hasBossSplashAt(
  target: AttackEntity,
  damageTick: number,
  current: SnapshotIndex,
  previous: SnapshotIndex,
): boolean {
  return current.fx.some((effect) => {
    if (effect.kind !== "melee" && effect.kind !== "projectile") return false;
    if (effect.tick !== damageTick) return false;
    const source = attackSourceAt(effect.from, current, previous);
    const splashRadius = source?.splashRadius;
    if (splashRadius === null || splashRadius === undefined) return false;
    const gap = distanceToEntity(effect.to, target.id, current, previous);
    return gap <= splashRadius + TARGET_POSITION_TOLERANCE;
  });
}

/**
 * Finds the closest current or recent horde body to an attack origin.
 * @param point - Published attack origin
 * @param current - Current snapshot index
 * @param previous - Previous snapshot index
 * @returns Likely attacking body, if one is near the origin
 */
function attackSourceAt(
  point: MapPoint,
  current: SnapshotIndex,
  previous: SnapshotIndex,
): AttackEntity | undefined {
  let nearest: AttackEntity | undefined;
  let nearestDistance = SOURCE_POSITION_TOLERANCE;
  for (const source of historicalEntities(current, previous).values()) {
    if (source.factionId !== "horde") continue;
    const gap = distance(point, source);
    if (gap > nearestDistance) continue;
    nearest = source;
    nearestDistance = gap;
  }
  return nearest;
}

/**
 * Finds actual damage ticks inside a possibly multi-tick snapshot advance.
 * Surviving units use `lastHitTick`; fallen units use their published death FX.
 * @param targetId - Local unit id
 * @param current - Current snapshot index
 * @param previous - Previous snapshot index
 * @returns Candidate hit ticks to match against boss attack effects
 */
function unitDamageTicks(
  targetId: string,
  current: SnapshotIndex,
  previous: SnapshotIndex,
): number[] {
  const target = previous.entities.get(targetId);
  const before = target?.hitPoints;
  const after = current.entities.get(targetId)?.hitPoints;
  if (target === undefined || before === null || before === undefined)
    return [];
  if (before <= 0) return [];
  if (after === undefined && !current.entities.has(targetId)) {
    return current.fx.flatMap((effect) => {
      if (effect.kind !== "death") return [];
      if (!isTickInAdvance(effect.tick, current, previous)) return [];
      if (distance(effect, target) > TARGET_POSITION_TOLERANCE) return [];
      return [effect.tick];
    });
  }
  if (after === null || after === undefined || after >= before) return [];
  const lastHit = current.lastHitTick[targetId];
  if (lastHit === undefined || !isTickInAdvance(lastHit, current, previous)) {
    return [];
  }
  return [lastHit];
}

/**
 * Checks that an event tick belongs to this snapshot advance.
 * @param tick - Candidate event tick
 * @param current - Current snapshot index
 * @param previous - Previous snapshot index
 * @returns Whether the event occurred after the previous snapshot
 */
function isTickInAdvance(
  tick: number,
  current: SnapshotIndex,
  previous: SnapshotIndex,
): boolean {
  return tick >= previous.tick && tick < current.tick;
}

/**
 * Creates one alert with health-sensitive severity.
 * @param id - Stable event/effect id
 * @param target - Damaged target
 * @param current - Current snapshot index
 * @param hitPointsOverride - Exact post-hit HP supplied by a building event
 * @returns Alert at the target's latest known position
 */
function makeAlert(
  id: string,
  target: AttackEntity,
  current: SnapshotIndex,
  hitPointsOverride?: number,
): AttackAlert {
  const latest = current.entities.get(target.id) ?? target;
  const hitPoints = hitPointsOverride ?? latest.hitPoints;
  let severity: AttackAlertSeverity = "warning";
  if (
    target.kind === "building" ||
    current.entities.get(target.id) === undefined
  ) {
    severity = "critical";
  }
  if (
    hitPoints !== null &&
    latest.maxHitPoints !== null &&
    latest.maxHitPoints > 0 &&
    hitPoints / latest.maxHitPoints <= 0.25
  ) {
    severity = "critical";
  }
  return {
    id,
    severity,
    targetId: target.id,
    targetKind: target.kind,
    worldPosition: { x: latest.x, y: latest.y },
  };
}

/**
 * Applies per-region cooldowns and drops old cooldown bookkeeping.
 * @param candidates - Unthrottled alerts
 * @param now - Wall-clock milliseconds
 * @param previousTimes - Previous region emission times
 * @returns Allowed alerts and updated region times
 */
function limitAlerts(
  candidates: readonly AttackAlert[],
  now: number,
  previousTimes: Readonly<Record<string, number>>,
): {
  alerts: AttackAlert[];
  lastAlertAtByRegion: Readonly<Record<string, number>>;
} {
  const lastAlertAtByRegion: Record<string, number> = {};
  for (const [region, time] of Object.entries(previousTimes)) {
    if (now - time < ATTACK_ALERT_COOLDOWN_MS)
      lastAlertAtByRegion[region] = time;
  }
  const ordered = [...candidates].sort(compareAlerts);
  const alerts: AttackAlert[] = [];
  for (const alert of ordered) {
    const region = attackAlertRegionKey(alert.worldPosition);
    const previous = lastAlertAtByRegion[region];
    if (previous !== undefined && now - previous < ATTACK_ALERT_COOLDOWN_MS) {
      continue;
    }
    alerts.push(alert);
    lastAlertAtByRegion[region] = now;
  }
  return { alerts, lastAlertAtByRegion };
}

/**
 * Prioritizes critical alerts when several hits share one region and tick.
 * @param left - First alert
 * @param right - Second alert
 * @returns Deterministic alert order
 */
function compareAlerts(left: AttackAlert, right: AttackAlert): number {
  if (left.severity !== right.severity)
    return left.severity === "critical" ? -1 : 1;
  return left.id.localeCompare(right.id);
}

/**
 * Builds a raw, fog-independent entity/effect index from a sim snapshot.
 * @param snapshot - Current immutable sim snapshot
 * @returns Published entities and damage bookkeeping
 */
function indexSnapshot(snapshot: SimSnapshot): SnapshotIndex {
  const presentation = readPresentation(snapshot.meta);
  const splashRadii = readBossSplashRadii(snapshot);
  const entities = new Map<string, AttackEntity>();
  for (const unit of snapshot.units) {
    const readout = presentation.units[unit.id];
    const factionId = readout?.factionId === "horde" ? "horde" : "hold";
    entities.set(unit.id, {
      factionId,
      hitPoints:
        typeof readout?.hitPoints === "number" ? readout.hitPoints : null,
      id: unit.id,
      kind: "unit",
      maxHitPoints:
        typeof readout?.maxHitPoints === "number" ? readout.maxHitPoints : null,
      ...((unit.ownerId ?? readout?.ownerId) === undefined
        ? {}
        : { ownerId: unit.ownerId ?? readout?.ownerId }),
      splashRadius: splashRadii.get(unit.id) ?? null,
      x: unit.x,
      y: unit.y,
    });
  }
  for (const building of snapshot.buildings) {
    const readout = presentation.buildings[building.id];
    entities.set(building.id, {
      factionId: readout?.factionId === "horde" ? "horde" : "hold",
      hitPoints:
        typeof readout?.hitPoints === "number" ? readout.hitPoints : null,
      id: building.id,
      kind: "building",
      maxHitPoints:
        typeof readout?.maxHitPoints === "number" ? readout.maxHitPoints : null,
      ...((building.ownerId ?? readout?.ownerId) === undefined
        ? {}
        : { ownerId: building.ownerId ?? readout?.ownerId }),
      splashRadius: null,
      x: building.x,
      y: building.y,
    });
  }
  return {
    entities,
    fx: presentation.fx,
    lastHitTick: readLastHitTick(snapshot),
    tick: snapshot.tick,
  };
}

/**
 * Reads boss area radii from the wave clock without importing game rules.
 * @param snapshot - Sim snapshot containing the waves module bag
 * @returns Area radius keyed by boss body id
 */
function readBossSplashRadii(
  snapshot: SimSnapshot,
): ReadonlyMap<string, number> {
  const radii = new Map<string, number>();
  const waves = snapshot.meta.waves;
  if (typeof waves !== "object" || waves === null) return radii;
  const units = (waves as { units?: unknown }).units;
  if (!Array.isArray(units)) return radii;
  for (const unit of units) {
    if (typeof unit !== "object" || unit === null) continue;
    const id = (unit as { id?: unknown }).id;
    const radius = (unit as { aoeRadius?: unknown }).aoeRadius;
    if (typeof id === "string" && typeof radius === "number" && radius > 0) {
      radii.set(id, radius);
    }
  }
  return radii;
}

/**
 * Reads unit last-hit ticks without requiring the complete slice save schema.
 * @param snapshot - Sim snapshot containing the Ashen Gate module bag
 * @returns Last-hit ticks keyed by unit id
 */
function readLastHitTick(
  snapshot: SimSnapshot,
): Readonly<Record<string, number>> {
  const slice = snapshot.meta[ASHEN_GATE_SLICE_META_KEY];
  if (typeof slice !== "object" || slice === null) return {};
  const value = (slice as { lastHitTick?: unknown }).lastHitTick;
  if (typeof value !== "object" || value === null) return {};
  const ticks: Record<string, number> = {};
  for (const [id, tick] of Object.entries(value)) {
    if (typeof tick === "number") ticks[id] = tick;
  }
  return ticks;
}

/**
 * Resolves an entity, including an armed building's combat-body alias.
 * @param id - Combat target/source id
 * @param current - Current snapshot index
 * @param previous - Previous snapshot index
 * @returns Latest known entity, if any
 */
function entityById(
  id: string,
  current: SnapshotIndex,
  previous: SnapshotIndex | null,
): AttackEntity | undefined {
  const canonicalId = id.startsWith(TOWER_BODY_PREFIX)
    ? id.slice(TOWER_BODY_PREFIX.length)
    : id;
  return (
    current.entities.get(canonicalId) ?? previous?.entities.get(canonicalId)
  );
}

/**
 * Checks faction and local ownership for a possible alert target.
 * @param entity - Candidate target
 * @param localPlayerId - Local co-op owner, if any
 * @returns Whether damage to this entity should alert the viewer
 */
function isLocalTarget(
  entity: AttackEntity | undefined,
  localPlayerId?: string,
): entity is AttackEntity {
  if (entity === undefined || entity.factionId !== "hold") return false;
  return isLocalPlayerOwned(entity, localPlayerId);
}

/**
 * Measures map-space distance.
 * @param left - First point
 * @param right - Second point
 * @returns Euclidean distance in world units
 */
function distance(left: MapPoint, right: MapPoint): number {
  return Math.hypot(left.x - right.x, left.y - right.y);
}
