import type Phaser from "phaser";
import { cardTargeting, describeEffect } from "../tower/logic/cardRules";
import {
  automaticTarget,
  type CombatCard,
  type CombatEvent,
  type CombatState,
  type CombatStep,
  type CombatUnit,
  canAfford,
  createCombat,
  type EnemyUnit,
  endTurn,
  enemyIntent,
  incomingDamage,
  isAlive,
  livingEnemies,
  type PartyUnit,
  playCard,
} from "../tower/logic/combat";
import { describeTarget } from "../tower/logic/enemyMoves";
import {
  CULTIVATOR_GLYPH,
  ownerColor as ownerColorAt,
  partyAccentIndex,
} from "../tower/ownerColors";
import {
  BACKDROP_IMAGE_KEY,
  type BattleSceneInput,
  cardImageKey,
  listBattleAssetRequests,
  unitImageKey,
} from "./battleAssetRequests";
import {
  type BattleLayout,
  type CardSlot,
  layoutBattle,
  layoutCardPanels,
  layoutHealthBar,
  type UnitSlot,
} from "./battleLayout";
import { approach, CARD_HOVER_SETTLE_MS, cardHoverMotion } from "./cardHover";
import { containedScale } from "./containedScale";
import { hashSeed, leafOutline, type PaintPoint, washBlots } from "./leafShape";

const PAPER = 0xf3efe4;
const PAPER_LIGHT = 0xfffdf6;
const JADE = 0x4e8f6a;
const JADE_DARK = 0x2f5e45;
const SAGE = 0x9db89a;
const STONE = 0x8a8f8c;
const STONE_DARK = 0x5d625f;
const EMBER = 0xb5543f;
const DEW = 0x3f9e95;
const STEEL = 0x557a90;
const GOLD = 0xc49a3a;
const INK = "#24332b";
const INK_SOFT = "#4b5a52";
const DAMAGE_TEXT = "#b5432f";
const BLOCK_TEXT = "#3f6f8c";
const AETHER_TEXT = "#2f8a80";
const HEADING_FONT = "Georgia, 'Times New Roman', serif";
const HOVER_DEPTH = 100;
const SELECTED_LIFT_SHARE = 0.35;
const HINT_TEXT = "#7a5810";
const STEP_DELAY_MS = 720;
const FINISH_DELAY_MS = 1700;

type PhaserRuntime = typeof import("phaser");

type HandCard = {
  cardId: string;
  container: Phaser.GameObjects.Container;
  height: number;
  hit: Phaser.Geom.Rectangle;
  hoverScale: number;
  hoverY: number;
  index: number;
  lift: number;
  restY: number;
  targetScale: number;
  targetY: number;
  width: number;
};

/**
 * @returns Text resolution matched to the screen, capped for performance
 */
function textResolution(): number {
  if (typeof window === "undefined") {
    return 1;
  }
  return Math.min(2, window.devicePixelRatio || 1);
}

/**
 * @param color - Phaser color number
 * @returns CSS hex color
 */
function cssColor(color: number): string {
  return `#${color.toString(16).padStart(6, "0")}`;
}

/**
 * Builds the battle scene class for one fight.
 * The scene owns the combat state while the fight lasts and reports the
 * result through `input.onFinish`.
 * @param Phaser - Phaser module namespace
 * @param input - Party, enemies, deck, and room for this fight
 * @returns Scene class Phaser can instantiate
 */
export function createBattleSceneClass(
  Phaser: PhaserRuntime,
  input: BattleSceneInput,
): new () => Phaser.Scene {
  const ownerColor = new Map(
    input.setup.party.map((unit, index) => [
      unit.id,
      ownerColorAt(partyAccentIndex(input.setup.party, index)),
    ]),
  );
  const ownerName = new Map(
    input.setup.party.map((unit) => [unit.id, unit.name]),
  );

  /**
   * @param points - Outline in canvas pixels
   * @returns The same points as Phaser vectors, for polygon fills
   */
  const vectors = (points: PaintPoint[]): Phaser.Math.Vector2[] =>
    points.map((point) => new Phaser.Math.Vector2(point.x, point.y));

  return class BattleScene extends Phaser.Scene {
    private busy = false;
    private combat!: CombatState;
    private field!: Phaser.GameObjects.Graphics;
    private finished = false;
    private floaters!: Phaser.GameObjects.Container;
    private hand: HandCard[] = [];
    private hud!: Phaser.GameObjects.Container;
    private layout!: BattleLayout;
    private notice?: Phaser.GameObjects.Text;
    private selectedCardId?: string;
    private tooltip?: Phaser.GameObjects.Container;
    private unitViews = new Map<string, Phaser.GameObjects.Container>();
    private units!: Phaser.GameObjects.Container;

    public constructor() {
      super({ key: "BattleScene" });
    }

    /**
     * Queues the backdrop, portraits, and card art for this fight.
     */
    public preload(): void {
      this.load.setCORS("anonymous");
      this.load.on("loaderror", this.onAssetLoadError);
      for (const asset of listBattleAssetRequests(input)) {
        this.load.image(asset.key, asset.url);
      }
    }

    /**
     * Opens the first turn and wires input and resizing.
     */
    public create(): void {
      const opening = createCombat(input.setup);
      this.combat = opening.state;
      this.field = this.add.graphics();
      this.units = this.add.container(0, 0);
      this.hud = this.add.container(0, 0);
      this.floaters = this.add.container(0, 0).setDepth(300);
      this.scale.on("resize", this.draw, this);
      this.input.on("pointerdown", this.onScenePointerDown, this);
      this.input.keyboard?.on("keydown", this.onKeyDown, this);
      this.events.once("shutdown", () => {
        this.load.off("loaderror", this.onAssetLoadError);
        this.scale.off("resize", this.draw, this);
      });
      this.draw();
      this.showBanner(input.room.isBoss ? "The Tower Heart awakens" : "Turn 1");
    }

    /**
     * Eases each hand card toward its rest, hovered, or selected pose.
     * @param _time - Scene time in milliseconds
     * @param delta - Frame time in milliseconds
     */
    public update(_time: number, delta: number): void {
      for (const card of this.hand) {
        const y = approach(
          card.container.y,
          card.targetY,
          delta,
          CARD_HOVER_SETTLE_MS,
        );
        const scale = approach(
          card.container.scaleX,
          card.targetScale,
          delta,
          CARD_HOVER_SETTLE_MS,
          0.002,
        );
        card.container.setPosition(card.container.x, y);
        card.container.setScale(scale);
        if (card.targetY === card.restY && y === card.restY) {
          card.container.setDepth(card.index);
        }
      }
    }

    /**
     * Logs an asset URL Phaser could not fetch. The slot keeps its stand-in.
     * @param file - Loader file that failed
     */
    private readonly onAssetLoadError = (file: {
      key: string;
      url: string;
    }): void => {
      // biome-ignore lint/suspicious/noConsole: a missing generated asset should be visible in devtools
      console.warn(`Could not load battle asset ${file.key} from ${file.url}`);
    };

    /**
     * Repaints the whole battle for the current state and canvas size.
     */
    private readonly draw = (): void => {
      this.layout = layoutBattle(this.scale.width, this.scale.height, {
        enemies: this.combat.enemies.length,
        hand: this.combat.hand.length,
        party: this.combat.party.length,
      });
      for (const view of this.unitViews.values()) {
        this.tweens.killTweensOf(view);
      }
      this.unitViews.clear();
      this.field.clear();
      this.units.removeAll(true);
      this.hud.removeAll(true);
      this.hideTooltip();
      this.clearHand();

      this.paintBackdrop();
      const incoming = incomingDamage(this.combat);
      this.combat.party.forEach((unit, index) => {
        const slot = this.layout.party[index];
        if (slot) {
          this.drawPartyUnit(unit, slot, incoming.get(unit.id) ?? 0);
        }
      });
      this.combat.enemies.forEach((enemy, index) => {
        const slot = this.layout.enemies[index];
        if (slot) {
          this.drawEnemy(enemy, slot);
        }
      });
      for (const slot of this.layout.cards) {
        this.hand.push(this.createHandCard(slot));
      }
      this.drawHud();
    };

    /**
     * Fills the room: generated backdrop when loaded, otherwise a painted wash.
     */
    private paintBackdrop(): void {
      const { width, height } = this.scale;
      this.field.fillStyle(PAPER, 1);
      this.field.fillRect(0, 0, width, height);
      if (this.textures.exists(BACKDROP_IMAGE_KEY)) {
        const image = this.add.image(width / 2, height / 2, BACKDROP_IMAGE_KEY);
        image.setScale(Math.max(width / image.width, height / image.height));
        image.setAlpha(0.92);
        this.units.add(image);
        this.units.sendToBack(image);
      } else {
        this.paintWash(
          width * 0.22,
          height * 0.3,
          width * 0.26,
          SAGE,
          11,
          this.field,
          0.55,
        );
        this.paintWash(
          width * 0.8,
          height * 0.28,
          width * 0.22,
          STONE,
          23,
          this.field,
          0.45,
        );
        this.paintWash(
          width * 0.5,
          -height * 0.05,
          width * 0.3,
          JADE,
          37,
          this.field,
          0.4,
        );
        for (let index = 0; index < 9; index += 1) {
          this.paintLeaf(
            (index / 8) * width,
            height * (0.04 + (index % 3) * 0.025),
            34 + (index % 4) * 8,
            Math.PI / 2 + (index % 2 === 0 ? 0.4 : -0.5),
            index % 2 === 0 ? JADE : SAGE,
            0.35,
          );
        }
      }
      // A paper wash over the bottom keeps the hand readable on busy art.
      const band = this.add.graphics();
      band.fillGradientStyle(PAPER, PAPER, PAPER, PAPER, 0, 0, 0.85, 0.85);
      band.fillRect(
        0,
        this.layout.groundY + 8,
        width,
        height - this.layout.groundY,
      );
      band.fillStyle(JADE_DARK, 0.12);
      band.fillEllipse(width * 0.25, this.layout.groundY, width * 0.44, 26);
      band.fillEllipse(width * 0.75, this.layout.groundY, width * 0.44, 26);
      this.units.add(band);
    }

    /**
     * @param x - Wash center x
     * @param y - Wash center y
     * @param radius - Wash radius
     * @param color - Pigment
     * @param seed - Layout seed
     * @param graphics - Target graphics. Defaults to the field layer.
     * @param strength - Multiplier on each blot's opacity
     */
    private paintWash(
      x: number,
      y: number,
      radius: number,
      color: number,
      seed: number,
      graphics: Phaser.GameObjects.Graphics = this.field,
      strength = 1,
    ): void {
      for (const blot of washBlots(x, y, radius, seed)) {
        graphics.fillStyle(color, blot.alpha * strength);
        graphics.fillCircle(blot.x, blot.y, blot.radius);
      }
    }

    /**
     * @param x - Leaf center x
     * @param y - Leaf center y
     * @param length - Stem-to-tip length
     * @param angle - Stem-to-tip direction in radians
     * @param color - Fill color
     * @param alpha - Fill opacity
     * @param graphics - Target graphics. Defaults to the field layer.
     */
    private paintLeaf(
      x: number,
      y: number,
      length: number,
      angle: number,
      color: number,
      alpha: number,
      graphics: Phaser.GameObjects.Graphics = this.field,
    ): void {
      const points = leafOutline(x, y, length, length * 0.48, angle);
      graphics.fillStyle(color, alpha);
      graphics.fillPoints(vectors(points), true);
      graphics.lineStyle(1, JADE_DARK, alpha * 0.8);
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);
      graphics.lineBetween(
        x - (cos * length) / 2,
        y - (sin * length) / 2,
        x + (cos * length) / 2.4,
        y + (sin * length) / 2.4,
      );
    }

    /**
     * Draws a portrait in a paper frame, or a painted stand-in.
     * @param view - Unit container, centered on the portrait
     * @param slot - Portrait box
     * @param unitId - Unit id, used for the texture key and wash seed
     * @param glyph - Letter painted on the stand-in when there is no art
     * @param accent - Frame color
     */
    private drawPortrait(
      view: Phaser.GameObjects.Container,
      slot: UnitSlot,
      unitId: string,
      glyph: string,
      accent: number,
    ): void {
      const frame = this.add.graphics();
      const left = -slot.width / 2;
      const top = -slot.height / 2;
      frame.fillStyle(0x000000, 0.12);
      frame.fillRoundedRect(left + 4, top + 6, slot.width, slot.height, 14);
      frame.fillStyle(PAPER_LIGHT, 0.94);
      frame.fillRoundedRect(left, top, slot.width, slot.height, 14);
      view.add(frame);
      const key = unitImageKey(unitId);
      if (this.textures.exists(key)) {
        this.addContainedImage(
          key,
          0,
          0,
          slot.width - 10,
          slot.height - 10,
          view,
        );
      } else {
        const wash = this.add.graphics();
        this.paintWash(0, 0, slot.width * 0.55, accent, hashSeed(unitId), wash);
        this.paintLeaf(
          slot.width * 0.22,
          slot.height * 0.28,
          slot.width * 0.32,
          -0.7,
          accent,
          0.5,
          wash,
        );
        view.add(wash);
        view.add(
          this.makeText(0, -slot.height * 0.04, glyph, {
            color: cssColor(accent),
            fontSize: Math.round(slot.height * 0.42),
          }),
        );
      }
      const border = this.add.graphics();
      border.lineStyle(3, accent, 0.9);
      border.strokeRoundedRect(left, top, slot.width, slot.height, 14);
      view.add(border);
    }

    /**
     * Draws one party member: portrait, order, tier, health, block, and the
     * damage it will take if the turn ends now.
     * @param unit - Party member
     * @param slot - Where it stands
     * @param incoming - Telegraphed damage before block
     */
    private drawPartyUnit(
      unit: PartyUnit,
      slot: UnitSlot,
      incoming: number,
    ): void {
      const accent = ownerColor.get(unit.id) ?? JADE;
      const view = this.createUnitView(unit, slot);
      const glyph = unit.isCultivator
        ? CULTIVATOR_GLYPH
        : unit.name.charAt(0).toUpperCase();
      this.drawPortrait(view, slot, unit.id, glyph, accent);
      this.drawUnitFooter(view, slot, unit, accent);

      const order = slot.index === 0 ? "Front" : `#${slot.index + 1}`;
      view.add(
        this.makeText(
          0,
          -slot.height / 2 - 14,
          unit.isCultivator ? `${order} · You` : order,
          {
            color: INK,
            fontSize: 14,
            stroke: true,
          },
        ),
      );
      if (!unit.isCultivator) {
        this.drawTierLeaves(
          view,
          slot.width / 2 - 10,
          -slot.height / 2 + 14,
          unit.tier,
        );
      }
      if (isAlive(unit) && incoming > 0) {
        const covered = unit.block >= incoming;
        const label = covered
          ? `${incoming} incoming · blocked`
          : `${incoming} incoming${unit.block > 0 ? ` (−${unit.block})` : ""}`;
        view.add(
          this.makeText(0, -slot.height / 2 - 34, label, {
            color: covered ? BLOCK_TEXT : DAMAGE_TEXT,
            fontSize: 14,
            stroke: true,
          }),
        );
      }
      if (!isAlive(unit)) {
        view.setAlpha(0.35);
      }
    }

    /**
     * Draws one enemy with its telegraphed intent and its place in the
     * right-to-left action order.
     * @param enemy - Enemy
     * @param slot - Where it stands
     */
    private drawEnemy(enemy: EnemyUnit, slot: UnitSlot): void {
      const view = this.createUnitView(enemy, slot);
      this.drawPortrait(
        view,
        slot,
        enemy.id,
        enemy.name.charAt(0).toUpperCase(),
        enemy.isBoss ? GOLD : EMBER,
      );
      this.drawUnitFooter(view, slot, enemy, EMBER);
      if (!isAlive(enemy)) {
        view.setAlpha(0.3);
        return;
      }
      const living = livingEnemies(this.combat);
      const actsAt = living.length - living.indexOf(enemy);
      const move = enemyIntent(enemy);
      if (!move) {
        return;
      }
      const bubbleY = -slot.height / 2 - 36;
      const bubble = this.add.graphics();
      const width = Math.max(120, slot.width * 0.95);
      const color = move.kind === "attack" ? EMBER : STEEL;
      bubble.fillStyle(PAPER_LIGHT, 0.95);
      bubble.fillRoundedRect(-width / 2, bubbleY - 20, width, 42, 18);
      bubble.lineStyle(2, color, 0.9);
      bubble.strokeRoundedRect(-width / 2, bubbleY - 20, width, 42, 18);
      view.add(bubble);
      const headline =
        move.kind === "attack"
          ? `Attack ${move.amount}`
          : `Defend ${move.amount}`;
      const detail =
        move.kind === "attack"
          ? `→ ${describeTarget(move.target)}`
          : "gains block";
      view.add(
        this.makeText(0, bubbleY - 6, headline, {
          color: cssColor(color),
          fontSize: 16,
        }),
      );
      view.add(
        this.makeText(0, bubbleY + 11, `${detail} · acts ${ordinal(actsAt)}`, {
          color: INK_SOFT,
          fontSize: 12,
        }),
      );
      if (enemy.isBoss) {
        view.add(
          this.makeText(0, -slot.height / 2 - 70, "Tower Heart", {
            color: cssColor(GOLD),
            fontSize: 15,
            stroke: true,
          }),
        );
      }
    }

    /**
     * Creates the container a unit is drawn in, with hover and targeting.
     * @param unit - Party member or enemy
     * @param slot - Portrait box
     * @returns The container, already on the unit layer
     */
    private createUnitView(
      unit: CombatUnit,
      slot: UnitSlot,
    ): Phaser.GameObjects.Container {
      const view = this.add.container(slot.x, slot.y);
      this.units.add(view);
      this.unitViews.set(unit.id, view);
      const shadow = this.add.graphics();
      shadow.fillStyle(0x000000, 0.14);
      shadow.fillEllipse(0, slot.height / 2 + 2, slot.width * 0.9, 18);
      view.add(shadow);
      if (!isAlive(unit)) {
        return view;
      }
      const isTarget = this.isSelectableTarget(unit.id);
      if (isTarget) {
        const ring = this.add.graphics();
        ring.lineStyle(5, GOLD, 0.9);
        ring.strokeRoundedRect(
          -slot.width / 2 - 8,
          -slot.height / 2 - 8,
          slot.width + 16,
          slot.height + 16,
          18,
        );
        view.add(ring);
        this.tweens.add({
          alpha: 0.35,
          duration: 520,
          repeat: -1,
          targets: ring,
          yoyo: true,
        });
      }
      const hit = new Phaser.Geom.Rectangle(
        -slot.width / 2,
        -slot.height / 2,
        slot.width,
        slot.height + 50,
      );
      view.setInteractive({
        hitArea: hit,
        hitAreaCallback: Phaser.Geom.Rectangle.Contains,
        useHandCursor: isTarget,
      });
      view.on("pointerover", () => this.showTooltip(unit.id, slot));
      view.on("pointerout", () => this.hideTooltip());
      view.on(
        "pointerdown",
        (
          pointer: Phaser.Input.Pointer,
          _x: number,
          _y: number,
          event: Phaser.Types.Input.EventData,
        ) => {
          if (pointer.rightButtonDown() || !isTarget || !this.selectedCardId) {
            return;
          }
          event.stopPropagation();
          this.resolvePlay(this.selectedCardId, unit.id);
        },
      );
      return view;
    }

    /**
     * Draws a unit's name, health bar, and block badge.
     * @param view - Unit container
     * @param slot - Portrait box
     * @param unit - Party member or enemy
     * @param accent - Bar color
     */
    private drawUnitFooter(
      view: Phaser.GameObjects.Container,
      slot: UnitSlot,
      unit: CombatUnit,
      accent: number,
    ): void {
      view.add(
        this.makeText(0, slot.height / 2 + 12, unit.name, {
          color: INK,
          fontSize: 14,
          stroke: true,
          wrapWidth: Math.max(120, slot.width * 1.3),
        }),
      );
      const bar = layoutHealthBar(
        { ...slot, x: 0, y: 0 },
        unit.hitPoints,
        unit.maxHitPoints,
      );
      const graphics = this.add.graphics();
      const left = bar.x - bar.width / 2;
      const top = bar.y - bar.height / 2;
      graphics.fillStyle(STONE, 0.45);
      graphics.fillRoundedRect(left, top, bar.width, bar.height, 8);
      if (bar.fillRatio > 0) {
        graphics.fillStyle(accent, 0.95);
        graphics.fillRoundedRect(
          left,
          top,
          Math.max(10, bar.width * bar.fillRatio),
          bar.height,
          8,
        );
      }
      graphics.lineStyle(1.5, STONE_DARK, 0.9);
      graphics.strokeRoundedRect(left, top, bar.width, bar.height, 8);
      view.add(graphics);
      view.add(
        this.makeText(bar.x, bar.y, isAlive(unit) ? bar.label : "Fallen", {
          color: "#ffffff",
          fontSize: 12,
          stroke: true,
        }),
      );
      if (unit.block > 0) {
        const badgeX = left - 4;
        const badge = this.add.graphics();
        badge.fillStyle(STEEL, 1);
        badge.fillPoints(
          vectors([
            { x: badgeX - 13, y: bar.y - 12 },
            { x: badgeX + 13, y: bar.y - 12 },
            { x: badgeX + 11, y: bar.y + 4 },
            { x: badgeX, y: bar.y + 14 },
            { x: badgeX - 11, y: bar.y + 4 },
          ]),
          true,
        );
        view.add(badge);
        view.add(
          this.makeText(badgeX, bar.y - 1, String(unit.block), {
            color: "#ffffff",
            fontSize: 13,
          }),
        );
      }
    }

    /**
     * Four small leaves, filled up to the Coreborn's tier.
     * @param view - Unit container
     * @param x - Right edge of the row
     * @param y - Row center
     * @param tier - Tier from 1 through 4
     */
    private drawTierLeaves(
      view: Phaser.GameObjects.Container,
      x: number,
      y: number,
      tier: number,
    ): void {
      const graphics = this.add.graphics();
      for (let index = 0; index < 4; index += 1) {
        const filled = index < tier;
        const points = leafOutline(
          x - (3 - index) * 13,
          y,
          14,
          7,
          -Math.PI / 2 - 0.3,
        );
        graphics.fillStyle(filled ? JADE : PAPER_LIGHT, filled ? 0.95 : 0.8);
        graphics.fillPoints(vectors(points), true);
        graphics.lineStyle(1, JADE_DARK, 0.8);
        graphics.strokePoints(vectors(points), true);
      }
      view.add(graphics);
    }

    /**
     * Draws Aether, piles, the end-turn button, the room banner, and hints.
     */
    private drawHud(): void {
      const {
        aether,
        banner,
        discardPile,
        drawPile,
        endTurn: button,
      } = this.layout;
      const graphics = this.add.graphics();
      this.hud.add(graphics);

      // Aether is a dew drop held in a leaf, per the art direction.
      graphics.fillStyle(JADE, 0.9);
      graphics.fillPoints(
        vectors(
          leafOutline(
            aether.x,
            aether.y,
            aether.radius * 2.5,
            aether.radius * 1.75,
            -Math.PI / 2 + 0.5,
          ),
        ),
        true,
      );
      graphics.fillStyle(DEW, 1);
      graphics.fillCircle(aether.x, aether.y + 2, aether.radius * 0.62);
      graphics.fillStyle(0xffffff, 0.45);
      graphics.fillCircle(
        aether.x - aether.radius * 0.2,
        aether.y - aether.radius * 0.15,
        aether.radius * 0.18,
      );
      this.hud.add(
        this.makeText(
          aether.x,
          aether.y + 3,
          `${this.combat.aether}/${this.combat.aetherPerTurn}`,
          {
            color: "#ffffff",
            fontSize: Math.round(aether.radius * 0.5),
            stroke: true,
          },
        ),
      );
      this.hud.add(
        this.makeText(aether.x, aether.y + aether.radius + 14, "Aether", {
          color: INK_SOFT,
          fontSize: 13,
        }),
      );

      this.drawPile(
        graphics,
        drawPile.x,
        drawPile.y,
        `Draw ${this.combat.drawPile.length}`,
      );
      this.drawPile(
        graphics,
        discardPile.x,
        discardPile.y,
        `Discard ${this.combat.discardPile.length}`,
      );

      const enabled = !this.busy && this.combat.phase === "player";
      const buttonView = this.add.container(button.x, button.y);
      const face = this.add.graphics();
      face.fillStyle(enabled ? JADE : STONE, 1);
      face.fillRoundedRect(
        -button.width / 2,
        -button.height / 2,
        button.width,
        button.height,
        { bl: 22, br: 6, tl: 6, tr: 22 },
      );
      face.lineStyle(2, JADE_DARK, 1);
      face.strokeRoundedRect(
        -button.width / 2,
        -button.height / 2,
        button.width,
        button.height,
        { bl: 22, br: 6, tl: 6, tr: 22 },
      );
      buttonView.add(face);
      buttonView.add(
        this.makeText(0, -1, this.busy ? "Enemies act…" : "End Turn", {
          color: "#ffffff",
          fontSize: 17,
        }),
      );
      buttonView.add(
        this.makeText(0, button.height / 2 + 12, "E", {
          color: INK_SOFT,
          fontSize: 11,
        }),
      );
      if (enabled) {
        buttonView.setInteractive({
          hitArea: new Phaser.Geom.Rectangle(
            -button.width / 2,
            -button.height / 2,
            button.width,
            button.height,
          ),
          hitAreaCallback: Phaser.Geom.Rectangle.Contains,
          useHandCursor: true,
        });
        buttonView.on(
          "pointerdown",
          (
            _pointer: Phaser.Input.Pointer,
            _x: number,
            _y: number,
            event: Phaser.Types.Input.EventData,
          ) => {
            event.stopPropagation();
            this.runEnemyTurn();
          },
        );
      }
      this.hud.add(buttonView);

      const floorLabel = input.room.isBoss
        ? `Summit · ${input.room.title}`
        : `Floor ${input.room.floor} of ${input.room.floorCount} · ${input.room.title}`;
      this.hud.add(
        this.makeText(banner.x, banner.y, floorLabel, {
          color: INK,
          fontSize: 20,
          stroke: true,
        }),
      );
      this.hud.add(
        this.makeText(banner.x, banner.y + 24, `Turn ${this.combat.turn}`, {
          color: INK_SOFT,
          fontSize: 14,
          stroke: true,
        }),
      );

      const selected = this.selectedCard();
      if (selected) {
        const targeting = cardTargeting(selected.definition.rules);
        const hint =
          targeting === "enemy"
            ? `Choose an enemy for ${selected.definition.rules.name} · right-click to cancel`
            : `Choose an ally to shield with ${selected.definition.rules.name} · right-click to cancel`;
        this.hud.add(
          this.makeText(banner.x, banner.y + 50, hint, {
            color: HINT_TEXT,
            fontSize: 15,
            stroke: true,
          }),
        );
      }
    }

    /**
     * @param graphics - HUD graphics
     * @param x - Pile center x
     * @param y - Pile center y
     * @param label - Count label
     */
    private drawPile(
      graphics: Phaser.GameObjects.Graphics,
      x: number,
      y: number,
      label: string,
    ): void {
      for (let index = 2; index >= 0; index -= 1) {
        graphics.fillStyle(index === 0 ? PAPER_LIGHT : SAGE, 1);
        graphics.fillRoundedRect(
          x - 18 + index * 3,
          y - 24 - index * 3,
          36,
          48,
          6,
        );
        graphics.lineStyle(1.5, STONE_DARK, 0.8);
        graphics.strokeRoundedRect(
          x - 18 + index * 3,
          y - 24 - index * 3,
          36,
          48,
          6,
        );
      }
      this.hud.add(
        this.makeText(x, y + 36, label, { color: INK_SOFT, fontSize: 13 }),
      );
    }

    /**
     * Builds one interactive hand card. Hover lifts it; click plays or selects it.
     * @param slot - Positioned hand slot
     * @returns Card state the scene eases each frame
     */
    private createHandCard(slot: CardSlot): HandCard {
      const card = this.combat.hand[slot.index] as CombatCard;
      const motion = cardHoverMotion(slot.y, slot.height);
      // A card waiting for a target rises less than a hovered one, so the
      // units it can be aimed at stay visible above it.
      const selectedY = motion.rest.y - motion.lift * SELECTED_LIFT_SHARE;
      const container = this.add.container(slot.x, slot.y);
      this.drawCardFace(container, card, slot);
      const affordable = canAfford(this.combat, card.instanceId) && !this.busy;
      container.setAlpha(affordable ? 1 : 0.5);
      const hit = new Phaser.Geom.Rectangle(
        -slot.width / 2,
        -slot.height / 2,
        slot.width,
        slot.height,
      );
      container.setInteractive({
        hitArea: hit,
        hitAreaCallback: Phaser.Geom.Rectangle.Contains,
        useHandCursor: true,
      });
      const isSelected = card.instanceId === this.selectedCardId;
      const handCard: HandCard = {
        cardId: card.instanceId,
        container,
        height: slot.height,
        hit,
        hoverScale: motion.hover.scale,
        hoverY: motion.hover.y,
        index: slot.index,
        lift: motion.lift,
        restY: motion.rest.y,
        targetScale: isSelected ? motion.hover.scale : motion.rest.scale,
        targetY: isSelected ? selectedY : motion.rest.y,
        width: slot.width,
      };
      if (isSelected) {
        container.setDepth(HOVER_DEPTH);
        container.setPosition(slot.x, selectedY);
        container.setScale(motion.hover.scale);
      } else {
        container.setDepth(slot.index);
      }
      this.bindCardHover(handCard);
      container.on(
        "pointerdown",
        (
          pointer: Phaser.Input.Pointer,
          _x: number,
          _y: number,
          event: Phaser.Types.Input.EventData,
        ) => {
          if (pointer.rightButtonDown()) {
            return;
          }
          event.stopPropagation();
          this.onCardClicked(card.instanceId);
        },
      );
      return handCard;
    }

    /**
     * Paints a card: leaf-cornered paper, cost leaf, title, art, rules, owner.
     * @param container - Card container, centered on the card
     * @param card - Card in hand
     * @param slot - Card size
     */
    private drawCardFace(
      container: Phaser.GameObjects.Container,
      card: CombatCard,
      slot: CardSlot,
    ): void {
      const { rules } = card.definition;
      const accent = ownerColor.get(card.ownerId) ?? JADE;
      const left = -slot.width / 2;
      const top = -slot.height / 2;
      const body = this.add.graphics();
      const radius = { bl: 18, br: 6, tl: 6, tr: 18 };
      body.fillStyle(0x000000, 0.16);
      body.fillRoundedRect(left + 3, top + 5, slot.width, slot.height, radius);
      body.fillStyle(PAPER_LIGHT, 1);
      body.fillRoundedRect(left, top, slot.width, slot.height, radius);
      body.lineStyle(
        card.instanceId === this.selectedCardId ? 4 : 2,
        card.instanceId === this.selectedCardId ? GOLD : STONE_DARK,
        1,
      );
      body.strokeRoundedRect(left, top, slot.width, slot.height, radius);
      body.fillStyle(accent, 0.9);
      body.fillRect(left + 6, top + slot.height - 16, slot.width - 12, 10);
      container.add(body);

      const panels = layoutCardPanels({
        height: slot.height,
        width: slot.width,
        x: 0,
        y: 0,
      });
      const artKey = cardImageKey(card.definition.id);
      if (this.textures.exists(artKey)) {
        this.addContainedImage(
          artKey,
          panels.art.x,
          panels.art.y,
          panels.art.width,
          panels.art.height,
          container,
        );
      } else {
        const wash = this.add.graphics();
        this.paintWash(
          panels.art.x,
          panels.art.y,
          panels.art.width * 0.5,
          kindColor(rules.effects[0]?.kind),
          hashSeed(card.definition.id),
          wash,
        );
        this.paintLeaf(
          panels.art.x,
          panels.art.y,
          panels.art.height * 0.7,
          -Math.PI / 2 + 0.6,
          kindColor(rules.effects[0]?.kind),
          0.55,
          wash,
        );
        container.add(wash);
      }
      container.add(
        this.makeText(panels.title.x + 8, panels.title.y, rules.name, {
          color: INK,
          fontSize: Math.max(
            9,
            Math.min(13, Math.round(slot.width * 0.105)) -
              (rules.name.length > 14 ? 2 : 0),
          ),
          wrapWidth: panels.title.width - 20,
        }),
      );
      const rulesText = rules.effects.map(describeEffect).join("\n");
      container.add(
        this.makeText(panels.rules.x, panels.rules.y - 4, rulesText, {
          color: INK,
          fontSize: Math.max(9, Math.min(12, Math.round(slot.width * 0.092))),
          wrapWidth: panels.rules.width,
        }),
      );
      container.add(
        this.makeText(
          0,
          top + slot.height - 11,
          ownerName.get(card.ownerId) ?? "",
          {
            color: "#ffffff",
            fontSize: 9,
          },
        ),
      );

      const cost = this.add.graphics();
      cost.fillStyle(JADE, 1);
      cost.fillPoints(
        vectors(leafOutline(left + 10, top + 10, 34, 24, -Math.PI / 4)),
        true,
      );
      cost.lineStyle(1.5, JADE_DARK, 1);
      cost.strokePoints(
        vectors(leafOutline(left + 10, top + 10, 34, 24, -Math.PI / 4)),
        true,
      );
      container.add(cost);
      container.add(
        this.makeText(left + 10, top + 10, String(rules.aetherCost), {
          color: "#ffffff",
          fontSize: 15,
          stroke: true,
        }),
      );
    }

    /**
     * Points a card at its hovered pose, then back at the hand on leave.
     * A selected card stays lifted.
     * @param card - Card to bind
     */
    private bindCardHover(card: HandCard): void {
      const left = -card.width / 2;
      const top = -card.height / 2;
      card.container.on("pointerover", () => {
        card.hit.setTo(left, top, card.width, card.height + card.lift);
        card.container.setDepth(HOVER_DEPTH);
        card.targetScale = card.hoverScale;
        card.targetY = card.hoverY;
      });
      card.container.on("pointerout", () => {
        if (card.cardId === this.selectedCardId) {
          return;
        }
        card.hit.setTo(left, top, card.width, card.height);
        card.targetScale = 1;
        card.targetY = card.restY;
      });
    }

    /**
     * Plays a card at once when it needs no choice, otherwise selects it.
     * Clicking the selected card again puts it back.
     * @param cardId - Hand card instance id
     */
    private onCardClicked(cardId: string): void {
      if (this.busy || this.combat.phase !== "player") {
        return;
      }
      if (this.selectedCardId === cardId) {
        this.selectedCardId = undefined;
        this.draw();
        return;
      }
      const card = this.combat.hand.find(
        (entry) => entry.instanceId === cardId,
      );
      if (!card) {
        return;
      }
      if (!canAfford(this.combat, cardId)) {
        this.showNotice("Not enough Aether");
        return;
      }
      const needsChoice =
        cardTargeting(card.definition.rules) !== "none" &&
        automaticTarget(this.combat, card) === undefined;
      if (needsChoice) {
        this.selectedCardId = cardId;
        this.draw();
        return;
      }
      this.resolvePlay(cardId);
    }

    /**
     * Plays a card and animates what it did.
     * @param cardId - Hand card instance id
     * @param targetId - Chosen enemy or ally
     */
    private resolvePlay(cardId: string, targetId?: string): void {
      const result = playCard(this.combat, cardId, targetId);
      this.selectedCardId = undefined;
      if (!result.ok) {
        this.showNotice(
          result.reason === "not-enough-aether"
            ? "Not enough Aether"
            : "That card needs a target",
        );
        this.draw();
        return;
      }
      this.applyStep(result.step);
      this.checkFinished();
    }

    /**
     * Ends the turn and plays each enemy action one at a time.
     */
    private runEnemyTurn(): void {
      if (this.busy || this.combat.phase !== "player") {
        return;
      }
      this.busy = true;
      this.selectedCardId = undefined;
      const steps = endTurn(this.combat);
      this.combat = {
        ...this.combat,
        discardPile: [...this.combat.discardPile, ...this.combat.hand],
        hand: [],
      };
      this.draw();
      this.showBanner("Enemy turn");
      steps.forEach((step, index) => {
        this.time.delayedCall(STEP_DELAY_MS * (index + 1), () => {
          const isLast = index === steps.length - 1;
          if (isLast) {
            this.busy = false;
          }
          this.applyStep(step);
          if (isLast) {
            this.checkFinished();
          }
        });
      });
    }

    /**
     * Shows one step: new state, then floaters and motion for its events.
     * @param step - State and the events that produced it
     */
    private applyStep(step: CombatStep): void {
      this.combat = step.state;
      this.draw();
      let stack = 0;
      for (const event of step.events) {
        this.animateEvent(event, stack);
        stack += 1;
      }
    }

    /**
     * @param event - One combat event
     * @param stack - Position among this step's events, used to offset floaters
     */
    private animateEvent(event: CombatEvent, stack: number): void {
      const delay = stack * 90;
      if (event.kind === "damage") {
        const target = this.unitViews.get(event.targetId);
        this.lunge(event.sourceId, event.targetId);
        if (target) {
          this.shake(target);
          const text = event.dealt > 0 ? `−${event.dealt}` : "Blocked";
          this.floatAt(
            target.x,
            target.y - 20,
            text,
            event.dealt > 0 ? DAMAGE_TEXT : BLOCK_TEXT,
            delay,
            event.dealt > 0 ? 34 : 24,
          );
          if (event.blocked > 0 && event.dealt > 0) {
            this.floatAt(
              target.x,
              target.y + 14,
              `${event.blocked} blocked`,
              BLOCK_TEXT,
              delay + 60,
              16,
            );
          }
        }
        return;
      }
      if (event.kind === "block") {
        const target = this.unitViews.get(event.targetId);
        if (target) {
          this.floatAt(
            target.x,
            target.y - 10,
            `+${event.amount} block`,
            BLOCK_TEXT,
            delay,
            22,
          );
        }
        return;
      }
      if (event.kind === "aether") {
        this.floatAt(
          this.layout.aether.x,
          this.layout.aether.y - 40,
          `+${event.amount} Aether`,
          AETHER_TEXT,
          delay,
          22,
        );
        return;
      }
      if (event.kind === "draw") {
        this.floatAt(
          this.layout.drawPile.x + 30,
          this.layout.drawPile.y - 50,
          `+${event.count} ${event.count === 1 ? "card" : "cards"}`,
          INK,
          delay,
          18,
        );
        return;
      }
      if (event.kind === "shuffle") {
        this.floatAt(
          this.layout.drawPile.x + 30,
          this.layout.drawPile.y - 76,
          "Reshuffled",
          INK_SOFT,
          delay,
          15,
        );
        return;
      }
      if (event.kind === "combo") {
        this.floatAt(
          this.scale.width / 2,
          this.layout.groundY - 40,
          event.triggered ? "Combo!" : "Combo fizzles",
          event.triggered ? cssColor(GOLD) : INK_SOFT,
          delay,
          event.triggered ? 30 : 18,
        );
        return;
      }
      if (event.kind === "death") {
        const view = this.unitViews.get(event.unitId);
        if (view) {
          const lost =
            event.cardsRemoved > 0
              ? `Fallen · ${event.cardsRemoved} cards lost`
              : "Defeated";
          this.floatAt(view.x, view.y + 40, lost, INK, delay + 200, 18);
        }
        return;
      }
      if (event.kind === "enemy-move") {
        const view = this.unitViews.get(event.enemyId);
        const slot = this.slotFor(event.enemyId);
        if (view && slot) {
          this.floatAt(
            view.x,
            view.y - slot.height / 2 - 90,
            event.move.text,
            INK,
            0,
            15,
            1200,
          );
        }
        return;
      }
      if (event.kind === "turn-start" && event.turn > 1) {
        this.showBanner(`Turn ${event.turn}`);
      }
    }

    /**
     * Nudges the attacker toward its target and back.
     * @param sourceId - Attacking unit
     * @param targetId - Unit being hit
     */
    private lunge(sourceId: string, targetId: string): void {
      const source = this.unitViews.get(sourceId);
      const target = this.unitViews.get(targetId);
      if (!source || !target || source === target) {
        return;
      }
      const direction = Math.sign(target.x - source.x) || 1;
      this.tweens.add({
        duration: 130,
        ease: "Quad.easeOut",
        targets: source,
        x: source.x + direction * 26,
        yoyo: true,
      });
    }

    /**
     * @param view - Unit container that was hit
     */
    private shake(view: Phaser.GameObjects.Container): void {
      const startX = view.x;
      this.tweens.add({
        duration: 55,
        onComplete: () => view.setX(startX),
        repeat: 3,
        targets: view,
        x: startX + 7,
        yoyo: true,
      });
    }

    /**
     * Floats a short result up and fades it out. Floaters survive redraws.
     * @param x - Horizontal center
     * @param y - Starting vertical center
     * @param text - Result copy
     * @param color - CSS color
     * @param delay - Milliseconds before it appears
     * @param fontSize - Font size in pixels
     * @param duration - Milliseconds it stays visible
     */
    private floatAt(
      x: number,
      y: number,
      text: string,
      color: string,
      delay: number,
      fontSize: number,
      duration = 900,
    ): void {
      const label = this.makeText(x, y, text, {
        color,
        fontSize,
        stroke: true,
        wrapWidth: 260,
      });
      label.setAlpha(0);
      this.floaters.add(label);
      this.tweens.add({
        alpha: { from: 1, to: 0 },
        delay,
        duration,
        ease: "Quad.easeIn",
        onComplete: () => label.destroy(),
        targets: label,
        y: y - 46,
      });
    }

    /**
     * Shows a centered line of text that fades.
     * @param text - Banner copy
     */
    private showBanner(text: string): void {
      const label = this.makeText(
        this.scale.width / 2,
        this.layout.groundY * 0.42,
        text,
        {
          color: INK,
          fontSize: 34,
          stroke: true,
        },
      );
      label.setAlpha(0);
      this.floaters.add(label);
      this.tweens.add({
        alpha: { from: 0, to: 1 },
        duration: 260,
        hold: 500,
        onComplete: () => label.destroy(),
        targets: label,
        yoyo: true,
      });
    }

    /**
     * @param text - Short warning, such as missing Aether
     */
    private showNotice(text: string): void {
      this.notice?.destroy();
      const notice = this.makeText(
        this.scale.width / 2,
        this.layout.banner.y + 50,
        text,
        {
          color: DAMAGE_TEXT,
          fontSize: 17,
          stroke: true,
        },
      );
      this.floaters.add(notice);
      this.notice = notice;
      this.tweens.add({
        alpha: 0,
        delay: 900,
        duration: 400,
        onComplete: () => notice.destroy(),
        targets: notice,
      });
    }

    /**
     * Shows a unit's lore and, for enemies, its full cycle with the next move marked.
     * @param unitId - Hovered unit
     * @param slot - Its portrait box
     */
    private showTooltip(unitId: string, slot: UnitSlot): void {
      this.hideTooltip();
      const enemy = this.combat.enemies.find((entry) => entry.id === unitId);
      const party = this.combat.party.find((entry) => entry.id === unitId);
      const lines: string[] = [];
      if (enemy) {
        lines.push(enemy.name, "", enemy.description, "", "Cycle:");
        enemy.moves.forEach((move, index) => {
          const marker = index === enemy.moveIndex ? "▶ " : "   ";
          const target =
            move.kind === "attack" ? ` → ${describeTarget(move.target)}` : "";
          lines.push(`${marker}${move.text}${target}`);
        });
      } else if (party) {
        const cards = [
          ...this.combat.drawPile,
          ...this.combat.discardPile,
          ...this.combat.hand,
        ].filter((card) => card.ownerId === party.id).length;
        lines.push(
          party.name,
          party.isCultivator
            ? "Your cultivator. If you fall, the run ends."
            : `Tier ${party.tier} Coreborn`,
          `${cards} cards in the deck`,
        );
      } else {
        return;
      }
      const width = 270;
      const text = this.makeText(0, 0, lines.join("\n"), {
        align: "left",
        color: INK,
        fontSize: 13,
        wrapWidth: width - 24,
      });
      text.setOrigin(0, 0);
      const height = text.height + 20;
      const onRight = slot.x < this.scale.width / 2;
      const x = Math.min(
        this.scale.width - width - 8,
        Math.max(
          8,
          onRight
            ? slot.x + slot.width / 2 + 12
            : slot.x - slot.width / 2 - width - 12,
        ),
      );
      const y = Math.max(
        8,
        Math.min(this.scale.height - height - 8, slot.y - height / 2),
      );
      const panel = this.add.graphics();
      panel.fillStyle(PAPER_LIGHT, 0.97);
      panel.fillRoundedRect(0, 0, width, height, 12);
      panel.lineStyle(2, JADE, 0.9);
      panel.strokeRoundedRect(0, 0, width, height, 12);
      text.setPosition(12, 10);
      const tooltip = this.add.container(x, y, [panel, text]);
      tooltip.setDepth(250);
      this.tooltip = tooltip;
    }

    /**
     * Removes the hover panel, if one is showing.
     */
    private hideTooltip(): void {
      this.tooltip?.destroy();
      this.tooltip = undefined;
    }

    /**
     * Shows the outcome, then reports the result to the run once.
     */
    private checkFinished(): void {
      if (this.combat.phase === "player" || this.finished) {
        return;
      }
      this.finished = true;
      const victory = this.combat.phase === "victory";
      const veil = this.add.graphics().setDepth(400);
      veil.fillStyle(PAPER, 0.7);
      veil.fillRect(0, 0, this.scale.width, this.scale.height);
      const title = this.makeText(
        this.scale.width / 2,
        this.scale.height * 0.4,
        victory ? "Victory" : "The cultivator falls",
        {
          color: victory ? cssColor(JADE_DARK) : DAMAGE_TEXT,
          fontSize: 54,
          stroke: true,
        },
      ).setDepth(401);
      title.setAlpha(0);
      this.tweens.add({ alpha: 1, duration: 400, targets: title });
      const report = {
        outcome: victory ? ("victory" as const) : ("defeat" as const),
        party: this.combat.party.map((unit) => ({
          hitPoints: unit.hitPoints,
          id: unit.id,
        })),
        randomState: this.combat.randomState,
      };
      this.time.delayedCall(FINISH_DELAY_MS, () => input.onFinish(report));
    }

    /**
     * Right-click or a click on empty ground cancels a selected card.
     * @param pointer - Pointer that was pressed
     */
    private onScenePointerDown(pointer: Phaser.Input.Pointer): void {
      if (!this.selectedCardId) {
        return;
      }
      if (pointer.rightButtonDown() || pointer.y < this.layout.groundY + 60) {
        this.selectedCardId = undefined;
        this.draw();
      }
    }

    /**
     * Number keys pick cards, E ends the turn, Escape cancels a selection.
     * @param event - Keyboard event
     */
    private onKeyDown(event: KeyboardEvent): void {
      if (event.key === "Escape" && this.selectedCardId) {
        this.selectedCardId = undefined;
        this.draw();
        return;
      }
      if (event.key === "e" || event.key === "E") {
        this.runEnemyTurn();
        return;
      }
      const index = Number.parseInt(event.key, 10) - 1;
      const card = Number.isNaN(index) ? undefined : this.combat.hand[index];
      if (card) {
        this.onCardClicked(card.instanceId);
      }
    }

    /**
     * @param unitId - Unit under the pointer
     * @returns Whether the selected card can be aimed at this unit
     */
    private isSelectableTarget(unitId: string): boolean {
      const card = this.selectedCard();
      if (!card) {
        return false;
      }
      const targeting = cardTargeting(card.definition.rules);
      if (targeting === "enemy") {
        return this.combat.enemies.some(
          (enemy) => enemy.id === unitId && isAlive(enemy),
        );
      }
      if (targeting === "ally") {
        return this.combat.party.some(
          (unit) => unit.id === unitId && isAlive(unit),
        );
      }
      return false;
    }

    /**
     * @param unitId - Party member or enemy id
     * @returns Where that unit stands in the current layout
     */
    private slotFor(unitId: string): UnitSlot | undefined {
      const partyIndex = this.combat.party.findIndex(
        (unit) => unit.id === unitId,
      );
      if (partyIndex >= 0) {
        return this.layout.party[partyIndex];
      }
      const enemyIndex = this.combat.enemies.findIndex(
        (enemy) => enemy.id === unitId,
      );
      return enemyIndex >= 0 ? this.layout.enemies[enemyIndex] : undefined;
    }

    /**
     * @returns The card waiting for a target, if any
     */
    private selectedCard(): CombatCard | undefined {
      return this.combat.hand.find(
        (card) => card.instanceId === this.selectedCardId,
      );
    }

    /**
     * Destroys the current hand before a repaint.
     */
    private clearHand(): void {
      for (const card of this.hand) {
        card.container.destroy();
      }
      this.hand = [];
    }

    /**
     * Draws a texture scaled to fit inside a frame.
     * @param key - Texture key
     * @param x - Frame center x
     * @param y - Frame center y
     * @param frameWidth - Maximum display width
     * @param frameHeight - Maximum display height
     * @param parent - Container that owns the image
     */
    private addContainedImage(
      key: string,
      x: number,
      y: number,
      frameWidth: number,
      frameHeight: number,
      parent: Phaser.GameObjects.Container,
    ): void {
      const image = this.add.image(x, y, key);
      image.setScale(
        containedScale(image.width, image.height, frameWidth, frameHeight),
      );
      parent.add(image);
    }

    /**
     * Creates centered serif text.
     * @param x - Horizontal center
     * @param y - Vertical center
     * @param text - Copy
     * @param options.align - Line alignment. Defaults to center
     * @param options.color - CSS color
     * @param options.fontSize - Size in pixels
     * @param options.stroke - Whether to outline the text in paper for legibility on art
     * @param options.wrapWidth - Wrap width in pixels
     * @returns The text object, not yet in any container
     */
    private makeText(
      x: number,
      y: number,
      text: string,
      options: {
        align?: "left" | "center";
        color: string;
        fontSize: number;
        stroke?: boolean;
        wrapWidth?: number;
      },
    ): Phaser.GameObjects.Text {
      const label = this.add.text(x, y, text, {
        align: options.align ?? "center",
        color: options.color,
        fontFamily: HEADING_FONT,
        fontSize: `${options.fontSize}px`,
        resolution: textResolution(),
        wordWrap: options.wrapWidth
          ? { useAdvancedWrap: true, width: options.wrapWidth }
          : undefined,
      });
      if (options.stroke) {
        label.setStroke(
          options.color === "#ffffff" ? INK : cssColor(PAPER_LIGHT),
          Math.max(3, options.fontSize / 6),
        );
      }
      label.setOrigin(0.5);
      return label;
    }
  };
}

/**
 * @param kind - A card's first effect kind
 * @returns The wash color for its painted stand-in
 */
function kindColor(kind: string | undefined): number {
  if (kind === "attack") {
    return EMBER;
  }
  if (kind === "defend") {
    return STEEL;
  }
  if (kind === "aether") {
    return DEW;
  }
  if (kind === "combo") {
    return GOLD;
  }
  return JADE;
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
