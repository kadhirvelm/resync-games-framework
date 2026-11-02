import type {
  AudioAsset,
  BattleBackgroundAsset,
  CardCharacterSetAsset,
  DungeonBlueprint,
  DungeonCardSlot,
  DungeonSlot,
  EnemyAsset,
  PlayableCardAsset,
  SpriteSheetAsset,
} from "@towers-of-coreborn/api";
import {
  BUILT_IN_COREBORN,
  BUILT_IN_CULTIVATOR,
  BUILT_IN_ENEMIES,
  BUILT_IN_SCENES,
  BUILT_IN_TECHNIQUES,
  BUILT_IN_TOWER,
} from "./builtInContent";
import {
  completeTierCards,
  inferCorebornRole,
  ROLE_BASE_HIT_POINTS,
} from "./characterRoles";
import { toEnemyMoves } from "./enemyMoves";
import type {
  CardDefinition,
  CorebornTemplate,
  EnemyTemplate,
  RoomScene,
  TierNumber,
  TowerContent,
  TowerSoundtrack,
  UnitSprite,
} from "./towerTypes";

/** Every stored asset the tower can be built from. */
export interface TowerCatalog {
  audio: AudioAsset[];
  backgrounds: BattleBackgroundAsset[];
  cards: PlayableCardAsset[];
  characters: CardCharacterSetAsset[];
  dungeons: DungeonBlueprint[];
  enemies: EnemyAsset[];
  spriteSheets: SpriteSheetAsset[];
}

/** An empty catalog, used before loading and when the backend is down. */
export const EMPTY_TOWER_CATALOG: TowerCatalog = {
  audio: [],
  backgrounds: [],
  cards: [],
  characters: [],
  dungeons: [],
  enemies: [],
  spriteSheets: [],
};

/** One tower the player can choose to climb. */
export interface TowerChoice {
  /** Dungeon id when `source` is `dungeon` */
  dungeonId?: string;
  id: string;
  /** How many of the package's slots have finished assets */
  readySlots: number;
  source: TowerContent["source"];
  summary: string;
  title: string;
  totalSlots: number;
}

/**
 * Lists the towers that can be climbed: each dungeon package, the loose
 * gallery when it has anything in it, and the built-in tower.
 * @param catalog - Stored assets
 * @returns Dungeons first, newest first, then the gallery and built-in towers
 */
export function listTowerChoices(catalog: TowerCatalog): TowerChoice[] {
  const dungeons = [...catalog.dungeons]
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
    .map((dungeon) => ({
      dungeonId: dungeon.id,
      id: `dungeon-${dungeon.id}`,
      readySlots: dungeon.slots.filter((slot) => slot.assetId !== undefined)
        .length,
      source: "dungeon" as const,
      summary: dungeon.summary || dungeon.prompt,
      title: dungeonTitle(dungeon),
      totalSlots: dungeon.slots.length,
    }));

  const galleryCount =
    catalog.characters.length +
    catalog.enemies.length +
    catalog.backgrounds.length;
  const gallery: TowerChoice[] =
    galleryCount === 0
      ? []
      : [
          {
            id: "gallery",
            readySlots: galleryCount + catalog.cards.length,
            source: "gallery",
            summary:
              "Every character, enemy, room, and card in the Blueprint Workshop, climbed together.",
            title: "The Workshop Tower",
            totalSlots: galleryCount + catalog.cards.length,
          },
        ];

  return [
    ...dungeons,
    ...gallery,
    {
      id: BUILT_IN_TOWER.id,
      readySlots: 0,
      source: "built-in",
      summary: BUILT_IN_TOWER.summary,
      title: BUILT_IN_TOWER.title,
      totalSlots: 0,
    },
  ];
}

/**
 * Builds the content for one tower choice.
 * Missing pieces fall back to built-in content, so a half-generated dungeon
 * is still climbable.
 * @param choice - Tower picked on the title screen
 * @param catalog - Stored assets
 * @returns Content the run will draw from
 */
export function buildTowerContent(
  choice: TowerChoice,
  catalog: TowerCatalog,
): TowerContent {
  if (choice.source === "dungeon") {
    const dungeon = catalog.dungeons.find(
      (entry) => entry.id === choice.dungeonId,
    );
    if (dungeon) {
      return buildDungeonTower(dungeon, catalog);
    }
  }
  if (choice.source === "gallery") {
    return buildGalleryTower(catalog);
  }
  return BUILT_IN_TOWER;
}

/**
 * @param dungeon - Dungeon package
 * @param catalog - Stored assets the slots link to
 * @returns Tower content from the package's slots
 */
function buildDungeonTower(
  dungeon: DungeonBlueprint,
  catalog: TowerCatalog,
): TowerContent {
  const coreborn = dungeon.slots
    .filter((slot) => slot.kind === "card-character")
    .map((slot, index) => dungeonCoreborn(slot, index, dungeon.slots, catalog));
  const enemies = dungeon.slots
    .filter((slot) => slot.kind === "enemy")
    .map((slot, index) => dungeonEnemy(slot, index, dungeon.slots, catalog));
  const scenes = dungeon.slots
    .filter((slot) => slot.kind === "battle-background")
    .map((slot) => dungeonScene(slot, dungeon.slots, catalog));
  const soundtrack = packageSoundtrack(dungeon.slots, catalog);

  return {
    coreborn: coreborn.length > 0 ? coreborn : BUILT_IN_COREBORN,
    cultivator: BUILT_IN_CULTIVATOR,
    enemies: enemies.length > 0 ? enemies : BUILT_IN_ENEMIES,
    id: `dungeon-${dungeon.id}`,
    scenes: scenes.length > 0 ? scenes : BUILT_IN_SCENES,
    source: "dungeon",
    ...(soundtrack ? { soundtrack } : {}),
    summary: dungeon.summary || dungeon.prompt,
    techniques: BUILT_IN_TECHNIQUES,
    title: dungeonTitle(dungeon),
  };
}

/**
 * @param slot - Character slot
 * @param index - Position among the package's characters
 * @param dungeonSlots - Every slot in the package
 * @param catalog - Stored assets
 * @returns A Coreborn using the slot's portraits, card progression, and
 * battle sprite
 */
function dungeonCoreborn(
  slot: DungeonSlot,
  index: number,
  dungeonSlots: DungeonSlot[],
  catalog: TowerCatalog,
): CorebornTemplate {
  const cardSlots = dungeonSlots.filter(
    (entry): entry is DungeonCardSlot => entry.kind === "playable-card",
  );
  const sprite = dungeonSprite(slot, dungeonSlots, catalog);
  const set = catalog.characters.find((entry) => entry.setId === slot.assetId);
  const roleText = [
    slot.prompt,
    set?.prompt ?? "",
    set?.theme ?? "",
    ...(set?.levels.map((level) => level.description) ?? []),
  ].join(" ");
  const role = inferCorebornRole(roleText, index);
  const generated = ([1, 2, 3, 4] as const).map((level) => {
    const cardSlot = cardSlots.find(
      (entry) => entry.characterSlotId === slot.id && entry.level === level,
    );
    const asset = catalog.cards.find(
      (entry) => entry.cardId === cardSlot?.assetId,
    );
    return asset ? toCardDefinition(asset) : undefined;
  });
  const cards = completeTierCards(generated, role, `coreborn-${slot.id}`);
  return corebornFromParts({
    cards,
    description: characterBlurb(set?.prompt || slot.prompt),
    id: slot.id,
    name: slot.title,
    role,
    set,
    sprite,
  });
}

/**
 * @param owner - Character or enemy slot
 * @param dungeonSlots - Every slot in the package
 * @param catalog - Stored assets
 * @returns The battle figure from the owner's filled sprite slot, if any
 */
function dungeonSprite(
  owner: DungeonSlot,
  dungeonSlots: DungeonSlot[],
  catalog: TowerCatalog,
): UnitSprite | undefined {
  const spriteSlot = dungeonSlots.find(
    (entry) => entry.kind === "sprite-sheet" && entry.ownerSlotId === owner.id,
  );
  if (spriteSlot?.assetId === undefined) {
    return undefined;
  }
  const spriteSheet = catalog.spriteSheets.find(
    (entry) => entry.id === spriteSlot.assetId,
  );
  return spriteSheet ? toUnitSprite(spriteSheet) : undefined;
}

/**
 * @param slot - Enemy slot
 * @param index - Position among the package's enemies
 * @param dungeonSlots - Every slot in the package
 * @param catalog - Stored assets
 * @returns The linked enemy, or a built-in fighter wearing the slot's name,
 * animated by the slot's sprite when one is filled
 */
function dungeonEnemy(
  slot: DungeonSlot,
  index: number,
  dungeonSlots: DungeonSlot[],
  catalog: TowerCatalog,
): EnemyTemplate {
  const sprite = dungeonSprite(slot, dungeonSlots, catalog);
  const attackSoundUrl = clipUrlFor(dungeonSlots, slot.id, "attack", catalog);
  const withSprite = sprite ? { sprite } : {};
  const withAttack = attackSoundUrl ? { attackSoundUrl } : {};
  const asset = catalog.enemies.find((entry) => entry.id === slot.assetId);
  if (asset) {
    return { ...toEnemyTemplate(asset), ...withSprite, ...withAttack };
  }
  const stand = BUILT_IN_ENEMIES[
    index % BUILT_IN_ENEMIES.length
  ] as EnemyTemplate;
  return {
    ...stand,
    description: shorten(slot.prompt),
    id: slot.id,
    name: slot.title,
    ...withSprite,
    ...withAttack,
  };
}

/**
 * @param slot - Background slot
 * @param catalog - Stored assets
 * @returns The room, with art when the slot has a linked background
 */
function dungeonScene(
  slot: DungeonSlot,
  slots: readonly DungeonSlot[],
  catalog: TowerCatalog,
): RoomScene {
  const asset = catalog.backgrounds.find((entry) => entry.id === slot.assetId);
  const ambienceUrl = clipUrlFor(slots, slot.id, "room", catalog);
  return {
    ...(ambienceUrl ? { ambienceUrl } : {}),
    description: shorten(asset?.description || slot.prompt),
    id: slot.id,
    imageUrl: asset?.imageUrl,
    title: asset?.title || slot.title,
  };
}

/**
 * @param catalog - Stored assets
 * @returns Tower content using every loose asset in the workshop
 */
function buildGalleryTower(catalog: TowerCatalog): TowerContent {
  const coreborn = catalog.characters.map((set, index) => {
    const roleText = [
      set.prompt,
      set.theme,
      ...set.levels.map((level) => level.description),
    ].join(" ");
    const role = inferCorebornRole(roleText, index);
    return corebornFromParts({
      cards: completeTierCards([], role, `coreborn-${set.setId}`),
      description: characterBlurb(set.prompt),
      id: set.setId,
      name: characterName(set),
      role,
      set,
    });
  });
  const generatedTechniques = catalog.cards.map(toCardDefinition);
  const scenes =
    catalog.backgrounds.length > 0
      ? catalog.backgrounds.map((background) => ({
          description: shorten(background.description),
          id: background.id,
          imageUrl: background.imageUrl,
          title: background.title,
        }))
      : BUILT_IN_SCENES;
  const enemies =
    catalog.enemies.length > 0
      ? catalog.enemies.map(toEnemyTemplate)
      : BUILT_IN_ENEMIES;
  const heard = hearGalleryAudio(scenes, enemies, catalog.audio);
  return {
    coreborn: coreborn.length > 0 ? coreborn : BUILT_IN_COREBORN,
    cultivator: BUILT_IN_CULTIVATOR,
    enemies: heard.enemies,
    id: "gallery",
    scenes: heard.scenes,
    source: "gallery",
    ...(heard.soundtrack ? { soundtrack: heard.soundtrack } : {}),
    summary:
      "Every character, enemy, and room in the Blueprint Workshop, stacked into one tower. Climb it and see what the generators made.",
    techniques: [...generatedTechniques, ...BUILT_IN_TECHNIQUES],
    title: "The Workshop Tower",
  };
}

/**
 * @param parts.cards - Four tier cards
 * @param parts.description - Lore line
 * @param parts.id - Template id
 * @param parts.name - Display name
 * @param parts.role - Fighting role
 * @param parts.set - Portrait set, when one is linked
 * @param parts.sprite - Animated battle figure, when one is linked
 * @returns A Coreborn template
 */
function corebornFromParts(parts: {
  cards: CardDefinition[];
  description: string;
  id: string;
  name: string;
  role: CorebornTemplate["role"];
  set?: CardCharacterSetAsset;
  sprite?: UnitSprite;
}): CorebornTemplate {
  return {
    baseHitPoints: ROLE_BASE_HIT_POINTS[parts.role],
    description: parts.description,
    id: parts.id,
    name: parts.name,
    role: parts.role,
    ...(parts.sprite ? { sprite: parts.sprite } : {}),
    tiers: parts.cards.map((card, index) => {
      const level = parts.set?.levels.find(
        (entry) => entry.level === index + 1,
      );
      return {
        card,
        portraitUrl: level?.url,
        tier: (index + 1) as TierNumber,
        title: level?.title ?? `Tier ${index + 1}`,
      };
    }),
  };
}

/**
 * @param asset - Stored playable card
 * @returns The card's rules, art, and lore line
 */
export function toCardDefinition(asset: PlayableCardAsset): CardDefinition {
  return {
    flavor: asset.description,
    id: asset.cardId,
    imageUrl: asset.imageUrl,
    rules: {
      aetherCost: asset.aetherCost,
      effects: asset.effects,
      name: asset.name,
    },
  };
}

/**
 * @param asset - Stored sprite sheet
 * @returns The battle figure: one strip per animation, keyed by move
 */
export function toUnitSprite(asset: SpriteSheetAsset): UnitSprite {
  return {
    animations: Object.fromEntries(
      asset.animations.map((animation) => [
        animation.kind,
        {
          fps: animation.fps,
          frameCount: animation.frameCount,
          loop: animation.loop,
          stripUrl: animation.stripUrl,
        },
      ]),
    ),
    facing: asset.facing,
    frameHeight: asset.frameHeight,
    frameWidth: asset.frameWidth,
    id: asset.id,
  };
}

/**
 * @param asset - Stored enemy
 * @returns The enemy with target patterns read from its cycle
 */
export function toEnemyTemplate(asset: EnemyAsset): EnemyTemplate {
  return {
    description: shorten(asset.description),
    id: asset.id,
    imageUrl: asset.imageUrl,
    maxHitPoints: asset.maxHitPoints,
    moves: toEnemyMoves(asset.pattern, asset.maxHitPoints),
    name: asset.title,
  };
}

/**
 * Reads a character's name from the quoted name in its prompt.
 * @param set - Portrait set
 * @returns The quoted name, or the first level's title
 */
export function characterName(set: CardCharacterSetAsset): string {
  const quoted = set.prompt.match(/['"‘“]([^'"’”]{2,60})['"’”]/);
  if (quoted?.[1]) {
    return quoted[1].trim();
  }
  return set.levels[0]?.title ?? "Coreborn";
}

/**
 * Turns a character prompt into a one-line introduction. The asset's theme
 * holds palette notes for the painter, so the prompt's first sentence reads
 * better: "Create a four-level portrait set for 'Ilyan Rook', a scout..."
 * becomes "Ilyan Rook, a scout...".
 * @param prompt - Character prompt
 * @returns The prompt's first sentence without the request wording
 */
export function characterBlurb(prompt: string): string {
  const firstSentence = prompt.split(/(?<=[.!?])\s/)[0] ?? prompt;
  const withoutRequest = firstSentence
    .replace(
      /^\s*create\s+(?:an?\s+|the\s+)?(?:four-level\s+)?(?:portrait\s+set\s+)?(?:for\s+)?/i,
      "",
    )
    .replace(/['"‘“]([^'"’”]{2,60})['"’”]/, "$1")
    .trim();
  const blurb =
    withoutRequest.charAt(0).toUpperCase() + withoutRequest.slice(1);
  return shorten(blurb, 180);
}

/**
 * @param dungeon - Dungeon package
 * @returns A short title from the first clause of its prompt
 */
export function dungeonTitle(dungeon: DungeonBlueprint): string {
  const firstClause = dungeon.prompt.split(/[.!?\n]/)[0]?.trim() ?? "";
  if (firstClause === "") {
    return "Untitled Dungeon";
  }
  if (firstClause.length <= 56) {
    return firstClause;
  }
  return `${firstClause.slice(0, 53).trimEnd()}…`;
}

/**
 * Keeps lore readable on a card or a room banner.
 * @param text - Generated description or prompt
 * @param maxLength - Longest result, in characters
 * @returns Whole sentences up to the limit, or a clipped first sentence
 */
export function shorten(text: string, maxLength = 220): string {
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean.length <= maxLength) {
    return clean;
  }
  const sentences = clean.match(/[^.!?]+[.!?]+/g) ?? [];
  let result = "";
  for (const sentence of sentences) {
    if ((result + sentence).length > maxLength) {
      break;
    }
    result += sentence;
  }
  if (result.trim() !== "") {
    return result.trim();
  }
  return `${clean.slice(0, maxLength - 1).trimEnd()}…`;
}

/**
 * @param slots - Package slots
 * @param ownerSlotId - Room or enemy the clip belongs to
 * @param cue - room or attack
 * @param catalog - Stored clips, used when the slot preview has no URL
 * @returns The clip URL, when that slot is ready
 */
function clipUrlFor(
  slots: readonly DungeonSlot[],
  ownerSlotId: string,
  cue: "room" | "attack",
  catalog: TowerCatalog,
): string | undefined {
  const slot = slots.find(
    (entry) =>
      entry.kind === "audio" &&
      entry.ownerSlotId === ownerSlotId &&
      entry.cue === cue,
  );
  if (slot === undefined) {
    return undefined;
  }
  return clipUrl(slot, catalog);
}

/**
 * @param slots - Package slots
 * @param catalog - Stored clips
 * @returns Music and stingers that are ready, or undefined when none are
 */
function packageSoundtrack(
  slots: readonly DungeonSlot[],
  catalog: TowerCatalog,
): TowerSoundtrack | undefined {
  const music: TowerSoundtrack["music"] = {};
  const stingers: TowerSoundtrack["stingers"] = {};
  for (const slot of slots) {
    if (slot.kind !== "audio" || slot.ownerSlotId !== undefined) {
      continue;
    }
    const url = clipUrl(slot, catalog);
    if (url === undefined) {
      continue;
    }
    if (slot.cue === "camp" || slot.cue === "battle" || slot.cue === "boss") {
      music[slot.cue] = url;
    }
    if (
      slot.cue === "victory" ||
      slot.cue === "defeat" ||
      slot.cue === "reward"
    ) {
      stingers[slot.cue] = url;
    }
  }
  if (Object.keys(music).length === 0 && Object.keys(stingers).length === 0) {
    return undefined;
  }
  return { music, stingers };
}

/**
 * @param slot - Audio slot
 * @param catalog - Stored clips
 * @returns The clip URL from the slot preview or the catalog
 */
function clipUrl(slot: DungeonSlot, catalog: TowerCatalog): string | undefined {
  if (slot.kind !== "audio" || slot.status !== "ready") {
    return undefined;
  }
  if (slot.preview?.audioUrl) {
    return slot.preview.audioUrl;
  }
  return catalog.audio.find((entry) => entry.id === slot.assetId)?.audioUrl;
}

/**
 * Lays loose workshop clips onto the gallery tower: room tones in scene
 * order, attack clips in enemy order, and music or stingers by cue.
 * @param scenes - Gallery rooms
 * @param enemies - Gallery enemies
 * @param clips - Stored audio, newest first
 * @returns The same lists with any matching clips attached
 */
function hearGalleryAudio(
  scenes: RoomScene[],
  enemies: EnemyTemplate[],
  clips: readonly AudioAsset[],
): {
  enemies: EnemyTemplate[];
  scenes: RoomScene[];
  soundtrack?: TowerSoundtrack;
} {
  const rooms = clips.filter((clip) => clip.cue === "room");
  const attacks = clips.filter((clip) => clip.cue === "attack");
  const soundtrack = packageSoundtrack(
    clips.map((clip) => ({
      cue: clip.cue,
      id: clip.id,
      kind: "audio" as const,
      loop: clip.loop,
      preview: {
        audioUrl: clip.audioUrl,
        subtitle: clip.cue,
        title: clip.title,
      },
      prompt: clip.prompt,
      role: clip.role,
      status: "ready" as const,
      title: clip.title,
    })),
    { ...EMPTY_TOWER_CATALOG, audio: [...clips] },
  );
  return {
    enemies: enemies.map((enemy, index) => {
      const attack = attacks[index];
      if (attack === undefined) {
        return enemy;
      }
      return { ...enemy, attackSoundUrl: attack.audioUrl };
    }),
    scenes: scenes.map((scene, index) => {
      const room = rooms[index];
      if (room === undefined) {
        return scene;
      }
      return { ...scene, ambienceUrl: room.audioUrl };
    }),
    ...(soundtrack ? { soundtrack } : {}),
  };
}
