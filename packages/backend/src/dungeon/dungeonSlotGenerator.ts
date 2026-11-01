import { Injectable, InternalServerErrorException } from "@nestjs/common";
import type { CardProgression } from "src/asset-classes/playable-card/cardProgression";
import { strongerCardError } from "src/asset-classes/playable-card/cardProgression";
import { BattleBackgroundAgent } from "src/mastra/agents/battle-background/battleBackgroundAgent";
import { CardCharacterAgent } from "src/mastra/agents/card-character/cardCharacterAgent";
import { CardGeneratorAgent } from "src/mastra/agents/card-generator/cardGeneratorAgent";
import { EnemyAgent } from "src/mastra/agents/enemy/enemyAgent";
import { SpriteSheetAgent } from "src/mastra/agents/sprite-sheet/spriteSheetAgent";
import { runWithProductNowSession } from "src/product-now-mcp/productNowSessionContext";
import { DungeonAssetLookup } from "./dungeonAssetLookup";
import type { StoredDungeonSlot } from "./dungeonBlueprint";

/** Everything needed to call the agent for one prepared dungeon slot. */
export interface PreparedDungeonSlot {
  progression?: CardProgression;
  prompt: string;
  slot: StoredDungeonSlot;
}

/** Input for dispatching a prepared slot to its asset agent. */
export interface GenerateDungeonSlotInput extends PreparedDungeonSlot {
  generationId: string;
  sessionId: string;
}

/**
 * Adapts dungeon slots to the five asset agents.
 *
 * This is the single extension point for adding a new slot kind: prepare its
 * prompt here, dispatch it in {@link DungeonSlotGenerator.generate}, and add
 * its agent to {@link DungeonSlotGenerator.abort}.
 */
@Injectable()
export class DungeonSlotGenerator {
  public constructor(
    private readonly backgrounds: BattleBackgroundAgent,
    private readonly characters: CardCharacterAgent,
    private readonly cards: CardGeneratorAgent,
    private readonly enemies: EnemyAgent,
    private readonly sprites: SpriteSheetAgent,
    private readonly assets: DungeonAssetLookup,
  ) {}

  /**
   * Stops a slot generation without requiring the caller to know which agent
   * owns the generation id.
   * @param generationId - Client id used to start the slot
   * @returns Whether any agent recorded the stop
   */
  public async abort(generationId: string): Promise<boolean> {
    const stopped = await Promise.all([
      this.backgrounds.abort(generationId),
      this.characters.abort(generationId),
      this.cards.abort(generationId),
      this.enemies.abort(generationId),
      this.sprites.abort(generationId),
    ]);
    return stopped.some(Boolean);
  }

  /**
   * Adds character context to cards, owner context and facing to sprites,
   * and resolves the previous
   * card's progression lock.
   * @param slot - Slot about to run
   * @param slots - Every slot in the same dungeon package
   * @returns The prompt and progression data ready for dispatch
   */
  public async prepare(
    slot: StoredDungeonSlot,
    slots: readonly StoredDungeonSlot[],
  ): Promise<PreparedDungeonSlot> {
    const progression = await this.assets.progressionFor(slot, slots);
    if (slot.kind === "sprite-sheet") {
      return {
        prompt: withSpriteOwnerContext(slot, slots),
        slot,
      };
    }
    if (slot.kind !== "playable-card") {
      return { prompt: slot.prompt, slot };
    }
    return {
      progression,
      prompt: withCharacterContext(slot, slots),
      slot,
    };
  }

  /**
   * Dispatches a prepared slot and returns the stored asset id.
   * @param input - Prepared slot, generation id, and ProductNow session
   * @returns The id written by the selected asset agent
   */
  public generate(input: GenerateDungeonSlotInput): Promise<string> {
    return runWithProductNowSession(input.sessionId, () =>
      this.generateWithSession(input),
    );
  }

  /**
   * @param input - Slot generation with ProductNow already bound
   * @returns The generated asset id
   */
  private async generateWithSession(
    input: GenerateDungeonSlotInput,
  ): Promise<string> {
    if (input.slot.kind === "battle-background") {
      const result = await this.backgrounds.query({
        generationId: input.generationId,
        prompt: input.prompt,
      });
      return result.id;
    }
    if (input.slot.kind === "card-character") {
      const result = await this.characters.query({
        generationId: input.generationId,
        prompt: input.prompt,
      });
      return result.setId;
    }
    if (input.slot.kind === "enemy") {
      const result = await this.enemies.query({
        generationId: input.generationId,
        prompt: input.prompt,
      });
      return result.id;
    }
    if (input.slot.kind === "sprite-sheet") {
      const result = await this.sprites.query({
        generationId: input.generationId,
        prompt: input.prompt,
      });
      return result.id;
    }

    const card = await this.cards.query({
      generationId: input.generationId,
      progression: input.progression,
      prompt: input.prompt,
      sessionId: input.sessionId,
    });
    if (input.progression !== undefined) {
      const progressionError = strongerCardError(card, input.progression);
      if (progressionError !== undefined) {
        throw new InternalServerErrorException(progressionError);
      }
    }
    return card.cardId;
  }
}

/** Facing line for a party member's sprite. */
export const CHARACTER_SPRITE_FACING =
  "Facing: right. This is a party member, standing on the left of battle and facing the enemies.";

/** Facing line for an enemy's sprite. */
export const ENEMY_SPRITE_FACING =
  "Facing: left. This is an enemy, standing on the right of battle and facing the player's party.";

/**
 * @param slot - Card slot owned by a character
 * @param slots - Every slot in the package
 * @returns The character's prompt above the card's prompt, or the card's
 * prompt alone when the character slot is missing
 */
function withCharacterContext(
  slot: Extract<StoredDungeonSlot, { kind: "playable-card" }>,
  slots: readonly StoredDungeonSlot[],
): string {
  const character = slots.find((entry) => entry.id === slot.characterSlotId);
  if (character === undefined) {
    return slot.prompt;
  }
  return `Character:\n${character.prompt}\n\nCard request:\n${slot.prompt}`;
}

/**
 * Puts the sprite's owner prompt above the sprite request and states which
 * way the sprite faces: right for a party member, left for an enemy.
 * @param slot - Sprite slot owned by a character or enemy
 * @param slots - Every slot in the package
 * @returns The owner's prompt and facing above the sprite's prompt, or the
 * sprite's prompt alone when the owner is missing or cannot fight
 */
function withSpriteOwnerContext(
  slot: Extract<StoredDungeonSlot, { kind: "sprite-sheet" }>,
  slots: readonly StoredDungeonSlot[],
): string {
  const owner = slots.find((entry) => entry.id === slot.ownerSlotId);
  if (owner?.kind === "card-character") {
    return `Character:\n${owner.prompt}\n\nSprite request:\n${CHARACTER_SPRITE_FACING}\n${slot.prompt}`;
  }
  if (owner?.kind === "enemy") {
    return `Enemy:\n${owner.prompt}\n\nSprite request:\n${ENEMY_SPRITE_FACING}\n${slot.prompt}`;
  }
  return slot.prompt;
}
