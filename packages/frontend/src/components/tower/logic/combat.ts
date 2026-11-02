import type {
  PlayableCardEffect,
  PlayableCardKind,
} from "@towers-of-coreborn/api";
import { cardTargeting, comboGrantsBlock } from "./cardRules";
import { SeededRandom } from "./random";
import type {
  CardDefinition,
  EnemyMove,
  EnemySpawn,
  TierNumber,
  UnitSprite,
} from "./towerTypes";

/** Cards drawn at the start of every turn. */
export const TURN_DRAW = 5;

/** Most cards the hand can hold after draw effects. */
export const MAX_HAND_SIZE = 8;

/** One copy of a card in this battle, tied to the party member who brought it. */
export interface CombatCard {
  definition: CardDefinition;
  instanceId: string;
  /** Party member id. Their death removes this card. */
  ownerId: string;
}

/** Health and block shared by both sides. Dead units stay at 0 health. */
export interface CombatUnit {
  block: number;
  hitPoints: number;
  id: string;
  maxHitPoints: number;
  name: string;
}

/** A party member in battle. */
export interface PartyUnit extends CombatUnit {
  isCultivator: boolean;
  portraitUrl?: string;
  /** Animated figure drawn in place of the portrait, when one exists */
  sprite?: UnitSprite;
  tier: TierNumber;
}

/** An enemy in battle, with its place in its repeating cycle. */
export interface EnemyUnit extends CombatUnit {
  /** One-shot played when this enemy lands a blow */
  attackSoundUrl?: string;
  description: string;
  imageUrl?: string;
  isBoss: boolean;
  /** Index of the move it will make next. This is the telegraphed intent. */
  moveIndex: number;
  moves: EnemyMove[];
  /** Animated figure drawn in place of the portrait, when one exists */
  sprite?: UnitSprite;
}

/** Whether the battle is waiting on the player or finished. */
export type CombatPhase = "player" | "victory" | "defeat";

/** A battle in progress. */
export interface CombatState {
  aether: number;
  aetherPerTurn: number;
  cardsPlayed: number;
  discardPile: CombatCard[];
  drawPile: CombatCard[];
  /** Left to right on screen. They act right to left. */
  enemies: EnemyUnit[];
  hand: CombatCard[];
  /** Front to back. Front stands nearest the enemies. */
  party: PartyUnit[];
  phase: CombatPhase;
  /** Kinds played earlier this turn. Combos check this list. */
  playedKinds: PlayableCardKind[];
  randomState: number;
  turn: number;
}

/** Something that happened, for the scene to animate. */
export type CombatEvent =
  | { kind: "turn-start"; turn: number }
  | { count: number; kind: "draw" }
  | { kind: "shuffle" }
  | { cardId: string; kind: "card-played"; ownerId: string }
  | {
      blocked: number;
      dealt: number;
      kind: "damage";
      sourceId: string;
      targetId: string;
    }
  | { amount: number; kind: "block"; targetId: string }
  | { amount: number; kind: "aether" }
  | { kind: "combo"; triggered: boolean }
  | { cardsRemoved: number; kind: "death"; unitId: string }
  | { enemyId: string; kind: "enemy-move"; move: EnemyMove };

/** The state after a group of events, so the scene can show each in turn. */
export interface CombatStep {
  events: CombatEvent[];
  state: CombatState;
}

/** Why a card could not be played. */
export type PlayCardFailure =
  | "battle-over"
  | "unknown-card"
  | "not-enough-aether"
  | "needs-target"
  | "invalid-target";

/** Result of trying to play a card. */
export type PlayCardResult =
  | { ok: true; step: CombatStep }
  | { ok: false; reason: PlayCardFailure };

/** Everything a battle starts from. */
export interface CombatSetup {
  aetherPerTurn: number;
  cards: CombatCard[];
  enemies: EnemySpawn[];
  /** Front to back */
  party: PartyUnit[];
  randomState: number;
}

/**
 * Shuffles the deck and opens the first turn.
 * @param setup - Party, enemies, and cards for this battle
 * @returns The opening state and what happened to reach it
 */
export function createCombat(setup: CombatSetup): CombatStep {
  const random = new SeededRandom(setup.randomState);
  const state: CombatState = {
    aether: 0,
    aetherPerTurn: setup.aetherPerTurn,
    cardsPlayed: 0,
    discardPile: [],
    drawPile: random.shuffle(setup.cards),
    enemies: setup.enemies.map((enemy) => ({
      ...(enemy.attackSoundUrl ? { attackSoundUrl: enemy.attackSoundUrl } : {}),
      block: 0,
      description: enemy.description,
      hitPoints: enemy.maxHitPoints,
      id: enemy.id,
      imageUrl: enemy.imageUrl,
      isBoss: enemy.isBoss,
      maxHitPoints: enemy.maxHitPoints,
      moveIndex: 0,
      moves: enemy.moves,
      name: enemy.name,
      ...(enemy.sprite ? { sprite: enemy.sprite } : {}),
    })),
    hand: [],
    party: setup.party.map((unit) => ({ ...unit, block: 0 })),
    phase: "player",
    playedKinds: [],
    randomState: random.state,
    turn: 0,
  };
  const events: CombatEvent[] = [];
  const opened = startTurn(state, events);
  return { events, state: opened };
}

/**
 * @param unit - Party member or enemy
 * @returns Whether it still has health
 */
export function isAlive(unit: CombatUnit): boolean {
  return unit.hitPoints > 0;
}

/**
 * @param state - Battle
 * @returns Living party members, front first
 */
export function livingParty(state: CombatState): PartyUnit[] {
  return state.party.filter(isAlive);
}

/**
 * @param state - Battle
 * @returns Living enemies, left to right
 */
export function livingEnemies(state: CombatState): EnemyUnit[] {
  return state.enemies.filter(isAlive);
}

/**
 * @param enemy - Enemy in battle
 * @returns The move it will make on its next action
 */
export function enemyIntent(enemy: EnemyUnit): EnemyMove | undefined {
  return enemy.moves[enemy.moveIndex % Math.max(1, enemy.moves.length)];
}

/**
 * @param state - Battle
 * @param cardId - Hand card instance id
 * @returns Whether the card can be paid for right now
 */
export function canAfford(state: CombatState, cardId: string): boolean {
  const card = state.hand.find((entry) => entry.instanceId === cardId);
  if (!card || state.phase !== "player") {
    return false;
  }
  return state.aether >= card.definition.rules.aetherCost;
}

/**
 * Picks the target a card should use when the player did not choose one.
 * With one living candidate the choice is obvious, so the card plays at once.
 * @param state - Battle
 * @param card - Card being played
 * @returns The only possible target id, or `undefined` when the player must choose
 */
export function automaticTarget(
  state: CombatState,
  card: CombatCard,
): string | undefined {
  const targeting = cardTargeting(card.definition.rules);
  if (targeting === "enemy") {
    const enemies = livingEnemies(state);
    return enemies.length === 1 ? enemies[0]?.id : undefined;
  }
  if (targeting === "ally") {
    const party = livingParty(state);
    return party.length === 1 ? party[0]?.id : undefined;
  }
  return undefined;
}

/**
 * Plays one card from the hand. Cost is paid, effects resolve in order, and
 * the card goes to the discard pile.
 * @param state - Battle before the play
 * @param cardId - Hand card instance id
 * @param targetId - Enemy or ally the player aimed at, when the card needs one
 * @returns The step to animate, or why the card was not played
 */
export function playCard(
  state: CombatState,
  cardId: string,
  targetId?: string,
): PlayCardResult {
  if (state.phase !== "player") {
    return { ok: false, reason: "battle-over" };
  }
  const card = state.hand.find((entry) => entry.instanceId === cardId);
  if (!card) {
    return { ok: false, reason: "unknown-card" };
  }
  if (state.aether < card.definition.rules.aetherCost) {
    return { ok: false, reason: "not-enough-aether" };
  }
  const targeting = cardTargeting(card.definition.rules);
  const target = targetId ?? automaticTarget(state, card);
  if (targeting !== "none" && target === undefined) {
    return { ok: false, reason: "needs-target" };
  }
  if (!isValidTarget(state, targeting, target)) {
    return { ok: false, reason: "invalid-target" };
  }

  const next = cloneState(state);
  next.aether -= card.definition.rules.aetherCost;
  next.hand = next.hand.filter((entry) => entry.instanceId !== cardId);
  const events: CombatEvent[] = [
    { cardId, kind: "card-played", ownerId: card.ownerId },
  ];
  const context: EffectContext = {
    allyTargetId: targeting === "ally" ? target : undefined,
    card,
    enemyTargetId: targeting === "enemy" ? target : undefined,
  };
  for (const effect of card.definition.rules.effects) {
    resolveEffect(next, effect, context, events);
  }
  next.discardPile.push(card);
  next.cardsPlayed += 1;
  for (const effect of card.definition.rules.effects) {
    if (effect.kind !== "combo" && !next.playedKinds.includes(effect.kind)) {
      next.playedKinds.push(effect.kind);
    }
  }
  settleOutcome(next);
  return { ok: true, step: { events, state: next } };
}

/**
 * Ends the player's turn. The hand is discarded, then each living enemy
 * acts from right to left exactly as it telegraphed. If the cultivator
 * survives, the next turn opens.
 * @param state - Battle on the player's turn
 * @returns One step per enemy action, then the next turn's opening
 */
export function endTurn(state: CombatState): CombatStep[] {
  if (state.phase !== "player") {
    return [];
  }
  const steps: CombatStep[] = [];
  let current = cloneState(state);
  current.discardPile.push(...current.hand);
  current.hand = [];

  for (let index = current.enemies.length - 1; index >= 0; index -= 1) {
    const enemy = current.enemies[index];
    if (!enemy || !isAlive(enemy)) {
      continue;
    }
    const events: CombatEvent[] = [];
    current = cloneState(current);
    actEnemy(current, index, events);
    settleOutcome(current);
    steps.push({ events, state: current });
    if (current.phase !== "player") {
      return steps;
    }
  }

  const events: CombatEvent[] = [];
  const opened = startTurn(cloneState(current), events);
  steps.push({ events, state: opened });
  return steps;
}

/**
 * Estimates how much damage each party member takes if the turn ended now.
 * Enemies are walked in their real order, with no deaths along the way.
 * @param state - Battle
 * @returns Damage before block, keyed by party member id
 */
export function incomingDamage(state: CombatState): Map<string, number> {
  const incoming = new Map<string, number>();
  for (const enemy of [...livingEnemies(state)].reverse()) {
    const move = enemyIntent(enemy);
    if (move?.kind !== "attack") {
      continue;
    }
    for (const unit of attackTargets(state, move)) {
      incoming.set(unit.id, (incoming.get(unit.id) ?? 0) + move.amount);
    }
  }
  return incoming;
}

/**
 * Party members an attack lands on.
 * @param state - Battle
 * @param move - Enemy attack
 * @returns Front or back living member, or every living member
 */
export function attackTargets(
  state: CombatState,
  move: EnemyMove,
): PartyUnit[] {
  const living = livingParty(state);
  if (move.target === "all") {
    return living;
  }
  const unit = move.target === "back" ? living[living.length - 1] : living[0];
  return unit ? [unit] : [];
}

/** Where a card's effects land. */
interface EffectContext {
  allyTargetId?: string;
  card: CombatCard;
  enemyTargetId?: string;
}

/**
 * @param state - Battle being changed in place
 * @param effect - One effect on the card
 * @param context - Card and its targets
 * @param events - Event list to append to
 */
function resolveEffect(
  state: CombatState,
  effect: PlayableCardEffect,
  context: EffectContext,
  events: CombatEvent[],
): void {
  if (effect.kind === "attack") {
    strikeEnemy(state, context, effect.amount, events);
    return;
  }
  if (effect.kind === "defend") {
    shieldAlly(state, context, effect.amount, events);
    return;
  }
  if (effect.kind === "draw") {
    drawCards(state, effect.amount, events);
    return;
  }
  if (effect.kind === "aether") {
    state.aether += effect.amount;
    events.push({ amount: effect.amount, kind: "aether" });
    return;
  }
  const triggered =
    effect.chainsFrom === undefined
      ? state.playedKinds.length > 0
      : state.playedKinds.includes(effect.chainsFrom);
  events.push({ kind: "combo", triggered });
  if (!triggered) {
    return;
  }
  if (comboGrantsBlock(effect)) {
    shieldAlly(state, context, effect.amount, events);
    return;
  }
  strikeEnemy(state, context, effect.amount, events);
}

/**
 * @param state - Battle being changed in place
 * @param context - Card and its enemy target
 * @param amount - Damage before block
 * @param events - Event list to append to
 */
function strikeEnemy(
  state: CombatState,
  context: EffectContext,
  amount: number,
  events: CombatEvent[],
): void {
  const enemy = state.enemies.find(
    (entry) => entry.id === context.enemyTargetId,
  );
  if (!enemy || !isAlive(enemy)) {
    return;
  }
  const hit = applyDamage(enemy, amount);
  events.push({
    blocked: hit.blocked,
    dealt: hit.dealt,
    kind: "damage",
    sourceId: context.card.ownerId,
    targetId: enemy.id,
  });
  if (!isAlive(enemy)) {
    events.push({ cardsRemoved: 0, kind: "death", unitId: enemy.id });
  }
}

/**
 * Block goes to the chosen ally. A card aimed at an enemy shields its own
 * owner instead, or the front of the party if the owner has fallen.
 * @param state - Battle being changed in place
 * @param context - Card and its ally target
 * @param amount - Block to grant
 * @param events - Event list to append to
 */
function shieldAlly(
  state: CombatState,
  context: EffectContext,
  amount: number,
  events: CombatEvent[],
): void {
  const preferredId = context.allyTargetId ?? context.card.ownerId;
  const preferred = state.party.find(
    (unit) => unit.id === preferredId && isAlive(unit),
  );
  const unit = preferred ?? livingParty(state)[0];
  if (!unit) {
    return;
  }
  unit.block += amount;
  events.push({ amount, kind: "block", targetId: unit.id });
}

/**
 * Draws cards, shuffling the discard pile back in when the draw pile runs out.
 * @param state - Battle being changed in place
 * @param count - Cards to draw
 * @param events - Event list to append to
 */
function drawCards(
  state: CombatState,
  count: number,
  events: CombatEvent[],
): void {
  let drawn = 0;
  const random = new SeededRandom(state.randomState);
  for (let index = 0; index < count; index += 1) {
    if (state.hand.length >= MAX_HAND_SIZE) {
      break;
    }
    if (state.drawPile.length === 0 && state.discardPile.length > 0) {
      state.drawPile = random.shuffle(state.discardPile);
      state.discardPile = [];
      events.push({ kind: "shuffle" });
    }
    const card = state.drawPile.shift();
    if (!card) {
      break;
    }
    state.hand.push(card);
    drawn += 1;
  }
  state.randomState = random.state;
  if (drawn > 0) {
    events.push({ count: drawn, kind: "draw" });
  }
}

/**
 * Opens a player turn: block fades, Aether refills, and five cards are drawn.
 * @param state - Battle to change in place
 * @param events - Event list to append to
 * @returns The same state, for chaining
 */
function startTurn(state: CombatState, events: CombatEvent[]): CombatState {
  state.turn += 1;
  state.aether = state.aetherPerTurn;
  state.playedKinds = [];
  for (const unit of state.party) {
    unit.block = 0;
  }
  events.push({ kind: "turn-start", turn: state.turn });
  drawCards(state, TURN_DRAW, events);
  return state;
}

/**
 * Runs one enemy's telegraphed move. Its old block fades as it acts.
 * @param state - Battle to change in place
 * @param index - Enemy index
 * @param events - Event list to append to
 */
function actEnemy(
  state: CombatState,
  index: number,
  events: CombatEvent[],
): void {
  const enemy = state.enemies[index];
  const move = enemy ? enemyIntent(enemy) : undefined;
  if (!enemy || !move) {
    return;
  }
  enemy.block = 0;
  enemy.moveIndex = (enemy.moveIndex + 1) % Math.max(1, enemy.moves.length);
  events.push({ enemyId: enemy.id, kind: "enemy-move", move });
  if (move.kind === "defend") {
    enemy.block += move.amount;
    events.push({ amount: move.amount, kind: "block", targetId: enemy.id });
    return;
  }
  for (const unit of attackTargets(state, move)) {
    const hit = applyDamage(unit, move.amount);
    events.push({
      blocked: hit.blocked,
      dealt: hit.dealt,
      kind: "damage",
      sourceId: enemy.id,
      targetId: unit.id,
    });
    if (!isAlive(unit)) {
      const cardsRemoved = removeCardsOf(state, unit.id);
      events.push({ cardsRemoved, kind: "death", unitId: unit.id });
    }
  }
}

/**
 * Pulls a fallen party member's cards out of every pile.
 * @param state - Battle to change in place
 * @param ownerId - Fallen party member
 * @returns How many cards were removed
 */
function removeCardsOf(state: CombatState, ownerId: string): number {
  const before =
    state.drawPile.length + state.discardPile.length + state.hand.length;
  const keep = (card: CombatCard) => card.ownerId !== ownerId;
  state.drawPile = state.drawPile.filter(keep);
  state.discardPile = state.discardPile.filter(keep);
  state.hand = state.hand.filter(keep);
  return (
    before -
    state.drawPile.length -
    state.discardPile.length -
    state.hand.length
  );
}

/**
 * Ends the battle when the cultivator falls or every enemy does.
 * @param state - Battle to change in place
 */
function settleOutcome(state: CombatState): void {
  const cultivator = state.party.find((unit) => unit.isCultivator);
  if (!cultivator || !isAlive(cultivator)) {
    state.phase = "defeat";
    return;
  }
  if (livingEnemies(state).length === 0) {
    state.phase = "victory";
  }
}

/**
 * @param state - Battle
 * @param targeting - What the card needs
 * @param targetId - Chosen target
 * @returns Whether the target is a living unit on the right side
 */
function isValidTarget(
  state: CombatState,
  targeting: ReturnType<typeof cardTargeting>,
  targetId: string | undefined,
): boolean {
  if (targeting === "none") {
    return true;
  }
  const units: CombatUnit[] =
    targeting === "enemy" ? state.enemies : state.party;
  return units.some((unit) => unit.id === targetId && isAlive(unit));
}

/**
 * Spends block first, then health. Neither goes below zero.
 * @param unit - Unit being hit, changed in place
 * @param amount - Damage before block
 * @returns How much was blocked and how much health was lost
 */
function applyDamage(
  unit: CombatUnit,
  amount: number,
): { blocked: number; dealt: number } {
  const incoming = Math.max(0, amount);
  const blocked = Math.min(unit.block, incoming);
  const dealt = Math.min(unit.hitPoints, incoming - blocked);
  unit.block -= blocked;
  unit.hitPoints -= dealt;
  return { blocked, dealt };
}

/**
 * Copies every array and unit so steps never share mutable state.
 * Card instances are immutable and are shared.
 * @param state - Battle to copy
 * @returns A deep enough copy to change in place
 */
function cloneState(state: CombatState): CombatState {
  return {
    ...state,
    discardPile: [...state.discardPile],
    drawPile: [...state.drawPile],
    enemies: state.enemies.map((enemy) => ({ ...enemy })),
    hand: [...state.hand],
    party: state.party.map((unit) => ({ ...unit })),
    playedKinds: [...state.playedKinds],
  };
}
