import { LAYER_TABLE } from "../layers/layerTable";
import type { LayerId } from "../layers/layerTypes";
import { getBossDefinition, getSchedule } from "./catalog";
import {
  DEFAULT_WAVE_MAP_HEIGHT,
  DEFAULT_WAVE_MAP_WIDTH,
  FODDER_CLASS_ID,
  HELL_PRESSURE_PER_MINUTE,
  OMEN_LEAD_TICKS,
  SIPHON_RADIUS,
  SUMMONER_FODDER_CAP,
  SUMMONER_FODDER_COUNT,
  SUMMONER_INTERVAL_TICKS,
  secondsToWaveTicks,
  TICKS_PER_MINUTE,
  TICKS_PER_SECOND,
} from "./constants";
import {
  applyPressure,
  killEssenceAmount,
  resistedDamage,
  roleKillEssence,
  unitSpeed,
  waveDistance,
} from "./modifiers";
import {
  compositionFromPlans,
  FODDER_SCALE,
  minorPlan,
  plansForWave,
  spawnUnit,
  VENT_IMP_SCALE,
} from "./spawn";
import type {
  BossDrops,
  CasualtyResult,
  DamageKind,
  NarrativeBossId,
  OmenPreview,
  PendingTwist,
  SpawnBounds,
  WaveClockState,
  WaveDefinition,
  WaveEvent,
  WaveSpawnContext,
  WaveUnit,
} from "./types";

/**
 * Creates an idle clock. A null layer waits until the sim starts one.
 * @param layerId - Layer to arm, or null
 * @param startedTick - Sim tick the layer clock treats as zero
 * @param bounds - Map size spawns must fit; defaults to the live 64x40 map
 * @returns A clock that has not resolved `startedTick` yet
 */
export function createWaveState(
  layerId: LayerId | null,
  startedTick: number,
  bounds?: SpawnBounds,
): WaveClockState {
  return {
    announcedOmenWaveId: null,
    bossDrops: null,
    bossGateCleared: false,
    collectedEssence: 0,
    completedTick: startedTick,
    encounter: {
      lifedrain: false,
      moveSpeedMultiplier: 1,
      rotatedRule: null,
      visionMultiplier: 1,
    },
    fallenAlliesByWave: {},
    hazards: [],
    hellPressure: 0,
    killEssence: 0,
    layerId,
    layerStartedTick: startedTick,
    mapHeight: bounds?.height ?? DEFAULT_WAVE_MAP_HEIGHT,
    mapWidth: bounds?.width ?? DEFAULT_WAVE_MAP_WIDTH,
    omenTower: false,
    pendingTwists: [],
    resolvedTick: startedTick - 1,
    spawnedWaveIds: [],
    summonAt: {},
    trackedUnitIds: [],
    triggeredPhases: [],
    units: [],
  };
}

/**
 * Map bounds a clock spawns inside. Old saves without bounds use the
 * live Ashen Gate size (64x40).
 * @param state - Wave clock
 * @returns Width and height in map tiles
 */
export function waveBounds(state: WaveClockState): SpawnBounds {
  return {
    height: validSize(state.mapHeight, DEFAULT_WAVE_MAP_HEIGHT),
    width: validSize(state.mapWidth, DEFAULT_WAVE_MAP_WIDTH),
  };
}

/**
 * Reports whether a meta bag holds a wave clock.
 * @param value - `meta.waves`
 * @returns Whether the value has the clock fields
 */
export function isWaveClockState(value: unknown): value is WaveClockState {
  if (typeof value !== "object" || value === null) return false;
  return (
    "units" in value && "completedTick" in value && "hellPressure" in value
  );
}

/**
 * Omen preview for the current clock, or null when the tower cannot see.
 * @param state - Wave clock
 * @returns The next wave inside the 60 second window
 */
export function readOmen(state: WaveClockState): OmenPreview | null {
  if (!state.omenTower) return null;
  const preview = nextPreview(state);
  if (!preview) return null;
  return {
    bossId: preview.bossId,
    composition: preview.composition,
    elite: preview.elite,
    etaSeconds: preview.etaSeconds,
  };
}

/**
 * Horns when the tower first reveals a wave.
 * @param state - Wave clock
 * @returns A horn event, or nothing when the preview did not change
 */
export function announceOmen(state: WaveClockState): WaveEvent[] {
  if (!state.omenTower) {
    state.announcedOmenWaveId = null;
    return [];
  }
  const preview = nextPreview(state);
  if (!preview) {
    state.announcedOmenWaveId = null;
    return [];
  }
  if (preview.waveId === state.announcedOmenWaveId) return [];
  state.announcedOmenWaveId = preview.waveId;
  return [{ cue: "omen", type: "horn", waveId: preview.waveId }];
}

/**
 * Resolves the tick stored on `completedTick`. A second call is a no-op.
 * @param state - Wave clock
 * @returns Events raised this tick
 */
export function resolveWaveTick(state: WaveClockState): WaveEvent[] {
  if (state.layerId === null) return [];
  if (state.resolvedTick === state.completedTick) return [];
  state.resolvedTick = state.completedTick;
  const events: WaveEvent[] = [];
  events.push(...updatePressure(state));
  events.push(...spawnDueWaves(state));
  events.push(...pulseSummoners(state));
  events.push(...advanceTwists(state));
  events.push(...announceOmen(state));
  return events;
}

/**
 * Damages one body. Armored elites resist physical blows. A killing blow
 * runs the casualty path; a boss that lives may start a wind-up.
 *
 * Callers pass post-armor damage: the integrator's combat has already
 * applied the body's `armor`, so this function never subtracts armor again.
 * Only the Armored affix's physical resist is applied here.
 *
 * A boss kill sets `state.bossGateCleared`; the waves module processor
 * forwards that to its gate port on the next tick.
 * @param state - Wave clock
 * @param unitId - Body to hit
 * @param amount - Damage after armor, before the Armored affix
 * @param kind - Physical or spell
 * @returns Events from the hit
 */
export function damageWaveUnit(
  state: WaveClockState,
  unitId: string,
  amount: number,
  kind: DamageKind = "physical",
): WaveEvent[] {
  if (!Number.isFinite(amount) || amount <= 0) return [];
  const unit = state.units.find((entry) => entry.id === unitId);
  if (!unit) return [];
  unit.hitPoints -= resistedDamage(unit.affix, amount, kind);
  if (unit.hitPoints > 0) return queueCrossedPhases(state, unit);
  unit.hitPoints = 0;
  return resolveCasualty(state, unitId).events;
}

/**
 * Removes a horde body, pays essence, and opens the gate when the body is
 * the layer boss. Safe to call twice.
 * @param state - Wave clock
 * @param unitId - Body that died
 * @returns Essence paid, events, and whether this call opened the gate
 */
export function resolveCasualty(
  state: WaveClockState,
  unitId: string,
): CasualtyResult {
  const unit = state.units.find((entry) => entry.id === unitId);
  if (!unit || state.layerId === null) {
    return { essence: 0, events: [], gateCleared: false };
  }
  const events: WaveEvent[] = [];
  const grade = essenceGrade(state.layerId);
  let essence = 0;
  if (unit.role !== "boss") {
    const siphoned = siphonNearby(state, unit);
    essence = roleKillEssence(killEssenceAmount(grade, siphoned), unit.role);
    state.killEssence += essence;
    state.collectedEssence += essence;
    events.push({
      amount: essence,
      siphoned,
      type: "essence_payout",
      unitId: unit.id,
    });
  }
  healBossFromAlly(state, unit);
  noteFallenAlly(state, unit);
  delete state.summonAt[unit.id];
  state.units = state.units.filter((entry) => entry.id !== unit.id);
  if (unit.role !== "boss" || unit.bossId === null) {
    return { essence, events, gateCleared: false };
  }
  state.pendingTwists = state.pendingTwists.filter(
    (twist) => twist.bossId !== unit.bossId,
  );
  const drops = dropsFor(unit.bossId, grade);
  state.bossDrops = drops;
  state.collectedEssence += drops.essence;
  state.bossGateCleared = true;
  essence += drops.essence;
  events.push({ bossId: unit.bossId, drops, type: "boss_killed" });
  return { essence, events, gateCleared: true };
}

/**
 * Raises Hell Pressure once per uncleared minute, then rescales the horde.
 * @param state - Wave clock
 * @returns A pressure event when the meter changes
 */
function updatePressure(state: WaveClockState): WaveEvent[] {
  if (state.bossGateCleared || state.layerId === null) return [];
  const elapsed = state.completedTick - state.layerStartedTick;
  const minutes = Math.floor(elapsed / TICKS_PER_MINUTE);
  const next = Math.min(1, minutes * HELL_PRESSURE_PER_MINUTE);
  if (next === state.hellPressure) return [];
  state.hellPressure = next;
  for (const unit of state.units) applyPressure(unit, next);
  return [{ pressure: next, type: "hell_pressure" }];
}

/**
 * Spawns every wave whose sim-second mark has been reached. Overdue waves
 * (after a retune or a load) spawn now; `spawnedWaveIds` prevents doubles.
 * @param state - Wave clock
 * @returns Spawn, horn, and boss-intro events
 */
function spawnDueWaves(state: WaveClockState): WaveEvent[] {
  if (state.layerId === null) return [];
  const schedule = getSchedule(state.layerId);
  const events: WaveEvent[] = [];
  for (const wave of schedule.waves) {
    if (state.spawnedWaveIds.includes(wave.id)) continue;
    const spawnTick =
      state.layerStartedTick + secondsToWaveTicks(wave.spawnAtSeconds);
    if (spawnTick > state.completedTick) continue;
    events.push(...spawnWave(state, wave.id));
  }
  return events;
}

/**
 * Spawns one catalog wave and arms Summoner timers.
 * @param state - Wave clock
 * @param waveId - Wave to spawn
 * @returns Events for the spawn
 */
function spawnWave(state: WaveClockState, waveId: string): WaveEvent[] {
  if (state.layerId === null) return [];
  const schedule = getSchedule(state.layerId);
  const wave = schedule.waves.find((entry) => entry.id === waveId);
  if (!wave) return [];
  state.spawnedWaveIds.push(wave.id);
  const plans = plansForWave(schedule, wave);
  const context = spawnContext(state, wave.id);
  const spawned: WaveUnit[] = [];
  for (let index = 0; index < plans.length; index += 1) {
    const plan = plans[index];
    if (!plan) continue;
    const unit = spawnUnit(context, plan, index);
    state.units.push(unit);
    state.trackedUnitIds.push(unit.id);
    spawned.push(unit);
    if (unit.affix === "summoner") {
      state.summonAt[unit.id] = state.completedTick + SUMMONER_INTERVAL_TICKS;
    }
  }
  const events: WaveEvent[] = [
    { cue: "spawn", type: "horn", waveId: wave.id },
    {
      type: "wave_spawned",
      unitIds: spawned.map((unit) => unit.id),
      waveId: wave.id,
    },
  ];
  if (wave.bossId) {
    events.unshift({
      bossId: wave.bossId,
      layerId: state.layerId,
      type: "boss_intro",
    });
  }
  return events;
}

/**
 * Lets each living Summoner release fodder on its interval. A Summoner
 * keeps at most `SUMMONER_FODDER_CAP` living fodder; a capped pulse waits.
 * @param state - Wave clock
 * @returns Summon events
 */
function pulseSummoners(state: WaveClockState): WaveEvent[] {
  if (state.layerId === null) return [];
  const events: WaveEvent[] = [];
  const summoners = state.units.filter((unit) => unit.affix === "summoner");
  for (const summoner of summoners) {
    const due = state.summonAt[summoner.id];
    if (due === undefined || due > state.completedTick) continue;
    const spawned = spawnFodder(state, summoner);
    state.summonAt[summoner.id] = state.completedTick + SUMMONER_INTERVAL_TICKS;
    if (spawned.length === 0) continue;
    events.push({
      eliteId: summoner.id,
      type: "summoner_spawn",
      unitIds: spawned.map((unit) => unit.id),
    });
  }
  return events;
}

/**
 * Spawns raider fodder beside a Summoner, on the Hold's side, up to the cap.
 * Positions are clamped inside the map by `spawnUnit`.
 * @param state - Wave clock
 * @param summoner - Living Summoner
 * @returns The new bodies, possibly none when the cap is full
 */
function spawnFodder(state: WaveClockState, summoner: WaveUnit): WaveUnit[] {
  if (state.layerId === null) return [];
  const room = SUMMONER_FODDER_CAP - livingFodder(state, summoner.id);
  const count = Math.min(SUMMONER_FODDER_COUNT, room);
  if (count <= 0) return [];
  const schedule = getSchedule(state.layerId);
  const plan = minorPlan(FODDER_CLASS_ID, "fodder", FODDER_SCALE, schedule);
  const context = spawnContext(state, summoner.waveId);
  const spawned: WaveUnit[] = [];
  for (let index = 0; index < count; index += 1) {
    const unit = spawnUnit(context, plan, index, {
      x: summoner.x - 1 - index,
      y: summoner.y + 1,
    });
    unit.id = `${summoner.id}:fodder:${state.completedTick}:${index}`;
    state.units.push(unit);
    state.trackedUnitIds.push(unit.id);
    spawned.push(unit);
  }
  return spawned;
}

/**
 * Counts one Summoner's living fodder by id prefix.
 * @param state - Wave clock
 * @param summonerId - Summoner that released them
 * @returns Living fodder bodies
 */
function livingFodder(state: WaveClockState, summonerId: string): number {
  const prefix = `${summonerId}:fodder:`;
  return state.units.filter(
    (unit) => unit.role === "fodder" && unit.id.startsWith(prefix),
  ).length;
}

/**
 * Counts down the active wind-up for each boss. Later twists wait.
 * @param state - Wave clock
 * @returns Wind-up and phase events
 */
function advanceTwists(state: WaveClockState): WaveEvent[] {
  const events: WaveEvent[] = [];
  const seen = new Set<string>();
  const pending: PendingTwist[] = [];
  for (const twist of state.pendingTwists) {
    const alive = state.units.some(
      (unit) => unit.role === "boss" && unit.bossId === twist.bossId,
    );
    if (!alive) continue;
    if (seen.has(twist.bossId)) {
      pending.push(twist);
      continue;
    }
    seen.add(twist.bossId);
    const remaining = twist.remainingTicks - 1;
    if (!twist.telegraphed) {
      const boss = getBossDefinition(twist.bossId);
      events.push({
        bossId: twist.bossId,
        phaseId: twist.phaseId,
        seconds: boss.windupSeconds,
        type: "boss_windup",
      });
    }
    if (remaining > 0) {
      pending.push({ ...twist, remainingTicks: remaining, telegraphed: true });
      continue;
    }
    events.push(...applyTwist(state, twist));
  }
  state.pendingTwists = pending;
  return events;
}

/**
 * Applies a phase whose wind-up has finished.
 * @param state - Wave clock
 * @param twist - Twist that just came due
 * @returns The phase event plus any extra notices
 */
function applyTwist(state: WaveClockState, twist: PendingTwist): WaveEvent[] {
  const bossDef = getBossDefinition(twist.bossId);
  const phase = bossDef.phases.find((entry) => entry.id === twist.phaseId);
  const boss = state.units.find(
    (unit) => unit.role === "boss" && unit.bossId === twist.bossId,
  );
  if (!phase || !boss) return [];
  if (phase.twist === "imps_from_vents")
    spawnVentImps(state, boss, phase.spawn);
  if (phase.twist === "arena_fog") {
    state.encounter.visionMultiplier = phase.visionMultiplier ?? 0.5;
  }
  if (phase.twist === "mobility") {
    boss.speedMultiplier = phase.speedMultiplier ?? 1.35;
    refreshSpeed(state, boss);
  }
  if (phase.twist === "freezing_ground") placeFreezingGround(state, boss);
  if (phase.twist === "hunger") {
    boss.baseDamage *= phase.damageMultiplier ?? 1.25;
    applyPressure(boss, state.hellPressure);
  }
  if (phase.twist === "rotate_rule" && phase.rotatedRule) {
    applyRotatedRule(state, phase.rotatedRule, boss);
  }
  return [
    {
      bossId: twist.bossId,
      phaseId: phase.id,
      twist: phase.twist,
      type: "boss_phase",
    },
  ];
}

/**
 * Spawns Cinderjaw's vent imps as raider-class fodder.
 * @param state - Wave clock
 * @param boss - Boss they emerge beside
 * @param spawn - Class counts from the phase
 */
function spawnVentImps(
  state: WaveClockState,
  boss: WaveUnit,
  spawn: readonly { classId: WaveUnit["classId"]; count: number }[],
): void {
  if (state.layerId === null) return;
  const schedule = getSchedule(state.layerId);
  const context = spawnContext(state, boss.waveId);
  let index = 0;
  for (const group of spawn) {
    const plan = minorPlan(group.classId, "vent_imp", VENT_IMP_SCALE, schedule);
    for (let count = 0; count < group.count; count += 1) {
      const unit = spawnUnit(context, plan, index, {
        x: boss.x - (index % 4) * 2,
        y: boss.y + 2,
      });
      unit.id = `${boss.id}:vent:${index}`;
      state.units.push(unit);
      state.trackedUnitIds.push(unit.id);
      index += 1;
    }
  }
}

/**
 * Lays three freezing patches across the boss.
 * @param state - Wave clock
 * @param boss - Boss that opened the phase
 */
function placeFreezingGround(state: WaveClockState, boss: WaveUnit): void {
  for (const offset of [-4, 0, 4]) {
    state.hazards.push({
      id: `${boss.id}:freeze:${offset}`,
      kind: "freezing_ground",
      radius: 3.5,
      source: "boss",
      x: boss.x + offset,
      y: boss.y,
    });
  }
}

/**
 * Swaps the Warden's active layer rule and clears the previous rule's effect.
 * Cold writes a Hold-facing `moveSpeedMultiplier`; horde speeds ignore it.
 * @param state - Wave clock
 * @param rule - Hazard id to apply
 * @param boss - Boss anchoring a vent
 */
function applyRotatedRule(
  state: WaveClockState,
  rule: NonNullable<WaveClockState["encounter"]["rotatedRule"]>,
  boss: WaveUnit,
): void {
  state.encounter.rotatedRule = rule;
  state.encounter.visionMultiplier = rule === "fog" ? 0.5 : 1;
  state.encounter.moveSpeedMultiplier = rule === "cold" ? 0.8 : 1;
  state.encounter.lifedrain = rule === "lifedrain";
  state.hazards = state.hazards.filter(
    (hazard) => hazard.source !== "rotated_rule",
  );
  if (rule === "ember_vents") {
    state.hazards.push({
      id: `${boss.id}:rule-vent`,
      kind: "ember_vent",
      radius: 3,
      source: "rotated_rule",
      x: boss.x,
      y: boss.y,
    });
  }
}

/**
 * Queues every newly crossed phase. The hit itself does not resolve them.
 * @param state - Wave clock
 * @param unit - Boss that was damaged and lived
 * @returns No events; the wind-up horn waits for the next ticks
 */
function queueCrossedPhases(
  state: WaveClockState,
  unit: WaveUnit,
): WaveEvent[] {
  if (unit.bossId === null || unit.maxHitPoints <= 0) return [];
  const ratio = unit.hitPoints / unit.maxHitPoints;
  const boss = getBossDefinition(unit.bossId);
  const crossed = boss.phases.filter((phase) => {
    const key = `${unit.bossId}:${phase.id}`;
    return ratio <= phase.threshold && !state.triggeredPhases.includes(key);
  });
  crossed.sort((left, right) => right.threshold - left.threshold);
  for (const phase of crossed) {
    state.triggeredPhases.push(`${unit.bossId}:${phase.id}`);
    state.pendingTwists.push({
      bossId: unit.bossId,
      phaseId: phase.id,
      remainingTicks: secondsToWaveTicks(boss.windupSeconds),
      telegraphed: false,
    });
  }
  return [];
}

/**
 * Heals Maw when another body from its wave dies.
 * @param state - Wave clock
 * @param victim - Body that died
 */
function healBossFromAlly(state: WaveClockState, victim: WaveUnit): void {
  if (victim.role === "boss") return;
  const boss = state.units.find(
    (unit) =>
      unit.role === "boss" &&
      unit.waveId === victim.waveId &&
      unit.allyDeathHealFraction > 0,
  );
  if (!boss) return;
  const heal = boss.maxHitPoints * boss.allyDeathHealFraction;
  boss.hitPoints = Math.min(boss.maxHitPoints, boss.hitPoints + heal);
}

/**
 * Records an allied death and refreshes Berserker speed.
 * @param state - Wave clock
 * @param victim - Body that died
 */
function noteFallenAlly(state: WaveClockState, victim: WaveUnit): void {
  const fallen = (state.fallenAlliesByWave[victim.waveId] ?? 0) + 1;
  state.fallenAlliesByWave[victim.waveId] = fallen;
  for (const unit of state.units) {
    if (unit.waveId !== victim.waveId || unit.id === victim.id) continue;
    refreshSpeed(state, unit);
  }
}

/**
 * Writes a body's speed from the current fallen-ally count. The encounter's
 * move-speed rule (cold) slows the Hold only, so it is not applied here.
 * @param state - Wave clock
 * @param unit - Body to update
 */
function refreshSpeed(state: WaveClockState, unit: WaveUnit): void {
  unit.speed = unitSpeed(
    unit.baseSpeed,
    unit.speedMultiplier,
    unit.affix,
    state.fallenAlliesByWave[unit.waveId] ?? 0,
    1,
  );
}

/**
 * Reports whether a living Siphon is close to a kill.
 * @param state - Wave clock
 * @param victim - Body that died
 * @returns Whether the payout should be reduced
 */
function siphonNearby(state: WaveClockState, victim: WaveUnit): boolean {
  return state.units.some((unit) => {
    if (unit.id === victim.id || unit.affix !== "siphon") return false;
    return waveDistance(unit, victim) <= SIPHON_RADIUS;
  });
}

/**
 * Builds the boss reward. Essence is the base times the layer grade.
 * @param bossId - Boss that died
 * @param grade - Active essence grade
 * @returns Drops the Hold receives
 */
function dropsFor(bossId: NarrativeBossId, grade: number): BossDrops {
  const boss = getBossDefinition(bossId);
  return {
    bossCoreId: boss.bossCoreId,
    essence: boss.essenceBase * grade,
    treasureChoice: [...boss.treasureChoice],
  };
}

/**
 * Essence grade of a layer.
 * @param layerId - Active layer
 * @returns The grade multiplier
 */
function essenceGrade(layerId: LayerId): number {
  const layer = LAYER_TABLE.layers.find((entry) => entry.id === layerId);
  if (!layer) throw new Error(`Unknown layer: ${layerId}`);
  return layer.essenceGrade;
}

/**
 * Spawn inputs copied from the clock.
 * @param state - Wave clock
 * @param waveId - Wave the bodies belong to
 * @returns A spawn context
 */
function spawnContext(state: WaveClockState, waveId: string): WaveSpawnContext {
  if (state.layerId === null) throw new Error("Cannot spawn without a layer");
  return {
    bounds: waveBounds(state),
    collectedEssence: state.collectedEssence,
    fallenAllies: state.fallenAlliesByWave[waveId] ?? 0,
    grade: essenceGrade(state.layerId),
    hellPressure: state.hellPressure,
    layerId: state.layerId,
    waveId,
  };
}

/**
 * Reads a stored map size, falling back when it is missing or unusable.
 * @param value - Stored size, possibly absent on an old save
 * @param fallback - Size to use instead
 * @returns A positive finite size
 */
function validSize(value: number | undefined, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    return fallback;
  }
  return value;
}

/**
 * The next unspawned future wave, when it is inside the omen window. An
 * overdue wave (it spawns on the next resolved tick) never hides the one
 * after it.
 * @param state - Wave clock
 * @returns Preview fields plus the wave id, or null
 */
function nextPreview(state: WaveClockState): {
  bossId: WaveDefinition["bossId"];
  composition: OmenPreview["composition"];
  elite: WaveDefinition["elite"];
  etaSeconds: number;
  waveId: string;
} | null {
  if (state.layerId === null) return null;
  const schedule = getSchedule(state.layerId);
  const wave = schedule.waves.find(
    (entry) =>
      !state.spawnedWaveIds.includes(entry.id) && ticksUntil(state, entry) > 0,
  );
  if (!wave) return null;
  const remaining = ticksUntil(state, wave);
  if (remaining > OMEN_LEAD_TICKS) return null;
  return {
    bossId: wave.bossId,
    composition: compositionFromPlans(plansForWave(schedule, wave)),
    elite: wave.elite ? { ...wave.elite } : null,
    etaSeconds: remaining / TICKS_PER_SECOND,
    waveId: wave.id,
  };
}

/**
 * Ticks from the clock's current tick to a wave's spawn mark.
 * @param state - Wave clock
 * @param wave - Scheduled wave
 * @returns Remaining ticks; zero or negative when due or overdue
 */
function ticksUntil(state: WaveClockState, wave: WaveDefinition): number {
  return (
    state.layerStartedTick +
    secondsToWaveTicks(wave.spawnAtSeconds) -
    state.completedTick
  );
}
