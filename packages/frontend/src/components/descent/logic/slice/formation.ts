import type { ClassId, FormationId } from "../types";

/** A point in sim map space. */
export interface FormationPoint {
  x: number;
  y: number;
}

/** A unit the formation planner places. */
export interface FormationMember {
  classId: ClassId;
  id: string;
  x: number;
  y: number;
}

/** Gap, in map cells, between neighboring formation slots. */
export const FORMATION_SPACING = 1.2;

/** Widest a formation rank grows before a new rank starts behind it. */
export const MAX_RANK_WIDTH = 8;

/**
 * Rank order by class, front to back: shields and mauls lead, flankers
 * follow, archers and casters stay behind, and villagers keep to the rear.
 */
const CLASS_TIER: Record<ClassId, number> = {
  adept: 3,
  breaker: 0,
  hunter: 2,
  raider: 1,
  villager: 4,
  warden: 0,
};

/** Facing used when the group is already standing on its destination. */
const DEFAULT_FACING: FormationPoint = { x: 0, y: -1 };

/**
 * How many slots wide each rank is, favoring a line wider than it is deep.
 * @param count - Units in the formation
 * @param formation - Selected formation shape
 * @returns Rank width, from 1 to `MAX_RANK_WIDTH`
 */
export function formationRankWidth(
  count: number,
  formation: FormationId = "ranks",
): number {
  if (count <= 1) return 1;
  if (formation === "column") return Math.min(2, count);
  if (formation === "line") return Math.min(MAX_RANK_WIDTH, count);
  return Math.min(MAX_RANK_WIDTH, Math.ceil(Math.sqrt(count * 2)));
}

/**
 * Lays a group out in ranks around a destination, facing the way the group
 * travels. Frontline classes take the front ranks and ranged, support, and
 * villagers fall in behind. Within a rank, units keep their left-to-right
 * order so their paths do not cross.
 * @param members - Units receiving the order
 * @param destination - Point the player clicked; the formation centers on it
 * @param formation - Shape the group should take while arriving
 * @param spacing - Gap between neighboring slots
 * @returns Each unit's own destination, keyed by unit id
 */
export function planFormation(
  members: readonly FormationMember[],
  destination: FormationPoint,
  formation: FormationId = "ranks",
  spacing = FORMATION_SPACING,
): Record<string, FormationPoint> {
  if (members.length === 0) return {};
  if (members.length === 1) {
    const [only] = members as [FormationMember];
    return { [only.id]: { x: destination.x, y: destination.y } };
  }
  const facing = travelFacing(members, destination);
  const lateral = { x: -facing.y, y: facing.x };
  const ranks = formRanks(
    members,
    facing,
    formationRankWidth(members.length, formation),
  );
  const slots: Record<string, FormationPoint> = {};
  const middleRank = (ranks.length - 1) / 2;
  ranks.forEach((rank, rankIndex) => {
    const forward = (middleRank - rankIndex) * spacing;
    const ordered = [...rank].sort(
      (left, right) =>
        project(left, lateral) - project(right, lateral) ||
        left.id.localeCompare(right.id),
    );
    const middleFile = (ordered.length - 1) / 2;
    ordered.forEach((member, fileIndex) => {
      const side = (fileIndex - middleFile) * spacing;
      const wedgeRetreat =
        formation === "wedge"
          ? (Math.abs(fileIndex - middleFile) / Math.max(1, middleFile)) *
            spacing *
            0.45
          : 0;
      slots[member.id] = {
        x:
          destination.x +
          facing.x * (forward - wedgeRetreat) +
          lateral.x * side,
        y:
          destination.y +
          facing.y * (forward - wedgeRetreat) +
          lateral.y * side,
      };
    });
  });
  return slots;
}

/**
 * Splits members into ranks, front first. Each class tier starts a new rank;
 * within a tier, units already nearest the front take the front ranks.
 * @param members - Units receiving the order
 * @param facing - Unit vector the formation faces
 * @param width - Most units in one rank
 * @returns Ranks of members, front to back
 */
function formRanks(
  members: readonly FormationMember[],
  facing: FormationPoint,
  width: number,
): FormationMember[][] {
  const tiers = new Map<number, FormationMember[]>();
  for (const member of members) {
    const tier = CLASS_TIER[member.classId] ?? 0;
    const list = tiers.get(tier) ?? [];
    list.push(member);
    tiers.set(tier, list);
  }
  const ranks: FormationMember[][] = [];
  const tierOrder = [...tiers.keys()].sort((left, right) => left - right);
  for (const tier of tierOrder) {
    const tierMembers = [...(tiers.get(tier) ?? [])].sort(
      (left, right) =>
        project(right, facing) - project(left, facing) ||
        left.id.localeCompare(right.id),
    );
    for (let start = 0; start < tierMembers.length; start += width) {
      ranks.push(tierMembers.slice(start, start + width));
    }
  }
  return ranks;
}

/**
 * The unit vector from the group's center toward its destination.
 * @param members - Units receiving the order
 * @param destination - Where they are headed
 * @returns Travel direction, or `DEFAULT_FACING` when already there
 */
function travelFacing(
  members: readonly FormationMember[],
  destination: FormationPoint,
): FormationPoint {
  let sumX = 0;
  let sumY = 0;
  for (const member of members) {
    sumX += member.x;
    sumY += member.y;
  }
  const dx = destination.x - sumX / members.length;
  const dy = destination.y - sumY / members.length;
  const length = Math.hypot(dx, dy);
  if (length < 1e-6) return DEFAULT_FACING;
  return { x: dx / length, y: dy / length };
}

/**
 * @param point - Point to project
 * @param axis - Unit axis
 * @returns The point's coordinate along the axis
 */
function project(point: FormationPoint, axis: FormationPoint): number {
  return point.x * axis.x + point.y * axis.y;
}
