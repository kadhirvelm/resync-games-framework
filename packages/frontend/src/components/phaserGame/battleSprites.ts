import type Phaser from "phaser";
import type { CombatEvent, PartyUnit } from "../tower/logic/combat";
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
 * Lists every animation strip the party needs. A figure is only usable
 * with an idle strip, so figures without one are skipped. Each strip loads
 * once even when several units share it.
 * @param party - Party units in battle
 * @param backendOrigin - Backend origin used to resolve `/static/...` paths
 * @returns Loader requests, idle first for each figure
 */
export function listBattleSpriteRequests(
  party: readonly Pick<PartyUnit, "sprite">[],
  backendOrigin = process.env.NEXT_PUBLIC_API_CLIENT_URL ?? "",
): BattleSpriteRequest[] {
  const requests: BattleSpriteRequest[] = [];
  const seen = new Set<string>();
  for (const { sprite } of party) {
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

/**
 * Loads, draws, and plays the party's animated figures in the battle scene.
 * The scene rebuilds every unit on each redraw, so the director remembers
 * where each idle loop was and resumes it, keeping the figures breathing
 * smoothly instead of snapping back to their first frame.
 */
export class BattleSpriteDirector {
  private readonly requests: BattleSpriteRequest[];
  private readonly idleFrames = new Map<string, number>();
  private readonly sprites = new Map<string, Phaser.GameObjects.Sprite>();
  private readonly figures: Map<string, UnitSprite>;
  private readonly timeScale: number;

  /**
   * @param Phaser - Phaser module namespace
   * @param scene - Battle scene that owns the loader and animations
   * @param party - Party units, whose sprites are loaded
   * @param pace - Battle speed multiplier on durations
   */
  public constructor(
    private readonly Phaser: PhaserRuntime,
    private readonly scene: Phaser.Scene,
    party: readonly PartyUnit[],
    pace: number,
  ) {
    this.requests = listBattleSpriteRequests(party);
    this.figures = new Map(
      party.flatMap((unit) => (unit.sprite ? [[unit.id, unit.sprite]] : [])),
    );
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
   * Remembers each figure's idle frame, then forgets the figures. Call
   * before the scene destroys its unit views.
   */
  public clear(): void {
    for (const [unitId, sprite] of this.sprites) {
      const figure = this.figures.get(unitId);
      const idleKey = figure && spriteAnimationKey(figure.id, "idle");
      if (sprite.anims.currentAnim?.key === idleKey) {
        this.idleFrames.set(unitId, sprite.anims.currentFrame?.index ?? 1);
      }
    }
    this.sprites.clear();
  }

  /**
   * Draws a unit's figure standing on its slot's floor, with a ground ring
   * in its owner color. A fallen unit is held on its flinch.
   * @param view - Unit container, centered on the slot
   * @param unit - Party unit
   * @param slot - Unit's portrait box
   * @param accent - Owner color
   * @param alive - Whether the unit still stands
   * @returns Whether a figure was drawn. When false, draw the portrait.
   */
  public draw(
    view: Phaser.GameObjects.Container,
    unit: PartyUnit,
    slot: UnitSlot,
    accent: number,
    alive: boolean,
  ): boolean {
    const figure = this.figures.get(unit.id);
    const idleTexture = figure && spriteTextureKey(figure.id, "idle");
    if (!figure || !idleTexture || !this.scene.textures.exists(idleTexture)) {
      return false;
    }
    const floor = slot.height / 2;
    const ring = this.scene.add.graphics();
    ring.fillStyle(accent, 0.22);
    ring.fillEllipse(0, floor - 2, slot.width * 0.82, 20);
    ring.lineStyle(2, accent, 0.75);
    ring.strokeEllipse(0, floor - 2, slot.width * 0.82, 20);
    view.add(ring);

    const sprite = this.scene.add.sprite(0, floor, idleTexture, 0);
    sprite.setOrigin(0.5, 1);
    sprite.setScale(spriteDisplayScale(figure, slot));
    sprite.setFlipX(figure.facing === "left");
    sprite.anims.timeScale = this.timeScale;
    view.add(sprite);
    this.sprites.set(unit.id, sprite);

    if (!alive) {
      this.holdFallen(sprite, figure);
      return true;
    }
    this.playIdle(unit.id, sprite, figure);
    return true;
  }

  /**
   * Plays the moves a combat event calls for, then returns each figure to
   * its idle loop. A move already playing is not restarted, so an attack
   * that hits several enemies swings once.
   * @param event - One combat event
   */
  public play(event: CombatEvent): void {
    for (const cue of spriteCuesForEvent(event)) {
      const sprite = this.sprites.get(cue.unitId);
      const figure = this.figures.get(cue.unitId);
      if (!sprite || !figure) {
        continue;
      }
      const key = spriteAnimationKey(figure.id, cue.move);
      const alreadyPlaying =
        sprite.anims.isPlaying && sprite.anims.currentAnim?.key === key;
      if (alreadyPlaying || !this.scene.anims.exists(key)) {
        continue;
      }
      sprite.play(key);
      sprite.chain(spriteAnimationKey(figure.id, "idle"));
      this.idleFrames.delete(cue.unitId);
    }
  }

  /**
   * Washes a figure in one color for a moment, following its outline.
   * @param unitId - Party unit id
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
      }
    });
    return true;
  }

  /**
   * @param unitId - Party unit id
   * @param sprite - Its freshly drawn sprite
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
    // Frame indexes are 1-based; a new unit starts at a frame from its id so
    // the party does not breathe in lockstep.
    const resumeAt =
      this.idleFrames.get(unitId) ??
      (Math.abs(hashSeed(unitId)) % frameCount) + 1;
    sprite.play({ key, startFrame: resumeAt - 1 });
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
