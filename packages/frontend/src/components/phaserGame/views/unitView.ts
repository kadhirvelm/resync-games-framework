import type Phaser from "phaser";
import type {
  CombatUnit,
  EnemyUnit,
  PartyUnit,
} from "../../tower/logic/combat";
import { enemyIntent, isAlive } from "../../tower/logic/combat";
import { describeTarget } from "../../tower/logic/enemyMoves";
import type { EnemyMove } from "../../tower/logic/towerTypes";
import { unitImageKey } from "../battleAssetRequests";
import type { UnitSlot } from "../battleLayout";
import { layoutHealthBar } from "../battleLayout";
import { type BattlePainter, cssColor, PALETTE } from "../battlePaint";
import type { BattleSide, BattleSpriteDirector } from "../battleSprites";
import { hashSeed, leafOutline } from "../leafShape";

type PhaserRuntime = typeof import("phaser");

/** Shared services every battle view is built with. */
export interface ViewKit {
  Phaser: PhaserRuntime;
  painter: BattlePainter;
  reducedMotion: boolean;
  scene: Phaser.Scene;
  sprites: BattleSpriteDirector;
  /** Scales a duration by the player's battle speed */
  wait: (ms: number) => number;
}

/** How strongly a unit is marked while a card is being aimed. */
export type AimMark = "none" | "candidate" | "locked";

/** Extra facts a unit shows that are not stored on the unit itself. */
export interface UnitCues {
  /** Enemy: its place in the right-to-left action order, from 1 */
  actsAt?: number;
  /** Party: damage it takes if the turn ends now, before block */
  incoming?: number;
}

/** A rectangle in canvas coordinates. */
export interface Bounds {
  bottom: number;
  left: number;
  right: number;
  top: number;
}

/** Reticle corner length, in pixels. */
const RETICLE_CORNER = 18;

/** How long the health trail waits before draining after a hit. */
const TRAIL_DELAY_MS = 320;

/**
 * One fighter on the field. The view lives for the whole battle and is
 * updated in place, so every change can animate: health drains, block
 * pops in, intents swap, and the figure dashes, flinches, and falls.
 * The container's origin is the unit's feet on the ground line.
 */
export class UnitView {
  public readonly container: Phaser.GameObjects.Container;
  private readonly bar: Phaser.GameObjects.Graphics;
  private readonly barLabel: Phaser.GameObjects.Text;
  private readonly blockBadge: Phaser.GameObjects.Container;
  private readonly blockLabel: Phaser.GameObjects.Text;
  private readonly figure: Phaser.GameObjects.Container;
  private readonly intent: Phaser.GameObjects.Container;
  private readonly incomingLabel: Phaser.GameObjects.Text;
  private readonly portrait?: Phaser.GameObjects.Image;
  private readonly reticle: Phaser.GameObjects.Graphics;
  private readonly hasSprite: boolean;
  private readonly unitId: string;
  private shownBlock: number;
  private shownHitPoints: number;
  private trailHitPoints: number;
  private maxHitPoints: number;
  private alive: boolean;
  private aim: AimMark = "none";
  private trailTween?: Phaser.Tweens.Tween;

  /**
   * @param kit - Scene services
   * @param unit - Party member or enemy, as it stands now
   * @param side - Side of the field it fights on
   * @param slot - Figure box
   * @param accent - Owner color for the health bar
   * @param cues - Incoming damage or action order to show
   */
  public constructor(
    private readonly kit: ViewKit,
    unit: PartyUnit | EnemyUnit,
    private readonly side: BattleSide,
    private readonly slot: UnitSlot,
    private readonly accent: number,
    cues: UnitCues,
  ) {
    const { scene, painter } = kit;
    this.unitId = unit.id;
    this.alive = isAlive(unit);
    this.shownHitPoints = unit.hitPoints;
    this.trailHitPoints = unit.hitPoints;
    this.shownBlock = unit.block;
    this.maxHitPoints = unit.maxHitPoints;

    this.container = scene.add.container(slot.x, slot.y + slot.height / 2);
    const shadow = scene.add.graphics();
    painter.contactShadow(shadow, 0, 0, slot.width * 0.95);
    this.reticle = scene.add.graphics();
    this.figure = scene.add.container(0, 0);
    const sprite = kit.sprites.createFigure(unit.id, slot, this.alive);
    this.hasSprite = sprite !== undefined;
    if (sprite) {
      this.figure.add(sprite);
    } else {
      this.portrait = this.drawPortrait(unit);
    }

    const bar = layoutHealthBar({ ...slot, x: 0, y: -slot.height / 2 }, 0, 1);
    this.bar = scene.add.graphics();
    this.barLabel = painter.text(0, bar.y, "", {
      color: "#ffffff",
      fontSize: 11,
      stroke: true,
    });
    this.blockBadge = scene.add.container(-bar.width / 2 - 4, bar.y);
    const badge = scene.add.graphics();
    badge.fillStyle(PALETTE.steel, 1);
    badge.fillPoints(painter.vectors(shieldOutline(0, 0, 14)), true);
    badge.lineStyle(1.5, 0xffffff, 0.8);
    badge.strokePoints(painter.vectors(shieldOutline(0, 0, 14)), true);
    this.blockLabel = painter.text(0, -1, "", {
      color: "#ffffff",
      fontSize: 13,
      stroke: true,
    });
    this.blockBadge.add([badge, this.blockLabel]);

    this.intent = scene.add.container(0, -slot.height - 34);
    this.incomingLabel = painter.text(0, -slot.height - 18, "", {
      color: PALETTE.damageText,
      fontSize: 15,
      stroke: true,
    });

    this.container.add([
      shadow,
      this.reticle,
      this.figure,
      this.bar,
      this.barLabel,
      this.blockBadge,
      this.intent,
      this.incomingLabel,
    ]);
    if (side === "party") {
      this.drawPartyMarks(unit as PartyUnit);
    }
    if (side === "enemy" && (unit as EnemyUnit).isBoss) {
      this.container.add(
        painter.text(0, -slot.height - 70, "Tower Heart", {
          color: cssColor(PALETTE.gold),
          fontSize: 15,
          stroke: true,
        }),
      );
    }
    this.redrawBar();
    this.redrawBlock(false);
    this.sync(unit, cues);
    if (!this.alive) {
      this.container.setAlpha(side === "enemy" ? 0 : 0.35);
    }
    this.startBreathing();
  }

  /**
   * @returns Feet position on the field
   */
  public get feet(): { x: number; y: number } {
    return { x: this.slot.x, y: this.slot.y + this.slot.height / 2 };
  }

  /**
   * @returns Middle of the figure, where hits land
   */
  public get chest(): { x: number; y: number } {
    return { x: this.slot.x, y: this.slot.y };
  }

  /**
   * @returns Area that counts as pointing at this unit
   */
  public get bounds(): Bounds {
    return {
      bottom: this.slot.y + this.slot.height / 2 + 30,
      left: this.slot.x - this.slot.width / 2,
      right: this.slot.x + this.slot.width / 2,
      top: this.slot.y - this.slot.height / 2,
    };
  }

  /**
   * @returns Whether the unit still stands, as last shown
   */
  public get standing(): boolean {
    return this.alive;
  }

  /**
   * Snaps the view to the unit's true state: health, block, intent, and
   * the incoming-damage warning.
   * @param unit - Party member or enemy
   * @param cues - Incoming damage or action order to show
   */
  public sync(unit: CombatUnit, cues: UnitCues): void {
    this.maxHitPoints = unit.maxHitPoints;
    if (this.shownHitPoints !== unit.hitPoints) {
      this.shownHitPoints = unit.hitPoints;
      this.trailHitPoints = Math.max(this.trailHitPoints, unit.hitPoints);
      this.drainTrail();
    }
    const blockChanged = this.shownBlock !== unit.block;
    this.shownBlock = unit.block;
    this.redrawBar();
    this.redrawBlock(blockChanged && unit.block > 0);
    if (this.side === "enemy") {
      this.drawIntent(unit as EnemyUnit, cues.actsAt);
    }
    this.drawIncoming(cues.incoming ?? 0);
  }

  /**
   * Shows a blow landing: block soaks first, health drains with a trail,
   * and the figure recoils away from the attacker.
   * @param dealt - Health lost
   * @param blocked - Block spent
   * @param fromX - Attacker's x, so the recoil points away from it
   */
  public takeHit(dealt: number, blocked: number, fromX: number): void {
    this.shownBlock = Math.max(0, this.shownBlock - blocked);
    this.shownHitPoints = Math.max(0, this.shownHitPoints - dealt);
    this.redrawBar();
    this.redrawBlock(false);
    this.drainTrail();
    if (this.kit.reducedMotion) {
      return;
    }
    const away = Math.sign(this.slot.x - fromX) || 1;
    const recoil = dealt > 0 ? 16 : 7;
    this.kit.scene.tweens.add({
      duration: this.kit.wait(70),
      ease: "Quad.easeOut",
      hold: this.kit.wait(40),
      onComplete: () => this.figure.setX(0),
      targets: this.figure,
      x: away * recoil,
      yoyo: true,
    });
    if (dealt > 0) {
      this.flash(PALETTE.ember);
    } else {
      this.flash(PALETTE.steel);
    }
  }

  /**
   * @param amount - Block gained
   */
  public gainBlock(amount: number): void {
    this.shownBlock += amount;
    this.redrawBar();
    this.redrawBlock(true);
  }

  /**
   * Dashes the figure toward a target and back, timed so the blow lands
   * at the far end.
   * @param targetX - Target's x
   * @param impactMs - Time from start to the blow
   */
  public dash(targetX: number, impactMs: number): void {
    if (this.kit.reducedMotion || !this.alive) {
      return;
    }
    const gap = targetX - this.slot.x;
    const reach = Math.sign(gap) * Math.min(Math.abs(gap) * 0.32, 150);
    this.kit.scene.tweens.chain({
      targets: this.figure,
      tweens: [
        {
          duration: impactMs * 0.35,
          ease: "Quad.easeOut",
          x: -reach * 0.12,
        },
        {
          duration: impactMs * 0.65,
          ease: "Cubic.easeIn",
          x: reach,
        },
        {
          delay: this.kit.wait(90),
          duration: this.kit.wait(260),
          ease: "Quad.easeOut",
          x: 0,
        },
      ],
    });
  }

  /**
   * Steps an enemy forward as it announces its move, or raises its guard.
   * @param move - The move it makes
   */
  public announce(move: EnemyMove): void {
    this.intent.setVisible(false);
    if (move.kind === "defend") {
      this.kit.sprites.playMove(this.unitId, "defend");
    }
    if (this.kit.reducedMotion || this.hasSprite) {
      return;
    }
    this.kit.scene.tweens.add({
      duration: this.kit.wait(120),
      ease: "Quad.easeOut",
      scaleX: 1.06,
      scaleY: 1.06,
      targets: this.figure,
      yoyo: true,
    });
  }

  /**
   * Fells the unit: an enemy sinks and fades away, a party member stays as
   * a faded ghost.
   */
  public fall(): void {
    this.alive = false;
    this.kit.sprites.fall(this.unitId);
    this.intent.setVisible(false);
    this.incomingLabel.setVisible(false);
    this.setAim("none");
    this.kit.scene.tweens.killTweensOf(this.figure);
    this.kit.scene.tweens.add({
      alpha: this.side === "enemy" ? 0 : 0.35,
      delay: this.kit.wait(160),
      duration: this.kit.wait(520),
      ease: "Quad.easeIn",
      targets: this.container,
    });
    if (this.kit.reducedMotion) {
      return;
    }
    this.kit.scene.tweens.add({
      delay: this.kit.wait(160),
      duration: this.kit.wait(520),
      ease: "Quad.easeIn",
      targets: this.figure,
      y: this.side === "enemy" ? 24 : 6,
    });
  }

  /**
   * Marks the unit while a card is aimed: faint corners on every legal
   * target, bright pulsing corners on the one under the arrow.
   * @param mark - How strongly to mark it
   */
  public setAim(mark: AimMark): void {
    if (mark === this.aim) {
      return;
    }
    this.aim = mark;
    this.kit.scene.tweens.killTweensOf(this.reticle);
    this.reticle.clear();
    this.reticle.setScale(1);
    this.reticle.setAlpha(1);
    if (mark === "none") {
      return;
    }
    const color = this.side === "enemy" ? PALETTE.ember : PALETTE.jade;
    const strong = mark === "locked";
    const pad = strong ? 6 : 12;
    const halfWidth = this.slot.width / 2 + pad;
    const top = -this.slot.height - pad;
    const bottom = pad;
    this.reticle.lineStyle(
      strong ? 5 : 3,
      strong ? color : PALETTE.paperLight,
      strong ? 1 : 0.85,
    );
    for (const [x, y, dx, dy] of [
      [-halfWidth, top, 1, 1],
      [halfWidth, top, -1, 1],
      [-halfWidth, bottom, 1, -1],
      [halfWidth, bottom, -1, -1],
    ] as const) {
      this.reticle.lineBetween(x, y, x + dx * RETICLE_CORNER, y);
      this.reticle.lineBetween(x, y, x, y + dy * RETICLE_CORNER);
    }
    if (!strong || this.kit.reducedMotion) {
      return;
    }
    this.kit.scene.tweens.add({
      alpha: 0.55,
      duration: 380,
      repeat: -1,
      targets: this.reticle,
      yoyo: true,
    });
  }

  /**
   * Removes the view and forgets its sprite.
   */
  public destroy(): void {
    this.kit.sprites.release(this.unitId);
    this.kit.scene.tweens.killTweensOf([
      this.container,
      this.figure,
      this.reticle,
      this.intent,
      this.blockBadge,
    ]);
    this.trailTween?.stop();
    this.container.destroy();
  }

  /**
   * Draws the portrait in place of a figure. Generated portraits are painted
   * on white, so multiplying them onto the room lets the white fall away.
   * A unit without art gets a painted wash and its initial.
   * @param unit - Party member or enemy
   * @returns The portrait image, when there is art
   */
  private drawPortrait(unit: CombatUnit): Phaser.GameObjects.Image | undefined {
    const { painter, scene, Phaser: runtime } = this.kit;
    const key = unitImageKey(unit.id);
    if (scene.textures.exists(key)) {
      const image = painter.containedImage(
        key,
        0,
        -this.slot.height / 2,
        this.slot.width * 1.1,
        this.slot.height,
      );
      image.setBlendMode(runtime.BlendModes.MULTIPLY);
      this.figure.add(image);
      return image;
    }
    const wash = scene.add.graphics();
    painter.wash(
      wash,
      0,
      -this.slot.height / 2,
      this.slot.width * 0.5,
      this.accent,
      hashSeed(unit.id),
      0.9,
    );
    painter.leaf(
      wash,
      this.slot.width * 0.2,
      -this.slot.height * 0.72,
      this.slot.width * 0.32,
      -0.7,
      this.accent,
      0.5,
    );
    this.figure.add(wash);
    this.figure.add(
      painter.text(
        0,
        -this.slot.height / 2,
        unit.name.charAt(0).toUpperCase(),
        {
          color: cssColor(this.accent),
          fontSize: Math.round(this.slot.height * 0.36),
        },
      ),
    );
    return undefined;
  }

  /**
   * Party order tag and tier leaves.
   * @param unit - Party member
   */
  private drawPartyMarks(unit: PartyUnit): void {
    const { painter, scene } = this.kit;
    const order = this.slot.index === 0 ? "Front" : `#${this.slot.index + 1}`;
    const bar = layoutHealthBar(
      { ...this.slot, x: 0, y: -this.slot.height / 2 },
      0,
      1,
    );
    this.container.add(
      painter.text(
        0,
        bar.y + 18,
        unit.isCultivator ? `${order} · You` : order,
        {
          color: PALETTE.ink,
          fontSize: 12,
          stroke: true,
        },
      ),
    );
    if (unit.isCultivator) {
      return;
    }
    const leaves = scene.add.graphics();
    const right = bar.width / 2;
    for (let index = 0; index < 4; index += 1) {
      const filled = index < unit.tier;
      const points = leafOutline(
        right - (3 - index) * 11,
        bar.y + 18,
        12,
        6,
        -Math.PI / 2 - 0.3,
      );
      leaves.fillStyle(
        filled ? PALETTE.jade : PALETTE.paperLight,
        filled ? 0.95 : 0.8,
      );
      leaves.fillPoints(painter.vectors(points), true);
      leaves.lineStyle(1, PALETTE.jadeDark, 0.8);
      leaves.strokePoints(painter.vectors(points), true);
    }
    this.container.add(leaves);
  }

  /**
   * Redraws the health bar from the shown values, with the trail of
   * recently lost health behind the fill.
   */
  private redrawBar(): void {
    const geometry = layoutHealthBar(
      { ...this.slot, x: 0, y: -this.slot.height / 2 },
      this.shownHitPoints,
      this.maxHitPoints,
    );
    const left = -geometry.width / 2;
    const top = geometry.y - geometry.height / 2;
    const max = Math.max(1, this.maxHitPoints);
    const trailRatio = Math.min(1, Math.max(0, this.trailHitPoints / max));
    const blocking = this.shownBlock > 0;
    const fill = this.side === "enemy" ? PALETTE.ember : this.accent;
    this.bar.clear();
    this.bar.fillStyle(0x000000, 0.45);
    this.bar.fillRoundedRect(
      left - 1,
      top - 1,
      geometry.width + 2,
      geometry.height + 2,
      7,
    );
    if (trailRatio > geometry.fillRatio) {
      this.bar.fillStyle(PALETTE.paperLight, 0.9);
      this.bar.fillRoundedRect(
        left,
        top,
        Math.max(8, geometry.width * trailRatio),
        geometry.height,
        6,
      );
    }
    if (geometry.fillRatio > 0) {
      this.bar.fillStyle(blocking ? PALETTE.steel : fill, 1);
      this.bar.fillRoundedRect(
        left,
        top,
        Math.max(8, geometry.width * geometry.fillRatio),
        geometry.height,
        6,
      );
    }
    this.bar.lineStyle(1.5, blocking ? 0xbfe0f2 : PALETTE.stoneDark, 0.95);
    this.bar.strokeRoundedRect(left, top, geometry.width, geometry.height, 6);
    this.barLabel.setText(this.alive ? geometry.label : "Fallen");
  }

  /**
   * Lets the pale trail catch up with the health bar after a short pause.
   */
  private drainTrail(): void {
    this.trailTween?.stop();
    if (this.trailHitPoints <= this.shownHitPoints) {
      this.trailHitPoints = this.shownHitPoints;
      this.redrawBar();
      return;
    }
    const counter = { value: this.trailHitPoints };
    this.trailTween = this.kit.scene.tweens.add({
      delay: this.kit.wait(TRAIL_DELAY_MS),
      duration: this.kit.wait(420),
      ease: "Quad.easeIn",
      onUpdate: () => {
        this.trailHitPoints = counter.value;
        this.redrawBar();
      },
      targets: counter,
      value: this.shownHitPoints,
    });
  }

  /**
   * @param pop - Whether to bounce the badge, for block just gained
   */
  private redrawBlock(pop: boolean): void {
    this.blockBadge.setVisible(this.shownBlock > 0);
    this.blockLabel.setText(String(this.shownBlock));
    if (!pop || this.kit.reducedMotion || this.shownBlock <= 0) {
      return;
    }
    this.kit.scene.tweens.killTweensOf(this.blockBadge);
    this.blockBadge.setScale(1.7);
    this.kit.scene.tweens.add({
      duration: this.kit.wait(260),
      ease: "Back.easeOut",
      scale: 1,
      targets: this.blockBadge,
    });
  }

  /**
   * Draws an enemy's telegraphed move as an icon and number over its head.
   * @param enemy - Enemy
   * @param actsAt - Its place in the action order
   */
  private drawIntent(enemy: EnemyUnit, actsAt: number | undefined): void {
    const { painter, scene } = this.kit;
    this.intent.removeAll(true);
    const move = enemyIntent(enemy);
    if (!isAlive(enemy) || !move) {
      this.intent.setVisible(false);
      return;
    }
    this.intent.setVisible(true);
    const icon = scene.add.graphics();
    if (move.kind === "attack") {
      drawSword(icon);
    } else {
      icon.fillStyle(PALETTE.steel, 1);
      icon.fillPoints(painter.vectors(shieldOutline(-12, 0, 16)), true);
      icon.lineStyle(2, PALETTE.paperLight, 0.9);
      icon.strokePoints(painter.vectors(shieldOutline(-12, 0, 16)), true);
    }
    const amount = painter.text(14, 0, String(move.amount), {
      color: move.kind === "attack" ? PALETTE.damageText : PALETTE.blockText,
      fontSize: 24,
      stroke: true,
    });
    const detail =
      move.kind === "attack" ? describeTarget(move.target) : "guard";
    const order = actsAt === undefined ? "" : ` · ${ordinal(actsAt)}`;
    const caption = painter.text(0, 22, `${detail}${order}`, {
      color: PALETTE.ink,
      fontSize: 11,
      stroke: true,
    });
    this.intent.add([icon, amount, caption]);
    this.intent.setScale(0.6);
    scene.tweens.add({
      duration: this.kit.wait(220),
      ease: "Back.easeOut",
      scale: 1,
      targets: this.intent,
    });
  }

  /**
   * Warns a party member how much damage the enemies' intents will deal it.
   * @param incoming - Telegraphed damage before block
   */
  private drawIncoming(incoming: number): void {
    if (this.side !== "party" || !this.alive || incoming <= 0) {
      this.incomingLabel.setVisible(false);
      return;
    }
    const covered = this.shownBlock >= incoming;
    const through = Math.max(0, incoming - this.shownBlock);
    this.incomingLabel.setVisible(true);
    this.incomingLabel.setText(
      covered ? `⛨ ${incoming} blocked` : `⚔ −${through}`,
    );
    this.incomingLabel.setColor(
      covered ? PALETTE.blockText : PALETTE.damageText,
    );
  }

  /**
   * Washes the figure in one color for a moment.
   * @param color - Flash color
   */
  private flash(color: number): void {
    if (this.kit.sprites.flash(this.unitId, color, this.kit.wait(130))) {
      return;
    }
    if (this.portrait) {
      const { TintModes } = this.kit.Phaser;
      this.portrait.setTint(color).setTintMode(TintModes.FILL);
      this.kit.scene.time.delayedCall(this.kit.wait(130), () => {
        if (this.portrait?.active) {
          this.portrait.clearTint();
          this.portrait.setTintMode(TintModes.MULTIPLY);
        }
      });
      return;
    }
    this.figure.setAlpha(0.4);
    this.kit.scene.time.delayedCall(this.kit.wait(110), () => {
      this.figure.setAlpha(1);
    });
  }

  /**
   * A portrait or stand-in has no idle animation, so it breathes with a
   * slow squash instead. A sprite already breathes on its own.
   */
  private startBreathing(): void {
    if (this.kit.reducedMotion || this.hasSprite || !this.alive) {
      return;
    }
    const seed = Math.abs(hashSeed(this.slot.x.toFixed(0)));
    this.kit.scene.tweens.add({
      delay: seed % 600,
      duration: 1600 + (seed % 500),
      ease: "Sine.easeInOut",
      repeat: -1,
      scaleY: 1.025,
      targets: this.figure,
      yoyo: true,
    });
    this.kit.scene.tweens.add({
      duration: 1100,
      ease: "Sine.easeInOut",
      repeat: -1,
      targets: this.intent,
      y: this.intent.y - 4,
      yoyo: true,
    });
  }
}

/**
 * @param x - Center x
 * @param y - Center y
 * @param size - Shield height
 * @returns Outline of a heater shield
 */
function shieldOutline(
  x: number,
  y: number,
  size: number,
): { x: number; y: number }[] {
  const half = size / 2;
  return [
    { x: x - half, y: y - half },
    { x: x + half, y: y - half },
    { x: x + half * 0.85, y: y + half * 0.35 },
    { x, y: y + half * 1.05 },
    { x: x - half * 0.85, y: y + half * 0.35 },
  ];
}

/**
 * Draws a small sword icon, blade up and to the right, centered left of the origin.
 * @param graphics - Target graphics
 */
function drawSword(graphics: Phaser.GameObjects.Graphics): void {
  graphics.lineStyle(7, PALETTE.inkNumber, 1);
  graphics.lineBetween(-22, 9, -4, -9);
  graphics.lineStyle(4, 0xf2ede0, 1);
  graphics.lineBetween(-21, 8, -4, -9);
  graphics.lineStyle(4, PALETTE.ember, 1);
  graphics.lineBetween(-24, 1, -16, 9);
  graphics.lineStyle(4, PALETTE.inkNumber, 1);
  graphics.lineBetween(-21, 8, -26, 13);
}

/**
 * @param position - 1-based position
 * @returns "1st", "2nd", "3rd", ...
 */
function ordinal(position: number): string {
  if (position === 1) {
    return "1st";
  }
  if (position === 2) {
    return "2nd";
  }
  if (position === 3) {
    return "3rd";
  }
  return `${position}th`;
}
