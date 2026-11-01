import { BadRequestException, Injectable } from "@nestjs/common";
import type {
  DungeonSlotKind,
  DungeonSlotPreview,
  PlayableCardEffect,
} from "@towers-of-coreborn/api";
import { BATTLE_BACKGROUND_STORAGE } from "src/asset-classes/battle-background/battleBackgroundStorage";
import { readBattleBackground } from "src/asset-classes/battle-background/readBattleBackgrounds";
import { CARD_CHARACTER_STORAGE } from "src/asset-classes/card-character/cardCharacterStorage";
import { readCardCharacterSet } from "src/asset-classes/card-character/readCardCharacterSets";
import { ENEMY_STORAGE } from "src/asset-classes/enemy/enemyStorage";
import { readEnemy } from "src/asset-classes/enemy/readEnemies";
import type { CardProgression } from "src/asset-classes/playable-card/cardProgression";
import { PLAYABLE_CARD_STORAGE } from "src/asset-classes/playable-card/playableCardStorage";
import { readPlayableCard } from "src/asset-classes/playable-card/readPlayableCards";
import { readSpriteSheet } from "src/asset-classes/sprite-sheet/readSpriteSheets";
import { SPRITE_SHEET_STORAGE } from "src/asset-classes/sprite-sheet/spriteSheetStorage";
import { ConfigurationService } from "src/configuration/configuration.service";
import type { StoredDungeonSlot } from "./dungeonBlueprint";

/** Rules of a linked card, used to scale the next level. */
export interface LinkedCardRules {
  aetherCost: number;
  effects: PlayableCardEffect[];
}

/** An existing asset that can be attached to a dungeon slot. */
export interface LinkedDungeonAsset {
  /** Set when the asset is a playable card */
  card?: LinkedCardRules;
  preview: DungeonSlotPreview;
}

/**
 * Reads stored assets when a dungeon slot is filled or a later card needs
 * the previous level's rules.
 */
@Injectable()
export class DungeonAssetLookup {
  public constructor(
    private readonly configurationService: ConfigurationService,
  ) {}

  /**
   * Builds the lock for a card after level 1.
   * Level 1 has no previous card. A later level needs the previous slot to
   * already point at a readable card.
   * @param slot - Card slot about to be generated
   * @param slots - Every slot in the package
   * @returns The lock for levels 2 through 4, or undefined for anything else
   * @throws BadRequestException when the previous level is not ready
   */
  public async progressionFor(
    slot: StoredDungeonSlot,
    slots: readonly StoredDungeonSlot[],
  ): Promise<CardProgression | undefined> {
    if (slot.kind !== "playable-card" || slot.level <= 1) {
      return undefined;
    }
    const level = slot.level;

    const previous = slots.find(
      (entry) =>
        entry.kind === "playable-card" &&
        entry.characterSlotId === slot.characterSlotId &&
        entry.level === level - 1,
    );
    if (previous?.status !== "ready" || previous.assetId === undefined) {
      throw new BadRequestException(
        `Attach or generate level ${level - 1} before level ${level}.`,
      );
    }

    const linked = await this.read("playable-card", previous.assetId);
    if (linked?.card === undefined) {
      throw new BadRequestException(
        "The previous level's card could not be read.",
      );
    }
    return {
      aetherCost: linked.card.aetherCost,
      level,
      previousEffects: linked.card.effects,
    };
  }

  /**
   * @param kind - Which asset class the slot expects
   * @param assetId - Stored asset id
   * @returns The asset preview, or undefined when that id is not a complete asset of this kind
   */
  public async read(
    kind: DungeonSlotKind,
    assetId: string,
  ): Promise<LinkedDungeonAsset | undefined> {
    const backendUrl = this.configurationService.get("BACKEND_API_URL");
    if (kind === "battle-background") {
      return readBackground(assetId, backendUrl);
    }
    if (kind === "card-character") {
      return readCharacter(assetId, backendUrl);
    }
    if (kind === "enemy") {
      return readEnemyAsset(assetId, backendUrl);
    }
    if (kind === "sprite-sheet") {
      return readSprite(assetId, backendUrl);
    }
    return readCard(assetId, backendUrl);
  }
}

/**
 * @param assetId - Stored background id
 * @param backendUrl - Public backend origin
 * @returns Preview of that room, or undefined when it cannot be read
 */
async function readBackground(
  assetId: string,
  backendUrl: string,
): Promise<LinkedDungeonAsset | undefined> {
  const asset = await readBattleBackground(
    BATTLE_BACKGROUND_STORAGE.rootPath(),
    assetId,
    BATTLE_BACKGROUND_STORAGE.publicUrl(backendUrl),
  );
  if (asset === undefined) {
    return undefined;
  }
  return {
    preview: {
      imageUrl: asset.imageUrl,
      subtitle: asset.description,
      title: asset.title,
    },
  };
}

/**
 * @param assetId - Stored character set id
 * @param backendUrl - Public backend origin
 * @returns Preview of that character, or undefined when it cannot be read
 */
async function readCharacter(
  assetId: string,
  backendUrl: string,
): Promise<LinkedDungeonAsset | undefined> {
  const asset = await readCardCharacterSet(
    CARD_CHARACTER_STORAGE.rootPath(),
    assetId,
    CARD_CHARACTER_STORAGE.publicUrl(backendUrl),
  );
  const portrait = asset?.levels[0];
  if (asset === undefined || portrait === undefined) {
    return undefined;
  }
  return {
    preview: {
      imageUrl: portrait.url,
      subtitle: asset.theme,
      title: portrait.title,
    },
  };
}

/**
 * @param assetId - Stored enemy id
 * @param backendUrl - Public backend origin
 * @returns Preview of that enemy, or undefined when it cannot be read
 */
async function readEnemyAsset(
  assetId: string,
  backendUrl: string,
): Promise<LinkedDungeonAsset | undefined> {
  const asset = await readEnemy(
    ENEMY_STORAGE.rootPath(),
    assetId,
    ENEMY_STORAGE.publicUrl(backendUrl),
  );
  if (asset === undefined) {
    return undefined;
  }
  return {
    preview: {
      imageUrl: asset.imageUrl,
      subtitle: `${asset.maxHitPoints} HP`,
      title: asset.title,
    },
  };
}

/**
 * @param assetId - Stored sprite-sheet id
 * @param backendUrl - Public backend origin
 * @returns Preview of that sprite's anchor frame, or undefined when it cannot be read
 */
async function readSprite(
  assetId: string,
  backendUrl: string,
): Promise<LinkedDungeonAsset | undefined> {
  const asset = await readSpriteSheet(
    SPRITE_SHEET_STORAGE.rootPath(),
    assetId,
    SPRITE_SHEET_STORAGE.publicUrl(backendUrl),
  );
  if (asset === undefined) {
    return undefined;
  }
  return {
    preview: {
      imageUrl: asset.anchorUrl,
      subtitle: asset.animations
        .map((animation) => animation.label)
        .join(" · "),
      title: asset.title,
    },
  };
}

/**
 * @param assetId - Stored card id
 * @param backendUrl - Public backend origin
 * @returns Preview and rules, or undefined when the card cannot be read
 */
async function readCard(
  assetId: string,
  backendUrl: string,
): Promise<LinkedDungeonAsset | undefined> {
  const asset = await readPlayableCard(
    PLAYABLE_CARD_STORAGE.rootPath(),
    assetId,
    PLAYABLE_CARD_STORAGE.publicUrl(backendUrl),
  );
  if (asset === undefined) {
    return undefined;
  }
  const cost =
    asset.aetherCost === 1 ? "1 Aether" : `${asset.aetherCost} Aether`;
  return {
    card: { aetherCost: asset.aetherCost, effects: asset.effects },
    preview: {
      imageUrl: asset.imageUrl,
      subtitle: cost,
      title: asset.name,
    },
  };
}
