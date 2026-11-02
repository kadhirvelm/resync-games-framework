/**
 * Deep Works. Underground yield is removed from the work's own deposit.
 * Surface nodes are never read or written here. Only the shaft head can be raided.
 */

import { RESOURCE_IDS } from "../types";
import type {
  DeepWorkRuntime,
  DeepWorkView,
  EconomyBuilding,
  EconomyHost,
} from "./model";
import { asBuilding, tierAllows } from "./records";
import { addDeposit, emptyStockpile, trySpend } from "./stockpile";
import { type DeepWorkDef, type DepthDef, deepWorkForBuilding } from "./tables";

/**
 * Starts a deep work when a digging building finishes.
 * An existing work for that building is left alone.
 * @param host - World that stores works
 * @param building - Finished building that might dig
 */
export function seedWork(host: EconomyHost, building: EconomyBuilding): void {
  const def = deepWorkForBuilding(building.buildingType);
  if (!def) return;
  if (host.economy.works.some((work) => work.buildingId === building.id))
    return;
  const seeded = def.depths[0];
  if (def.id === "root_cellar" && seeded) {
    host.economy.works.push(openWork(building.id, def, seeded));
    return;
  }
  host.economy.works.push({
    buildingId: building.id,
    cooldown: 0,
    deposit: emptyStockpile(),
    depth: 0,
    digging: false,
    digStartedTick: null,
    digTicksLeft: 0,
    kind: def.id,
    raidImmune: def.raidImmune,
    shaftHead: def.shaftHead,
  });
}

/**
 * Forgets every deposit and reseeds works from the buildings that remain.
 * @param host - World entering a new layer
 */
export function resetWorks(host: EconomyHost): void {
  host.economy.works = [];
  for (const building of host.buildings) {
    const record = asBuilding(building);
    if (!record.completed) continue;
    seedWork(host, record);
  }
}

/**
 * Pays for the next depth and starts its dig timer.
 * @param host - World whose stockpile and work change
 * @param buildingId - Deep Mine or other diggable building
 * @returns Whether the dig started
 */
export function startDig(host: EconomyHost, buildingId: string): boolean {
  const building = host.buildings.find((entry) => entry.id === buildingId);
  if (!building) return false;
  const record = asBuilding(building);
  if (!record.completed) return false;
  if (!tierAllows(host.economy.tier, record.tier)) return false;
  const work = host.economy.works.find(
    (entry) => entry.buildingId === buildingId,
  );
  if (!work || work.digging) return false;
  const def = deepWorkForBuilding(record.buildingType);
  if (!def?.implemented) return false;
  const next = def.depths.find((depth) => depth.level === work.depth + 1);
  if (!next) return false;
  if (!trySpend(host, next.digCost)) return false;
  work.digging = true;
  work.digTicksLeft = next.digTicks;
  work.digStartedTick = host.tick();
  return true;
}

/**
 * Advances digs, then pays yield from each open deposit.
 * @param host - World whose stockpile may increase
 */
export function stepWorks(host: EconomyHost): void {
  for (const work of host.economy.works) {
    const building = host.buildings.find(
      (entry) => entry.id === work.buildingId,
    );
    if (!building || !asBuilding(building).completed) continue;
    if (work.digging) {
      advanceDig(host, work);
      continue;
    }
    if (work.depth < 1) continue;
    const depth = depthOf(work);
    if (!depth) continue;
    work.cooldown -= 1;
    if (work.cooldown > 0) continue;
    grantYield(host, work, depth);
    work.cooldown = depth.yieldEveryTicks;
  }
}

/**
 * @param host - World whose works are copied
 * @returns One view per underground work
 */
export function listWorks(host: EconomyHost): DeepWorkView[] {
  return host.economy.works.map((work) => ({
    buildingId: work.buildingId,
    cooldown: work.cooldown,
    deposit: { ...work.deposit },
    depth: work.depth,
    digging: work.digging,
    digTicksLeft: work.digTicksLeft,
    kind: work.kind,
    raidImmune: work.raidImmune,
    shaftHead: work.shaftHead,
  }));
}

/**
 * Counts down a dig that started on an earlier tick, then opens the depth.
 * The tick that paid for the dig does not also dig.
 * @param host - World, read for the current tick
 * @param work - Work currently digging
 */
function advanceDig(host: EconomyHost, work: DeepWorkRuntime): void {
  if (work.digStartedTick === host.tick()) return;
  work.digTicksLeft -= 1;
  if (work.digTicksLeft > 0) return;
  const next = defForKind(work.kind)?.depths.find(
    (depth) => depth.level === work.depth + 1,
  );
  work.digging = false;
  work.digTicksLeft = 0;
  work.digStartedTick = null;
  if (!next) return;
  work.depth = next.level;
  addDeposit(work.deposit, next.deposit);
  work.cooldown = next.yieldEveryTicks;
}

/**
 * @param buildingId - Building that owns the work
 * @param def - Work definition
 * @param depth - Depth that is already open, used by the Root Cellar
 * @returns A work that can yield without a dig
 */
function openWork(
  buildingId: string,
  def: DeepWorkDef,
  depth: DepthDef,
): DeepWorkRuntime {
  return {
    buildingId,
    cooldown: depth.yieldEveryTicks,
    deposit: depositFrom(depth.deposit),
    depth: depth.level,
    digging: false,
    digStartedTick: null,
    digTicksLeft: 0,
    kind: def.id,
    raidImmune: def.raidImmune,
    shaftHead: def.shaftHead,
  };
}

/**
 * Moves yield from the deposit into the stockpile. Nodes are not involved.
 * @param host - World that receives the resources
 * @param work - Deposit being drawn down
 * @param depth - Yield amounts for the open depth
 */
function grantYield(
  host: EconomyHost,
  work: DeepWorkRuntime,
  depth: DepthDef,
): void {
  for (const resourceId of RESOURCE_IDS) {
    const amount = depth.yield[resourceId] ?? 0;
    if (amount <= 0) continue;
    const taken = Math.min(amount, work.deposit[resourceId] ?? 0);
    if (taken <= 0) continue;
    work.deposit[resourceId] = (work.deposit[resourceId] ?? 0) - taken;
    host.resources[resourceId] = (host.resources[resourceId] ?? 0) + taken;
  }
}

/**
 * @param work - Work whose current depth is needed
 * @returns That depth's table row
 */
function depthOf(work: DeepWorkRuntime): DepthDef | undefined {
  const def = defForKind(work.kind);
  return def?.depths.find((depth) => depth.level === work.depth);
}

/**
 * @param kind - Deep work id
 * @returns The table row for that id
 */
function defForKind(kind: string): DeepWorkDef | undefined {
  if (kind === "root_cellar") return deepWorkForBuilding("root_cellar");
  if (kind === "deep_mine") return deepWorkForBuilding("deep_mine");
  return undefined;
}

/**
 * @param partial - Deposit amounts from the table
 * @returns A full stockpile with those amounts and zeros elsewhere
 */
function depositFrom(
  partial: Partial<ReturnType<typeof emptyStockpile>>,
): ReturnType<typeof emptyStockpile> {
  const deposit = emptyStockpile();
  addDeposit(deposit, partial);
  return deposit;
}
