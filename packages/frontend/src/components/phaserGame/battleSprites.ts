import type Phaser from "phaser";
import type { CombatEvent } from "../tower/logic/combat";
import type { UnitSprite, UnitSpriteMove } from "../tower/logic/towerTypes";
import type { UnitSlot } from "./battleLayout";
import { paced } from "./battleMotion";
import { hashSeed } from "./leafShape";
import { resolveBattleAssetUrl } from "./resolveBattleAssetUrl";

type PhaserRuntime = typeof import("phaser");

/** Frame of the hurt strip a fallen unit is held on: the recoil peak. */
const FALLEN_HURT_FRAME = 2;

/** Widest a sprite may be drawn, as a share of its slot's width. */
const MAX_SLOT_WIDTH_SHARE = 1.5;

/** One animation strip the battle loads as a Phaser sprite sheet. */
export interface BattleSpriteRequest {
  /** Phaser animation key */
  animationKey: string;
  fps: number;
  frameCount: number;
  frameHeight: number;
  frameWidth: number;
  loop: boolean;
  /** Phaser texture key */
  textureKey: string;
  url: string;
}

/** A sprite move a combat event asks one unit to play. */
export interface SpriteCue {
  move: UnitSpriteMove;
  unitId: string;
}

/**
 * @param spriteId - Sprite-sheet id
 * @param move - Animation row
 * @returns Texture key for that strip. Units that share a figure share it.
 */
export function spriteTextureKey(
  spriteId: string,
  move: UnitSpriteMove,
): string {
  return `battle-sprite-${spriteId}-${move}`;
}

/**
 * @param spriteId - Sprite-sheet id
 * @param move - Animation row
 * @returns Animation key for that strip
 */
export function spriteAnimationKey(
  spriteId: string,
  move: UnitSpriteMove,
): string {
  return `battle-sprite-anim-${spriteId}-${move}`;
}

/**
 * Lists every animation strip the fight needs. A figure is only usable
 * with an idle strip, so figures without one are skipped. Each strip loads
 * once even when several units share it.
 * @param units - Party members and enemies in battle
 * @param backendOrigin - Backend origin used to resolve `/static/...` paths
 * @returns Loader requests, idle first for each figure
 */
export function listBattleSpriteRequests(
  units: readonly { sprite?: UnitSprite }[],
  backendOrigin = process.env.NEXT_PUBLIC_API_CLIENT_URL ?? "",
): BattleSpriteRequest[] {
  const requests: BattleSpriteRequest[] = [];
  const seen = new Set<string>();
  for (const { sprite } of units) {
    if (!sprite?.animations.idle || seen.has(sprite.id)) {
      continue;
    }
    seen.add(sprite.id);
    for (const move of spriteMoves(sprite)) {
      const animation = sprite.animations[move];
      const url = resolveBattleAssetUrl(
        animation?.stripUrl ?? "",
        backendOrigin,
      );
      if (!animation || url === undefined) {
        continue;
      }
      requests.push({
        animationKey: spriteAnimationKey(sprite.id, move),
        fps: animation.fps,
        frameCount: Math.max(1, Math.floor(animation.frameCount)),
        frameHeight: sprite.frameHeight,
        frameWidth: sprite.frameWidth,
        loop: animation.loop,
        textureKey: spriteTextureKey(sprite.id, move),
        url,
      });
    }
  }
  return requests;
}

/**
 * @param sprite - Battle figure
 * @returns Moves it has strips for, idle first
 */
function spriteMoves(sprite: UnitSprite): UnitSpriteMove[] {
  const moves = Object.keys(sprite.animations) as UnitSpriteMove[];
  return [
    ...moves.filter((move) => move === "idle"),
    ...moves.filter((move) => move !== "idle"),
  ];
}

/**
 * Reads which sprite moves one combat event shows. An attacker swings; a
 * target that loses health flinches, and one whose block soaks the whole
 * hit guards. Gaining block raises a guard too.
 * @param event - One combat event
 * @returns Moves to play, attacker first. Units without a sprite ignore theirs.
 */
export function spriteCuesForEvent(event: CombatEvent): SpriteCue[] {
  if (event.kind === "block") {
    return [{ move: "defend", unitId: event.targetId }];
  }
  if (event.kind !== "damage") {
    return [];
  }
  const struck: SpriteCue = {
    move: event.dealt > 0 ? "hurt" : "defend",
    unitId: event.targetId,
  };
  if (event.sourceId === event.targetId) {
    return [struck];
  }
  return [{ move: "attack", unitId: event.sourceId }, struck];
}

/**
 * Fits a figure into a unit's slot. The figure is as tall as the slot,
 * unless a wide frame would spill too far past the slot's sides.
 * @param sprite - Frame size of the figure
 * @param slot - Unit's portrait box
 * @returns Scale to draw each frame at
 */
export function spriteDisplayScale(
  sprite: Pick<UnitSprite, "frameHeight" | "frameWidth">,
  slot: Pick<UnitSlot, "height" | "width">,
): number {
  const byHeight = slot.height / Math.max(1, sprite.frameHeight);
  const byWidth =
    (slot.width * MAX_SLOT_WIDTH_SHARE) / Math.max(1, sprite.frameWidth);
  return Math.min(byHeight, byWidth);
}

/**
 * @param pace - Battle speed multiplier on durations. Lower is faster.
 * @returns Animation time scale that keeps sprites in step with that speed
 */
export function spriteTimeScale(pace: number): number {
  return 1000 / Math.max(1, paced(1000, pace));
}

/** Which side of the field a unit fights on. */
export type BattleSide = "party" | "enemy";

/** A unit the director may animate. */
export interface SpriteUnit {
  id: string;
  side: BattleSide;
  sprite?: UnitSprite;
}

/**
 * @param figure - Painted facing of the figure
 * @param side - Side the unit fights on
 * @returns Whether to mirror the figure so it faces the other side
 */
export function spriteNeedsFlip(
  figure: Pick<UnitSprite, "facing">,
  side: BattleSide,
): boolean {
  const wanted = side === "party" ? "right" : "left";
  return figure.facing !== wanted;
}

/**
 * Loads and plays every unit's animated figure in the battle scene: party
 * members and enemies alike. Unit views ask it for a figure and own the
 * sprite once made; the director remembers which sprite is whose so combat
 * events can make them move.
 */
export class BattleSpriteDirector {
  private readonly requests: BattleSpriteRequest[];
  private readonly sprites = new Map<string, Phaser.GameObjects.Sprite>();
  private readonly units: Map<string, SpriteUnit>;
  private readonly timeScale: number;

  /**
   * @param Phaser - Phaser module namespace
   * @param scene - Battle scene that owns the loader and animations
   * @param units - Every unit in the fight, whose sprites are loaded
   * @param pace - Battle speed multiplier on durations
   */
  public constructor(
    private readonly Phaser: PhaserRuntime,
    private readonly scene: Phaser.Scene,
    units: readonly SpriteUnit[],
    pace: number,
  ) {
    this.requests = listBattleSpriteRequests(units);
    this.units = new Map(units.map((unit) => [unit.id, unit]));
    this.timeScale = spriteTimeScale(pace);
  }

  /**
   * Queues every strip. Call from the scene's `preload`.
   */
  public preload(): void {
    for (const request of this.requests) {
      this.scene.load.spritesheet(request.textureKey, request.url, {
        frameHeight: request.frameHeight,
        frameWidth: request.frameWidth,
      });
    }
  }

  /**
   * Creates an animation for each strip that loaded and keeps pixel art
   * crisp. Call from the scene's `create`.
   */
  public create(): void {
    for (const request of this.requests) {
      if (!this.scene.textures.exists(request.textureKey)) {
        continue;
      }
      this.scene.textures
        .get(request.textureKey)
        .setFilter(this.Phaser.Textures.FilterMode.NEAREST);
      if (this.scene.anims.exists(request.animationKey)) {
        continue;
      }
      this.scene.anims.create({
        frameRate: request.fps,
        frames: this.scene.anims.generateFrameNumbers(request.textureKey, {
          end: request.frameCount - 1,
          start: 0,
        }),
        key: request.animationKey,
        repeat: request.loop ? -1 : 0,
      });
    }
  }

  /**
   * Makes a unit's figure, feet at the origin, facing the other side and
   * scaled to its slot. A fallen unit is held on its flinch.
   * @param unitId - Unit id
   * @param slot - Unit's figure box
   * @param alive - Whether the unit still stands
   * @returns The sprite, not yet in any container, or undefined when the
   * unit has no usable figure and should draw its portrait
   */
  public createFigure(
    unitId: string,
    slot: Pick<UnitSlot, "height" | "width">,
    alive: boolean,
  ): Phaser.GameObjects.Sprite | undefined {
    const unit = this.units.get(unitId);
    const figure = unit?.sprite;
    const idleTexture = figure && spriteTextureKey(figure.id, "idle");
    if (!unit || !figure || !idleTexture) {
      return undefined;
    }
    if (!this.scene.textures.exists(idleTexture)) {
      return undefined;
    }
    const sprite = this.scene.add.sprite(0, 0, idleTexture, 0);
    sprite.setOrigin(0.5, 1);
    sprite.setScale(spriteDisplayScale(figure, slot));
    sprite.setFlipX(spriteNeedsFlip(figure, unit.side));
    sprite.anims.timeScale = this.timeScale;
    this.sprites.set(unitId, sprite);
    if (alive) {
      this.playIdle(unitId, sprite, figure);
    } else {
      this.holdFallen(sprite, figure);
    }
    return sprite;
  }

  /**
   * Forgets a unit's sprite before its view is destroyed.
   * @param unitId - Unit id
   */
  public release(unitId: string): void {
    this.sprites.delete(unitId);
  }

  /**
   * Plays the moves a combat event calls for, then returns each figure to
   * its idle loop. A move already playing is not restarted, so an attack
   * that hits several units swings once.
   * @param event - One combat event
   */
  public play(event: CombatEvent): void {
    for (const cue of spriteCuesForEvent(event)) {
      this.playMove(cue.unitId, cue.move);
    }
  }

  /**
   * Plays one move on a unit's figure, then returns it to idle.
   * @param unitId - Unit id
   * @param move - Animation row
   * @returns Whether the unit has a figure that can play it
   */
  public playMove(unitId: string, move: UnitSpriteMove): boolean {
    const sprite = this.sprites.get(unitId);
    const figure = this.units.get(unitId)?.sprite;
    if (!sprite || !figure) {
      return false;
    }
    const key = spriteAnimationKey(figure.id, move);
    const alreadyPlaying =
      sprite.anims.isPlaying && sprite.anims.currentAnim?.key === key;
    if (alreadyPlaying || !this.scene.anims.exists(key)) {
      return alreadyPlaying;
    }
    sprite.play(key);
    sprite.chain(spriteAnimationKey(figure.id, "idle"));
    return true;
  }

  /**
   * Holds a unit's figure on its flinch, as it falls.
   * @param unitId - Unit id
   */
  public fall(unitId: string): void {
    const sprite = this.sprites.get(unitId);
    const figure = this.units.get(unitId)?.sprite;
    if (!sprite || !figure) {
      return;
    }
    sprite.stop();
    this.holdFallen(sprite, figure);
  }

  /**
   * Washes a figure in one color for a moment, following its outline.
   * @param unitId - Unit id
   * @param color - Flash color
   * @param durationMs - How long the flash lasts
   * @returns Whether the unit has a figure to flash. When false, flash its portrait.
   */
  public flash(unitId: string, color: number, durationMs: number): boolean {
    const sprite = this.sprites.get(unitId);
    if (!sprite) {
      return false;
    }
    sprite.setTint(color).setTintMode(this.Phaser.TintModes.FILL);
    this.scene.time.delayedCall(durationMs, () => {
      if (sprite.active) {
        sprite.clearTint();
        sprite.setTintMode(this.Phaser.TintModes.MULTIPLY);
      }
    });
    return true;
  }

  /**
   * Starts the idle loop at a frame picked from the unit id, so the field
   * does not breathe in lockstep.
   * @param unitId - Unit id
   * @param sprite - Its sprite
   * @param figure - Its battle figure
   */
  private playIdle(
    unitId: string,
    sprite: Phaser.GameObjects.Sprite,
    figure: UnitSprite,
  ): void {
    const key = spriteAnimationKey(figure.id, "idle");
    if (!this.scene.anims.exists(key)) {
      return;
    }
    const frameCount = figure.animations.idle?.frameCount ?? 1;
    sprite.play({ key, startFrame: Math.abs(hashSeed(unitId)) % frameCount });
  }

  /**
   * @param sprite - Fallen unit's sprite
   * @param figure - Its battle figure
   */
  private holdFallen(
    sprite: Phaser.GameObjects.Sprite,
    figure: UnitSprite,
  ): void {
    const hurtTexture = spriteTextureKey(figure.id, "hurt");
    if (!this.scene.textures.exists(hurtTexture)) {
      return;
    }
    const frameCount = figure.animations.hurt?.frameCount ?? 1;
    sprite.setTexture(hurtTexture, Math.min(FALLEN_HURT_FRAME, frameCount - 1));
  }
}
