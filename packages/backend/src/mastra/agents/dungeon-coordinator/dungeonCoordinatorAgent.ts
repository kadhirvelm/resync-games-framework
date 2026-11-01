import { randomUUID } from "node:crypto";
import { createTool } from "@mastra/core/tools";
import {
  Injectable,
  InternalServerErrorException,
  Logger,
} from "@nestjs/common";
import {
  AgentTool,
  type CardCharacterLevelNumber,
  type DungeonSlotKind,
} from "@towers-of-coreborn/api";
import { CARD_CHARACTER_LEVELS } from "src/asset-classes/card-character/cardCharacterSpec";
import { runWithProductNowSession } from "src/product-now-mcp/productNowSessionContext";
import { z } from "zod";
import { TowersOfCorebornAgentService } from "../../shared/towersOfCorebornAgent.service";
import { GenerationAbortCoordinator } from "../generationAbort.coordinator";
import { isGenerationAbort, throwIfAborted } from "../generationCancelled";
import type { QueryableAgent } from "../queryableAgent";

export const PLAN_DUNGEON_BACKGROUND_TOOL_ID = "plan-dungeon-background";
export const PLAN_DUNGEON_CHARACTER_TOOL_ID = "plan-dungeon-character";
export const PLAN_DUNGEON_CARD_TOOL_ID = "plan-dungeon-card";
export const PLAN_DUNGEON_ENEMY_TOOL_ID = "plan-dungeon-enemy";

const DUNGEON_BACKGROUND_COUNT = 2;
const DUNGEON_CHARACTER_COUNT = 3;
/** One playable card for each portrait level of a character. */
const DUNGEON_CARDS_PER_CHARACTER = CARD_CHARACTER_LEVELS.length;
const DUNGEON_ENEMY_COUNT = 2;

/**
 * Tool calls one plan must make, plus one Lore lookup. Each call can take
 * its own model step.
 */
const DUNGEON_PLAN_CALLS =
  1 +
  DUNGEON_BACKGROUND_COUNT +
  DUNGEON_CHARACTER_COUNT +
  DUNGEON_CHARACTER_COUNT * DUNGEON_CARDS_PER_CHARACTER +
  DUNGEON_ENEMY_COUNT;

/** Extra steps for a closing summary and a retry of one call. */
const DUNGEON_COORDINATOR_STEP_SLACK = 6;
const DUNGEON_COORDINATOR_MAX_STEPS =
  DUNGEON_PLAN_CALLS + DUNGEON_COORDINATOR_STEP_SLACK;
const DUNGEON_COORDINATOR_TIMEOUT_MS = 10 * 60 * 1000;
const DUNGEON_TOOL_CALL_CONCURRENCY = 1;
const DUNGEON_PROMPTS_READY = "The dungeon prompts are ready.";

const titledPromptSchema = z.object({
  prompt: z
    .string()
    .trim()
    .min(1)
    .max(4000)
    .describe("The full prompt the asset agent should receive."),
  title: z.string().trim().min(1).max(80).describe("Short display name."),
});

const characterPromptSchema = titledPromptSchema.extend({
  spritePrompt: z
    .string()
    .trim()
    .min(1)
    .max(2000)
    .describe(
      "How this character looks and moves as an animated battle sprite facing right, toward the enemies: full-body silhouette, outfit, weapon or focus, the motion of their signature attack and any single effect it makes, and how they guard.",
    ),
});

const enemyPromptSchema = titledPromptSchema.extend({
  spritePrompt: z
    .string()
    .trim()
    .min(1)
    .max(2000)
    .describe(
      "How this enemy looks and moves as an animated battle sprite facing left, toward the player's party: full-body silhouette, anatomy or armor, natural weapons, the motion of its signature attack and any single effect it makes, and how it guards.",
    ),
});

const cardPromptSchema = titledPromptSchema.extend({
  characterSlotId: z
    .string()
    .describe("The characterSlotId returned by plan-dungeon-character."),
  level: z
    .union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)])
    .describe("Portrait level this card matches, from 1 through 4."),
});

const backgroundOutputSchema = z.object({ slotId: z.string() });
const characterOutputSchema = z.object({ characterSlotId: z.string() });
const cardOutputSchema = z.object({
  characterSlotId: z.string(),
  level: z.number().int(),
  slotId: z.string(),
});
const enemyOutputSchema = z.object({ slotId: z.string() });

const DUNGEON_COORDINATOR_INSTRUCTIONS = `
You are the dungeon art director for Towers of Coreborn. Turn one broad idea
into a package of prompts. Do not create images, cards, or enemies yourself.
Each prompt is the complete request another agent will receive later.

Call consult-productnow once before planning, and ground the package in what
it finds about this place, its factions, and its threats.

Then record exactly 2 backgrounds, 3 characters, 4 cards for each character,
and 2 enemies. Every character and every enemy also gets one sprite prompt.
These counts are fixed even if the user asks for different
counts. Plan backgrounds, characters, and enemies before cards. Cards must
use the exact characterSlotId returned by plan-dungeon-character.

Keep every prompt in one shared location, faction, threat, color palette, and
story hook. Background prompts describe one battle room each. Character prompts
make each role distinct and describe a person who can be painted at four
strengths. Card prompts name that character and one technique that belongs to
them. Every unit fights in battle as an animated sprite, so each character
call and each enemy call also takes a sprite prompt: describe the full-body
look, the attack motion, and the guard so it matches that unit's role and
fighting style. Party members face right, toward the enemies; enemies face
left, toward the party. For each
character, plan levels 1, 2, 3, and 4 in that order. Level 1
chooses the technique. Levels 2 through 4 keep its aether cost and effect
kinds, and raise the amounts. Enemy prompts describe distinct threats that
belong in these rooms, how each one fights, and that they should vary in
health. Finish with a short summary of the setup. Do not invent asset ids
or URLs.
`;

/** Input for one dungeon planning run. */
export interface DungeonCoordinatorInput {
  generationId: string;
  prompt: string;
  sessionId: string;
}

/** Fields shared by every prompt the planner records for a later agent. */
interface PlannedDungeonSlotBase {
  id: string;
  prompt: string;
  title: string;
}

/** Slot kinds that belong to another slot: cards to a character, sprites to a character or enemy. */
type OwnedSlotKind = "playable-card" | "sprite-sheet";

/** Slot kinds added when a package is read, rather than planned by the coordinator. */
type BackfilledSlotKind = "audio";

/** A planned room, character, or enemy prompt. */
export type PlannedDungeonAssetSlot = {
  [Kind in Exclude<
    DungeonSlotKind,
    OwnedSlotKind | BackfilledSlotKind
  >]: PlannedDungeonSlotBase & {
    kind: Kind;
  };
}[Exclude<DungeonSlotKind, OwnedSlotKind | BackfilledSlotKind>];

/** A planned card prompt with required ownership and progression level. */
export interface PlannedDungeonCardSlot extends PlannedDungeonSlotBase {
  characterSlotId: string;
  kind: "playable-card";
  level: CardCharacterLevelNumber;
}

/** A planned battle sprite prompt for one character or enemy. */
export interface PlannedDungeonSpriteSlot extends PlannedDungeonSlotBase {
  kind: "sprite-sheet";
  /** Character or enemy slot this sprite animates */
  ownerSlotId: string;
}

/** One prompt the planner recorded for a later agent. */
export type PlannedDungeonSlot =
  | PlannedDungeonAssetSlot
  | PlannedDungeonCardSlot
  | PlannedDungeonSpriteSlot;

/** Prompts for a dungeon package, with no assets created yet. */
export interface DungeonCoordinatorResult {
  slots: PlannedDungeonSlot[];
  summary: string;
}

interface PlannedCharacter {
  cards: PlannedDungeonSlot[];
  slot: PlannedDungeonSlot;
  sprite: PlannedDungeonSpriteSlot;
}

interface PlannedEnemy {
  slot: PlannedDungeonSlot;
  sprite: PlannedDungeonSpriteSlot;
}

interface DungeonPlanState {
  backgrounds: PlannedDungeonSlot[];
  characters: Map<string, PlannedCharacter>;
  enemies: PlannedEnemy[];
}

/**
 * Plans a dungeon package. It writes prompts for the existing asset agents
 * and does not call them.
 */
@Injectable()
export class DungeonCoordinatorAgent
  implements QueryableAgent<DungeonCoordinatorInput, DungeonCoordinatorResult>
{
  private readonly logger = new Logger(DungeonCoordinatorAgent.name);

  public constructor(
    private readonly agents: TowersOfCorebornAgentService,
    private readonly generationAbort: GenerationAbortCoordinator,
  ) {}

  /**
   * Stops an in-flight planning run.
   * @param generationId - Planning generation id
   * @returns Whether the stop was recorded
   */
  public abort(generationId: string): Promise<boolean> {
    return this.generationAbort.stop(generationId);
  }

  /**
   * Writes the prompts for one dungeon package.
   * @param input - Broad idea, ProductNow session, and cancellable generation id
   * @returns The prompts and a short summary
   */
  public async query(
    input: DungeonCoordinatorInput,
  ): Promise<DungeonCoordinatorResult> {
    return this.generationAbort.run(input.generationId, async (signal) => {
      const state: DungeonPlanState = {
        backgrounds: [],
        characters: new Map(),
        enemies: [],
      };

      try {
        const result = await runWithProductNowSession(input.sessionId, () =>
          this.agents.runAssetClassAgentChat({
            abortSignal: signal,
            agentId: "dungeon-coordinator-agent",
            catalogTools: [AgentTool.ConsultProductNow],
            instructions: DUNGEON_COORDINATOR_INSTRUCTIONS,
            maxSteps: DUNGEON_COORDINATOR_MAX_STEPS,
            ownedTools: this.createTools(state),
            prompt: `Plan a dungeon package from this request:\n${input.prompt}`,
            timeoutMs: DUNGEON_COORDINATOR_TIMEOUT_MS,
            toolCallConcurrency: DUNGEON_TOOL_CALL_CONCURRENCY,
          }),
        );
        throwIfAborted(signal);
        requireSuccessfulPlan(result.toolErrors, state);
        return planResult(state, result.text);
      } catch (error) {
        if (isGenerationAbort(error, signal) || !isCompletePlan(state)) {
          throw error;
        }
        this.logger.warn(
          `Dungeon prompts were written, but the coordinator ended with: ${error instanceof Error ? error.message : String(error)}`,
        );
        return planResult(state, "");
      }
    });
  }

  /**
   * Builds the tools that record prompts for this plan.
   * @param state - Prompts recorded so far
   * @returns Four Mastra tools for rooms, characters, cards, and enemies
   */
  private createTools(state: DungeonPlanState) {
    return {
      [PLAN_DUNGEON_BACKGROUND_TOOL_ID]: createTool({
        description:
          "Record the prompt for one battle-room background. Does not paint it.",
        execute: async (input: z.infer<typeof titledPromptSchema>) => {
          requireCapacity(
            state.backgrounds.length,
            DUNGEON_BACKGROUND_COUNT,
            "background",
          );
          const slot = createSlot("battle-background", input);
          state.backgrounds.push(slot);
          return { slotId: slot.id };
        },
        id: PLAN_DUNGEON_BACKGROUND_TOOL_ID,
        inputSchema: titledPromptSchema,
        outputSchema: backgroundOutputSchema,
      }),
      [PLAN_DUNGEON_CHARACTER_TOOL_ID]: createTool({
        description:
          "Record the prompt for one four-level character and its animated battle sprite. Returns the characterSlotId required when planning that character's cards. Does not paint the character or the sprite.",
        execute: async (input: z.infer<typeof characterPromptSchema>) => {
          requireCapacity(
            state.characters.size,
            DUNGEON_CHARACTER_COUNT,
            "character",
          );
          const slot = createSlot("card-character", input);
          const sprite = createSpriteSlot(slot.id, input);
          state.characters.set(slot.id, { cards: [], slot, sprite });
          return { characterSlotId: slot.id };
        },
        id: PLAN_DUNGEON_CHARACTER_TOOL_ID,
        inputSchema: characterPromptSchema,
        outputSchema: characterOutputSchema,
      }),
      [PLAN_DUNGEON_CARD_TOOL_ID]: createTool({
        description:
          "Record the next card prompt for a character. Level 1 chooses the technique. Each later level keeps that aether cost and those effect kinds, and raises the amounts. Plan levels 1 through 4 in order. Does not write the card.",
        execute: async (input: z.infer<typeof cardPromptSchema>) => {
          const character = state.characters.get(input.characterSlotId);
          if (character === undefined) {
            throw new InternalServerErrorException(
              "Plan the character first, then pass its exact characterSlotId.",
            );
          }
          requireCapacity(
            character.cards.length,
            DUNGEON_CARDS_PER_CHARACTER,
            "card for this character",
          );
          const nextLevel = character.cards.length + 1;
          if (input.level !== nextLevel) {
            throw new InternalServerErrorException(
              `Plan level ${nextLevel} for this character before level ${input.level}.`,
            );
          }
          const slot: PlannedDungeonCardSlot = {
            characterSlotId: input.characterSlotId,
            id: randomUUID(),
            kind: "playable-card",
            level: input.level,
            prompt: input.prompt,
            title: input.title,
          };
          character.cards.push(slot);
          return {
            characterSlotId: input.characterSlotId,
            level: input.level,
            slotId: slot.id,
          };
        },
        id: PLAN_DUNGEON_CARD_TOOL_ID,
        inputSchema: cardPromptSchema,
        outputSchema: cardOutputSchema,
      }),
      [PLAN_DUNGEON_ENEMY_TOOL_ID]: createTool({
        description:
          "Record the prompt for one enemy and its animated battle sprite. Describe how it fights and that its health should fit the rooms. Does not paint the enemy or the sprite.",
        execute: async (input: z.infer<typeof enemyPromptSchema>) => {
          requireCapacity(state.enemies.length, DUNGEON_ENEMY_COUNT, "enemy");
          const slot = createSlot("enemy", input);
          state.enemies.push({
            slot,
            sprite: createSpriteSlot(slot.id, input),
          });
          return { slotId: slot.id };
        },
        id: PLAN_DUNGEON_ENEMY_TOOL_ID,
        inputSchema: enemyPromptSchema,
        outputSchema: enemyOutputSchema,
      }),
    };
  }
}

/**
 * @param kind - Agent this prompt is for
 * @param input - Title and prompt from the planner
 * @returns A slot with a new id
 */
function createSlot<Kind extends Exclude<DungeonSlotKind, OwnedSlotKind>>(
  kind: Kind,
  input: { prompt: string; title: string },
): Extract<PlannedDungeonAssetSlot, { kind: Kind }> {
  return {
    id: randomUUID(),
    kind,
    prompt: input.prompt,
    title: input.title,
  } as Extract<PlannedDungeonAssetSlot, { kind: Kind }>;
}

/**
 * @param ownerSlotId - Character or enemy slot the sprite animates
 * @param input - Owner title and the planner's sprite prompt
 * @returns A sprite slot with a new id, titled after its owner
 */
function createSpriteSlot(
  ownerSlotId: string,
  input: { spritePrompt: string; title: string },
): PlannedDungeonSpriteSlot {
  return {
    id: randomUUID(),
    kind: "sprite-sheet",
    ownerSlotId,
    prompt: input.spritePrompt,
    title: `${input.title} sprite`,
  };
}

/**
 * Prevents a plan from recording an unbounded number of prompts.
 * @param current - Number already recorded
 * @param maximum - Maximum allowed for this asset kind
 * @param label - Human-readable asset kind
 */
function requireCapacity(
  current: number,
  maximum: number,
  label: string,
): void {
  if (current >= maximum) {
    throw new InternalServerErrorException(
      `A dungeon can plan at most ${maximum} ${label}s.`,
    );
  }
}

/**
 * Ensures the planner recorded a usable package. A call that failed and was
 * later retried successfully does not fail the plan.
 * @param toolErrors - Tool failures observed by the runner
 * @param state - Prompts recorded so far
 * @throws InternalServerErrorException when prompts are missing
 */
function requireSuccessfulPlan(
  toolErrors: Array<{ errorMessage: string; toolName: string }>,
  state: DungeonPlanState,
): void {
  if (isCompletePlan(state)) {
    return;
  }
  const failed = [...toolErrors]
    .reverse()
    .find((error) => error.toolName.startsWith("plan-dungeon-"));
  if (failed !== undefined) {
    throw new InternalServerErrorException(
      `Dungeon planning failed in ${failed.toolName}: ${failed.errorMessage}`,
    );
  }
  throw new InternalServerErrorException(
    `Dungeon planning must record exactly ${DUNGEON_BACKGROUND_COUNT} backgrounds, ${DUNGEON_CHARACTER_COUNT} characters, and ${DUNGEON_ENEMY_COUNT} enemies, with ${DUNGEON_CARDS_PER_CHARACTER} cards for every character.`,
  );
}

/**
 * @param state - Prompts recorded by the planning tools
 * @returns Whether every required room, character, card, and enemy prompt exists
 */
function isCompletePlan(state: DungeonPlanState): boolean {
  const cardsComplete = [...state.characters.values()].every(
    (character) => character.cards.length === DUNGEON_CARDS_PER_CHARACTER,
  );
  return (
    state.backgrounds.length === DUNGEON_BACKGROUND_COUNT &&
    state.characters.size === DUNGEON_CHARACTER_COUNT &&
    state.enemies.length === DUNGEON_ENEMY_COUNT &&
    cardsComplete
  );
}

/**
 * @param state - Prompts recorded by the planning tools
 * @param summary - Coordinator closing text, when it had a step left to write one
 * @returns Rooms, then each character with that character's cards and
 * sprite, then each enemy with its sprite
 */
function planResult(
  state: DungeonPlanState,
  summary: string,
): DungeonCoordinatorResult {
  const text = summary.trim();
  const slots: PlannedDungeonSlot[] = [...state.backgrounds];
  for (const character of state.characters.values()) {
    slots.push(character.slot, ...character.cards, character.sprite);
  }
  for (const enemy of state.enemies) {
    slots.push(enemy.slot, enemy.sprite);
  }
  return {
    slots,
    summary: text === "" ? DUNGEON_PROMPTS_READY : text,
  };
}
