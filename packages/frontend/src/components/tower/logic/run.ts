import { tierHitPoints } from "./characterRoles";
import type { CombatCard, CombatSetup, PartyUnit } from "./combat";
import { generateTower } from "./generateTower";
import { SeededRandom } from "./random";
import {
  type CardDefinition,
  type CorebornTemplate,
  CULTIVATOR_MEMBER_ID,
  type HealthRewardOption,
  MAX_TIER,
  type PartyMember,
  type RewardOffer,
  type RoomRewardKind,
  type RunState,
  type TierNumber,
  type TowerContent,
  type TowerRoom,
} from "./towerTypes";

/** Coreborn the player drafts before the first room. */
export const INITIAL_RECRUITS = 2;

/** Copies of its card a newly recruited Coreborn adds to the deck. */
export const BASE_CARD_COPIES = 2;

/** Share of maximum health the mend reward restores. */
export const MEND_SHARE = 0.4;

/** Maximum health the fortify reward adds to each party member. */
export const FORTIFY_AMOUNT = 6;

/** Options shown for Coreborn, card, and technique rewards. */
const OFFER_SIZE = 3;

/**
 * Starts a climb: generates the rooms and opens the initial Coreborn draft.
 * @param content - Tower to climb
 * @param seed - Seed for every random choice in this run
 * @returns A run waiting for the player to recruit
 */
export function startRun(content: TowerContent, seed: number): RunState {
  const random = new SeededRandom(seed);
  const rooms = generateTower(content, random);
  const draft = random
    .shuffle(content.coreborn)
    .slice(0, Math.max(OFFER_SIZE, 4))
    .map((template) => template.id);
  return {
    cultivatorDeck: [...content.cultivator.starterDeck],
    floorIndex: 0,
    initialRecruits: Math.min(INITIAL_RECRUITS, content.coreborn.length),
    nextMemberNumber: 1,
    party: [
      {
        cardCopies: 0,
        hitPoints: content.cultivator.maxHitPoints,
        id: CULTIVATOR_MEMBER_ID,
        kind: "cultivator",
        maxHitPoints: content.cultivator.maxHitPoints,
        templateId: "",
        tier: 1,
      },
    ],
    pendingReward: { kind: "coreborn", templateIds: draft },
    phase: content.coreborn.length > 0 ? "recruit" : "camp",
    randomState: random.state,
    rooms,
    stats: { battlesWon: 0, corebornLost: [], merges: 0, recruited: 0 },
  };
}

/**
 * @param run - Current run
 * @returns The room being prepared for or fought
 */
export function currentRoom(run: RunState): TowerRoom | undefined {
  return run.rooms[run.floorIndex];
}

/**
 * @param content - Tower content
 * @param templateId - Coreborn template id
 * @returns The template, when it exists
 */
export function findTemplate(
  content: TowerContent,
  templateId: string,
): CorebornTemplate | undefined {
  return content.coreborn.find((template) => template.id === templateId);
}

/**
 * Adds a Coreborn to the front of the party at tier 1, where it shields the
 * cultivator until the player reorders it. During the opening
 * draft this counts down the picks; as a reward it moves the climb on.
 * @param run - Current run
 * @param content - Tower content
 * @param templateId - Coreborn to recruit
 * @returns The run with the new party member
 */
export function recruitCoreborn(
  run: RunState,
  content: TowerContent,
  templateId: string,
): RunState {
  const template = findTemplate(content, templateId);
  if (!template || (run.phase !== "recruit" && run.phase !== "reward")) {
    return run;
  }
  const maxHitPoints = tierHitPoints(template.baseHitPoints, 1);
  const member: PartyMember = {
    cardCopies: BASE_CARD_COPIES,
    hitPoints: maxHitPoints,
    id: `coreborn-${run.nextMemberNumber}`,
    kind: "coreborn",
    maxHitPoints,
    templateId,
    tier: 1,
  };
  const recruited: RunState = {
    ...run,
    nextMemberNumber: run.nextMemberNumber + 1,
    party: [member, ...run.party],
    stats: { ...run.stats, recruited: run.stats.recruited + 1 },
  };
  if (run.phase === "reward") {
    return advanceFloor(recruited);
  }
  const remaining = run.initialRecruits - 1;
  return {
    ...recruited,
    initialRecruits: remaining,
    pendingReward: remaining > 0 ? run.pendingReward : undefined,
    phase: remaining > 0 ? "recruit" : "camp",
  };
}

/**
 * Moves one party member. Only allowed between battles.
 * @param run - Current run
 * @param fromIndex - Current position, 0 is the front
 * @param toIndex - New position
 * @returns The run with the party reordered
 */
export function moveMember(
  run: RunState,
  fromIndex: number,
  toIndex: number,
): RunState {
  if (run.phase !== "camp") {
    return run;
  }
  const party = [...run.party];
  const [member] = party.splice(fromIndex, 1);
  if (!member) {
    return run;
  }
  const target = Math.max(0, Math.min(party.length, toIndex));
  party.splice(target, 0, member);
  return { ...run, party };
}

/** Two copies of the same Coreborn that can be merged. */
export interface MergePair {
  /** Survives the merge and keeps its position */
  keepId: string;
  /** Folded into the survivor */
  consumeId: string;
  resultTier: TierNumber;
  templateId: string;
}

/**
 * Finds merges the party can make. The higher-tier copy survives.
 * @param run - Current run
 * @returns One pair for each template with two copies below the cap
 */
export function mergeOptions(run: RunState): MergePair[] {
  const pairs: MergePair[] = [];
  const seen = new Set<string>();
  for (const member of run.party) {
    if (member.kind !== "coreborn" || seen.has(member.templateId)) {
      continue;
    }
    seen.add(member.templateId);
    const copies = run.party
      .filter(
        (entry) =>
          entry.kind === "coreborn" && entry.templateId === member.templateId,
      )
      .sort((left, right) => right.tier - left.tier);
    const [keep, consume] = copies;
    if (!keep || !consume || keep.tier >= MAX_TIER) {
      continue;
    }
    pairs.push({
      consumeId: consume.id,
      keepId: keep.id,
      resultTier: (keep.tier + 1) as TierNumber,
      templateId: member.templateId,
    });
  }
  return pairs;
}

/**
 * Merges two copies of one Coreborn into the next tier. The old cards leave
 * the deck and the upgraded tier's cards replace them. Extra copies earned
 * from rewards carry over. The merged Coreborn returns to full health.
 * Only allowed between battles.
 * @param run - Current run
 * @param content - Tower content
 * @param pair - Merge from {@link mergeOptions}
 * @returns The run with one stronger Coreborn
 */
export function mergeCoreborn(
  run: RunState,
  content: TowerContent,
  pair: MergePair,
): RunState {
  const keep = run.party.find((member) => member.id === pair.keepId);
  const consume = run.party.find((member) => member.id === pair.consumeId);
  const template = findTemplate(content, pair.templateId);
  if (run.phase !== "camp" || !keep || !consume || !template) {
    return run;
  }
  if (keep.templateId !== consume.templateId || keep.kind !== "coreborn") {
    return run;
  }
  const tier = Math.min(
    MAX_TIER,
    Math.max(keep.tier, consume.tier) + 1,
  ) as TierNumber;
  const maxHitPoints = tierHitPoints(template.baseHitPoints, tier);
  const extraCopies =
    keep.cardCopies -
    BASE_CARD_COPIES +
    (consume.cardCopies - BASE_CARD_COPIES);
  const merged: PartyMember = {
    ...keep,
    cardCopies: BASE_CARD_COPIES + Math.max(0, extraCopies),
    hitPoints: maxHitPoints,
    maxHitPoints,
    tier,
  };
  return {
    ...run,
    party: run.party
      .filter((member) => member.id !== consume.id)
      .map((member) => (member.id === keep.id ? merged : member)),
    stats: { ...run.stats, merges: run.stats.merges + 1 },
  };
}

/**
 * Locks the party order and starts the current room's battle.
 * @param run - Run in camp
 * @returns The run in battle
 */
export function beginBattle(run: RunState): RunState {
  if (run.phase !== "camp" || !currentRoom(run)) {
    return run;
  }
  return { ...run, phase: "battle" };
}

/** One deck entry with the party member it belongs to. */
export interface OwnedCard {
  definition: CardDefinition;
  ownerId: string;
}

/**
 * Every card the party brings into battle: the cultivator's own cards and
 * each Coreborn's current-tier card, once per copy.
 * @param run - Current run
 * @param content - Tower content
 * @returns Deck entries in party order
 */
export function runDeck(run: RunState, content: TowerContent): OwnedCard[] {
  const deck: OwnedCard[] = [];
  for (const member of run.party) {
    if (member.kind === "cultivator") {
      for (const definition of run.cultivatorDeck) {
        deck.push({ definition, ownerId: member.id });
      }
      continue;
    }
    const definition = memberCard(member, content);
    if (!definition) {
      continue;
    }
    for (let copy = 0; copy < member.cardCopies; copy += 1) {
      deck.push({ definition, ownerId: member.id });
    }
  }
  return deck;
}

/**
 * @param member - Coreborn in the party
 * @param content - Tower content
 * @returns The card it brings at its tier
 */
export function memberCard(
  member: PartyMember,
  content: TowerContent,
): CardDefinition | undefined {
  const template = findTemplate(content, member.templateId);
  return template?.tiers[member.tier - 1]?.card;
}

/** Display fields for one party member. */
export interface MemberProfile {
  name: string;
  portraitUrl?: string;
  /** Tier title, or the cultivator's title */
  title: string;
}

/**
 * @param member - Party member
 * @param content - Tower content
 * @returns Name, tier title, and portrait to draw
 */
export function memberProfile(
  member: PartyMember,
  content: TowerContent,
): MemberProfile {
  if (member.kind === "cultivator") {
    return {
      name: content.cultivator.name,
      portraitUrl: content.cultivator.portraitUrl,
      title: content.cultivator.title,
    };
  }
  const template = findTemplate(content, member.templateId);
  const tier = template?.tiers[member.tier - 1];
  return {
    name: template?.name ?? "Coreborn",
    portraitUrl: tier?.portraitUrl,
    title: tier?.title ?? `Tier ${member.tier}`,
  };
}

/**
 * Builds the current room's battle from the party in its locked order.
 * @param run - Run in battle
 * @param content - Tower content
 * @returns Units, enemies, and the shuffled-to-be deck
 */
export function combatSetup(run: RunState, content: TowerContent): CombatSetup {
  const room = currentRoom(run);
  const party: PartyUnit[] = run.party.map((member) => {
    const profile = memberProfile(member, content);
    return {
      block: 0,
      hitPoints: member.hitPoints,
      id: member.id,
      isCultivator: member.kind === "cultivator",
      maxHitPoints: member.maxHitPoints,
      name: profile.name,
      portraitUrl: profile.portraitUrl,
      tier: member.tier,
    };
  });
  const cards: CombatCard[] = runDeck(run, content).map((entry, index) => ({
    definition: entry.definition,
    instanceId: `${entry.ownerId}-${index}`,
    ownerId: entry.ownerId,
  }));
  return {
    aetherPerTurn: content.cultivator.aetherPerTurn,
    cards,
    enemies: room?.enemies ?? [],
    party,
    randomState: run.randomState,
  };
}

/** What a finished battle reports back to the run. */
export interface BattleReport {
  outcome: "victory" | "defeat";
  /** Health of each party member after the battle */
  party: { hitPoints: number; id: string }[];
  randomState: number;
}

/**
 * Applies a battle's result. Fallen Coreborn leave the party for good, and
 * their cards with them. Losing the cultivator ends the run. Winning opens
 * the room's reward, or crowns the climb on the boss floor.
 * @param run - Run in battle
 * @param content - Tower content
 * @param report - Health and outcome from the battle
 * @returns The run after the battle
 */
export function finishBattle(
  run: RunState,
  content: TowerContent,
  report: BattleReport,
): RunState {
  if (run.phase !== "battle") {
    return run;
  }
  const health = new Map(report.party.map((unit) => [unit.id, unit.hitPoints]));
  const fallen = run.party.filter(
    (member) => (health.get(member.id) ?? member.hitPoints) <= 0,
  );
  const party = run.party
    .filter((member) => !fallen.includes(member))
    .map((member) => ({
      ...member,
      hitPoints: health.get(member.id) ?? member.hitPoints,
    }));
  const lost = fallen
    .filter((member) => member.kind === "coreborn")
    .map((member) => memberProfile(member, content).name);
  const settled: RunState = {
    ...run,
    party,
    randomState: report.randomState,
    stats: { ...run.stats, corebornLost: [...run.stats.corebornLost, ...lost] },
  };

  const cultivatorFell = fallen.some((member) => member.kind === "cultivator");
  if (report.outcome === "defeat" || cultivatorFell) {
    return { ...settled, phase: "defeat" };
  }
  const won: RunState = {
    ...settled,
    stats: { ...settled.stats, battlesWon: settled.stats.battlesWon + 1 },
  };
  const room = currentRoom(run);
  if (!room || room.isBoss || !room.reward) {
    return { ...won, phase: "victory" };
  }
  const random = new SeededRandom(won.randomState);
  const pendingReward = buildRewardOffer(won, content, room.reward, random);
  return {
    ...won,
    pendingReward,
    phase: "reward",
    randomState: random.state,
  };
}

/**
 * Rolls the choices for one room reward.
 * Coreborn offers always include a template already in the party when
 * possible, so merging stays within reach.
 * @param run - Run after the battle
 * @param content - Tower content
 * @param kind - The room's reward kind
 * @param random - Generator to draw from
 * @returns The offer to show
 */
export function buildRewardOffer(
  run: RunState,
  content: TowerContent,
  kind: RoomRewardKind,
  random: SeededRandom,
): RewardOffer {
  if (kind === "health") {
    return { kind: "health", options: ["mend", "fortify"] };
  }
  if (kind === "coreborn" && content.coreborn.length > 0) {
    return {
      kind: "coreborn",
      templateIds: corebornOffer(run, content, random),
    };
  }
  if (kind === "monster-cards") {
    const coreborn = run.party.filter((member) => member.kind === "coreborn");
    if (coreborn.length > 0) {
      return {
        kind: "monster-cards",
        memberIds: random
          .shuffle(coreborn)
          .slice(0, OFFER_SIZE)
          .map((member) => member.id),
      };
    }
  }
  return {
    cards: random.shuffle(content.techniques).slice(0, OFFER_SIZE),
    kind: "techniques",
  };
}

/**
 * @param run - Current run
 * @param content - Tower content
 * @param random - Generator to draw from
 * @returns Up to three template ids, at least one already owned when possible
 */
function corebornOffer(
  run: RunState,
  content: TowerContent,
  random: SeededRandom,
): string[] {
  const shuffled = random.shuffle(content.coreborn).map((entry) => entry.id);
  const offer = shuffled.slice(0, OFFER_SIZE);
  const owned = new Set(run.party.map((member) => member.templateId));
  if (owned.size === 0 || offer.some((id) => owned.has(id))) {
    return offer;
  }
  const ownedId = shuffled.find((id) => owned.has(id));
  if (ownedId === undefined) {
    return offer;
  }
  return [...offer.slice(0, OFFER_SIZE - 1), ownedId];
}

/** The player's pick from a reward offer. */
export type RewardChoice =
  | { kind: "coreborn"; templateId: string }
  | { kind: "monster-cards"; memberId: string }
  | { cardId: string; kind: "techniques" }
  | { kind: "health"; option: HealthRewardOption }
  | { kind: "skip" };

/**
 * Applies the chosen reward and moves the party up one floor.
 * @param run - Run showing a reward
 * @param content - Tower content
 * @param choice - What the player picked, or skip
 * @returns The run in camp on the next floor
 */
export function claimReward(
  run: RunState,
  content: TowerContent,
  choice: RewardChoice,
): RunState {
  if (run.phase !== "reward") {
    return run;
  }
  if (choice.kind === "coreborn") {
    return recruitCoreborn(run, content, choice.templateId);
  }
  if (choice.kind === "monster-cards") {
    return advanceFloor({
      ...run,
      party: run.party.map((member) =>
        member.id === choice.memberId
          ? { ...member, cardCopies: member.cardCopies + 1 }
          : member,
      ),
    });
  }
  if (choice.kind === "techniques") {
    const offer = run.pendingReward;
    const card =
      offer?.kind === "techniques"
        ? offer.cards.find((entry) => entry.id === choice.cardId)
        : undefined;
    if (!card) {
      return run;
    }
    return advanceFloor({
      ...run,
      cultivatorDeck: [...run.cultivatorDeck, card],
    });
  }
  if (choice.kind === "health") {
    return advanceFloor({
      ...run,
      party: run.party.map((member) => applyHealth(member, choice.option)),
    });
  }
  return advanceFloor(run);
}

/**
 * @param member - Party member
 * @param option - Mend heals a share of maximum health; fortify raises it
 * @returns The member after the health reward
 */
export function applyHealth(
  member: PartyMember,
  option: HealthRewardOption,
): PartyMember {
  if (option === "fortify") {
    return {
      ...member,
      hitPoints: member.hitPoints + FORTIFY_AMOUNT,
      maxHitPoints: member.maxHitPoints + FORTIFY_AMOUNT,
    };
  }
  const healed = Math.round(member.maxHitPoints * MEND_SHARE);
  return {
    ...member,
    hitPoints: Math.min(member.maxHitPoints, member.hitPoints + healed),
  };
}

/**
 * @param run - Run after a reward
 * @returns The run in camp on the next floor
 */
function advanceFloor(run: RunState): RunState {
  return {
    ...run,
    floorIndex: Math.min(run.floorIndex + 1, run.rooms.length - 1),
    pendingReward: undefined,
    phase: "camp",
  };
}
