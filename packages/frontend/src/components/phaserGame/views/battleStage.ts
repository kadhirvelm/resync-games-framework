import type Phaser from "phaser";
import {
  BACKDROP_IMAGE_KEY,
  type BattleRoomInfo,
} from "../battleAssetRequests";
import type { BattleLayout } from "../battleLayout";
import { roomTitleCard } from "../battleMotion";
import { cssColor, PALETTE } from "../battlePaint";
import type { ViewKit } from "./unitView";

const AMBIENT_MOTE_COUNT = 14;
const BURST_LEAF_COUNT = 26;
const SPARK_RAYS = 9;

type AmbientMote = {
  drift: number;
  spin: number;
  sway: number;
  view: Phaser.GameObjects.Graphics;
  vx: number;
  vy: number;
};

/** Depth layers, back to front. */
export const DEPTH = {
  ambient: 20,
  arrow: 295,
  backdrop: 0,
  card: 200,
  cardFlying: 280,
  cardHeld: 300,
  cardHovered: 260,
  floater: 150,
  hud: 50,
  outcome: 400,
  title: 350,
  tooltip: 320,
  units: 10,
} as const;

/**
 * The room and its set pieces: backdrop, drifting leaves, banners, damage
 * numbers, hit sparks, the opening title card, and the outcome.
 */
export class BattleStage {
  private backdrop?: Phaser.GameObjects.Container;
  private readonly ambient: AmbientMote[] = [];
  private notice?: Phaser.GameObjects.Text;

  /**
   * @param kit - Scene services
   * @param room - Room the fight takes place in
   */
  public constructor(
    private readonly kit: ViewKit,
    private readonly room: BattleRoomInfo,
  ) {}

  /**
   * Fills the room: the generated backdrop when loaded, otherwise a painted
   * wash, with a ground haze the figures stand in and a paper band behind
   * the hand.
   * @param layout - Positions for this view size
   */
  public paintBackdrop(layout: BattleLayout): void {
    const { painter, scene } = this.kit;
    const { width, height } = scene.scale;
    this.backdrop?.destroy();
    const backdrop = scene.add.container(0, 0).setDepth(DEPTH.backdrop);
    this.backdrop = backdrop;
    const base = scene.add.graphics();
    base.fillStyle(PALETTE.paper, 1);
    base.fillRect(0, 0, width, height);
    backdrop.add(base);
    if (scene.textures.exists(BACKDROP_IMAGE_KEY)) {
      const image = scene.add.image(width / 2, height / 2, BACKDROP_IMAGE_KEY);
      image.setScale(Math.max(width / image.width, height / image.height));
      backdrop.add(image);
    } else {
      const wash = scene.add.graphics();
      painter.wash(
        wash,
        width * 0.22,
        height * 0.3,
        width * 0.26,
        PALETTE.sage,
        11,
        0.55,
      );
      painter.wash(
        wash,
        width * 0.8,
        height * 0.28,
        width * 0.22,
        PALETTE.stone,
        23,
        0.45,
      );
      painter.wash(
        wash,
        width * 0.5,
        -height * 0.05,
        width * 0.3,
        PALETTE.jade,
        37,
        0.4,
      );
      for (let index = 0; index < 9; index += 1) {
        painter.leaf(
          wash,
          (index / 8) * width,
          height * (0.04 + (index % 3) * 0.025),
          34 + (index % 4) * 8,
          Math.PI / 2 + (index % 2 === 0 ? 0.4 : -0.5),
          index % 2 === 0 ? PALETTE.jade : PALETTE.sage,
          0.35,
        );
      }
      backdrop.add(wash);
    }
    const ground = scene.add.graphics();
    // A darker floor band seats the figures in the room's light.
    ground.fillGradientStyle(
      0x000000,
      0x000000,
      0x000000,
      0x000000,
      0,
      0,
      0.16,
      0.16,
    );
    ground.fillRect(0, layout.groundY - height * 0.08, width, height * 0.1);
    ground.fillStyle(0x000000, 0.16);
    ground.fillRect(0, layout.groundY + height * 0.02, width, height);
    // Paper rises behind the hand so card text stays readable on busy art.
    const handTop = layout.hand.restY - layout.hand.cardHeight / 2;
    ground.fillGradientStyle(
      PALETTE.paper,
      PALETTE.paper,
      PALETTE.paper,
      PALETTE.paper,
      0,
      0,
      0.9,
      0.9,
    );
    ground.fillRect(0, handTop - 30, width, height - handTop + 30);
    backdrop.add(ground);
  }

  /**
   * Scatters slow leaves and motes over the room. They wrap at the edges,
   * so resizes need no repositioning.
   */
  public createAmbient(): void {
    if (this.kit.reducedMotion) {
      return;
    }
    const { Phaser: runtime, painter, scene } = this.kit;
    const { width, height } = scene.scale;
    for (let index = 0; index < AMBIENT_MOTE_COUNT; index += 1) {
      const view = scene.add.graphics().setDepth(DEPTH.ambient);
      if (index % 3 !== 0) {
        painter.leaf(
          view,
          0,
          0,
          10 + (index % 4) * 3,
          0,
          index % 2 === 0 ? PALETTE.jade : PALETTE.sage,
          0.4,
        );
      } else {
        view.fillStyle(PALETTE.paperLight, 0.55);
        view.fillCircle(0, 0, 2 + (index % 3));
      }
      view.setPosition(
        runtime.Math.Between(0, Math.max(1, width)),
        runtime.Math.Between(0, Math.max(1, height * 0.75)),
      );
      view.setRotation(runtime.Math.FloatBetween(0, Math.PI * 2));
      this.ambient.push({
        drift: runtime.Math.FloatBetween(0, Math.PI * 2),
        spin: runtime.Math.FloatBetween(-0.0006, 0.0006),
        sway: runtime.Math.FloatBetween(0.015, 0.035),
        view,
        vx: runtime.Math.FloatBetween(0.008, 0.022),
        vy: runtime.Math.FloatBetween(0.006, 0.016),
      });
    }
  }

  /**
   * Moves each mote down and across, swaying, and wraps it back to the top.
   * @param time - Scene time in milliseconds
   * @param delta - Frame time in milliseconds
   * @param floor - Lowest a mote falls before wrapping
   */
  public driftAmbient(time: number, delta: number, floor: number): void {
    const { width } = this.kit.scene.scale;
    for (const mote of this.ambient) {
      const { view } = mote;
      const sway = Math.sin(time * 0.001 + mote.drift) * mote.sway;
      view.x += (mote.vx + sway) * delta;
      view.y += mote.vy * delta;
      view.rotation += mote.spin * delta;
      if (view.x > width + 20) {
        view.x = -20;
      }
      if (view.y > floor) {
        view.y = -20;
        view.x = this.kit.Phaser.Math.Between(-20, Math.max(1, width));
      }
    }
  }

  /**
   * Opens the battle with the room's name, then calls back.
   * @param onDone - Called as the card fades
   */
  public showTitleCard(onDone: () => void): void {
    const { painter, scene, wait } = this.kit;
    const copy = roomTitleCard(this.room);
    const { width, height } = scene.scale;
    const centerY = height * 0.36;
    const card = scene.add.container(width / 2, centerY).setDepth(DEPTH.title);
    const accent = this.room.isBoss ? PALETTE.gold : PALETTE.jade;
    const band = scene.add.graphics();
    band.fillStyle(PALETTE.paperLight, 0.88);
    band.fillRect(-width / 2, -70, width, 140);
    band.lineStyle(2, accent, 0.8);
    band.lineBetween(-width * 0.3, -70, width * 0.3, -70);
    band.lineBetween(-width * 0.3, 70, width * 0.3, 70);
    card.add(band);
    card.add(
      painter.text(0, -38, copy.eyebrow.toUpperCase(), {
        color: cssColor(this.room.isBoss ? PALETTE.gold : PALETTE.jadeDark),
        fontSize: 16,
      }),
    );
    const title = painter.text(0, 4, copy.title, {
      color: PALETTE.ink,
      fontSize: 44,
      stroke: true,
      wrapWidth: width * 0.8,
    });
    if (this.room.isBoss) {
      title.setShadow(0, 0, cssColor(PALETTE.gold), 16, true, true);
    }
    card.add(title);
    if (copy.subtitle) {
      card.add(
        painter.text(0, 46, copy.subtitle, {
          color: PALETTE.damageText,
          fontSize: 18,
          stroke: true,
        }),
      );
    }
    card.setAlpha(0);
    if (!this.kit.reducedMotion) {
      card.setY(centerY + 24);
    }
    scene.tweens.add({
      alpha: 1,
      delay: wait(150),
      duration: wait(420),
      ease: "Quad.easeOut",
      targets: card,
      y: centerY,
    });
    scene.tweens.add({
      alpha: 0,
      delay: wait(1500),
      duration: wait(360),
      ease: "Quad.easeIn",
      onComplete: () => {
        card.destroy();
        onDone();
      },
      targets: card,
      y: centerY - 16,
    });
  }

  /**
   * Sweeps a line of text across the middle of the field.
   * @param text - Banner copy
   * @param y - Vertical center
   * @param color - Text color
   */
  public showBanner(
    text: string,
    y: number,
    color: string = PALETTE.ink,
  ): void {
    const { painter, scene, wait } = this.kit;
    const { width } = scene.scale;
    const band = scene.add.graphics().setDepth(DEPTH.floater);
    band.fillStyle(PALETTE.paperLight, 0.82);
    band.fillRect(0, y - 30, width, 60);
    const label = painter.text(width / 2, y, text, {
      color,
      fontSize: 34,
      stroke: true,
    });
    label.setDepth(DEPTH.floater);
    const parts = [band, label];
    for (const part of parts) {
      part.setAlpha(0);
    }
    if (!this.kit.reducedMotion) {
      label.setX(width / 2 - 60);
    }
    scene.tweens.add({ alpha: 1, duration: wait(180), targets: parts });
    scene.tweens.add({
      duration: wait(900),
      ease: "Sine.easeInOut",
      targets: label,
      x: width / 2 + (this.kit.reducedMotion ? 0 : 60),
    });
    scene.tweens.add({
      alpha: 0,
      delay: wait(700),
      duration: wait(220),
      onComplete: () => {
        for (const part of parts) {
          part.destroy();
        }
      },
      targets: parts,
    });
  }

  /**
   * Floats a short result up and fades it out.
   * @param x - Horizontal center
   * @param y - Starting vertical center
   * @param text - Result copy
   * @param color - CSS color
   * @param fontSize - Font size in pixels
   * @param duration - Milliseconds it stays visible
   */
  public float(
    x: number,
    y: number,
    text: string,
    color: string,
    fontSize: number,
    duration = 900,
  ): void {
    const { painter, scene, wait } = this.kit;
    const label = painter.text(x, y, text, {
      color,
      fontSize,
      stroke: true,
      wrapWidth: 260,
    });
    label.setDepth(DEPTH.floater);
    scene.tweens.add({
      alpha: { from: 1, to: 0 },
      duration: wait(duration),
      ease: "Quad.easeIn",
      onComplete: () => label.destroy(),
      targets: label,
      y: y - 46,
    });
  }

  /**
   * Pops a damage or block number out of a unit: it bursts large, settles,
   * arcs up to one side, and fades.
   * @param x - Where it appears
   * @param y - Where it appears
   * @param text - Number to show
   * @param color - CSS color
   * @param size - Font size at rest
   */
  public popNumber(
    x: number,
    y: number,
    text: string,
    color: string,
    size: number,
  ): void {
    const { Phaser: runtime, painter, scene, wait } = this.kit;
    const label = painter.text(x, y, text, {
      color,
      fontSize: size,
      stroke: true,
    });
    label.setDepth(DEPTH.floater + 1);
    if (this.kit.reducedMotion) {
      scene.tweens.add({
        alpha: 0,
        delay: wait(500),
        duration: wait(300),
        onComplete: () => label.destroy(),
        targets: label,
      });
      return;
    }
    const drift = runtime.Math.FloatBetween(-40, 40);
    label.setScale(1.9);
    scene.tweens.add({
      duration: wait(160),
      ease: "Back.easeOut",
      scale: 1,
      targets: label,
    });
    scene.tweens.add({
      duration: wait(820),
      ease: "Quad.easeOut",
      targets: label,
      x: x + drift,
    });
    scene.tweens.add({
      duration: wait(820),
      ease: "Back.easeOut",
      targets: label,
      y: y - 70,
    });
    scene.tweens.add({
      alpha: 0,
      delay: wait(560),
      duration: wait(300),
      onComplete: () => label.destroy(),
      targets: label,
    });
  }

  /**
   * Flashes a starburst where a blow lands.
   * @param x - Impact x
   * @param y - Impact y
   * @param color - Spark color
   * @param size - Burst radius
   */
  public spark(x: number, y: number, color: number, size: number): void {
    if (this.kit.reducedMotion) {
      return;
    }
    const { Phaser: runtime, scene, wait } = this.kit;
    const burst = scene.add.graphics().setDepth(DEPTH.floater);
    burst.setPosition(x, y);
    const offset = runtime.Math.FloatBetween(0, Math.PI);
    for (let index = 0; index < SPARK_RAYS; index += 1) {
      const angle = offset + (index / SPARK_RAYS) * Math.PI * 2;
      const reach = size * (index % 2 === 0 ? 1 : 0.6);
      burst.lineStyle(index % 2 === 0 ? 5 : 3, color, 1);
      burst.lineBetween(
        Math.cos(angle) * size * 0.25,
        Math.sin(angle) * size * 0.25,
        Math.cos(angle) * reach,
        Math.sin(angle) * reach,
      );
    }
    burst.fillStyle(0xffffff, 0.9);
    burst.fillCircle(0, 0, size * 0.22);
    burst.setScale(0.4);
    scene.tweens.add({
      alpha: 0,
      duration: wait(260),
      ease: "Quad.easeOut",
      onComplete: () => burst.destroy(),
      scale: 1.25,
      targets: burst,
    });
  }

  /**
   * Throws leaves outward from a point and lets them fall and fade.
   * @param x - Burst center x
   * @param y - Burst center y
   * @param count - Leaves to throw
   * @param reach - Farthest a leaf flies
   */
  public burstLeaves(
    x: number,
    y: number,
    count = BURST_LEAF_COUNT,
    reach = 320,
  ): void {
    if (this.kit.reducedMotion) {
      return;
    }
    const { Phaser: runtime, painter, scene, wait } = this.kit;
    const colors = [PALETTE.jade, PALETTE.sage, PALETTE.gold];
    for (let index = 0; index < count; index += 1) {
      const leaf = scene.add.graphics().setDepth(DEPTH.outcome + 2);
      painter.leaf(
        leaf,
        0,
        0,
        14 + (index % 4) * 4,
        0,
        colors[index % colors.length] as number,
        0.9,
      );
      leaf.setPosition(x, y);
      const angle = (index / count) * Math.PI * 2;
      const distance = runtime.Math.Between(reach * 0.4, reach);
      scene.tweens.add({
        alpha: { from: 1, to: 0 },
        duration: wait(1300),
        ease: "Cubic.easeOut",
        onComplete: () => leaf.destroy(),
        rotation: runtime.Math.FloatBetween(-4, 4),
        targets: leaf,
        x: x + Math.cos(angle) * distance,
        y: y + Math.sin(angle) * distance * 0.7 + 60,
      });
    }
  }

  /**
   * Shows a short warning, replacing the previous one.
   * @param text - Warning copy, such as missing Aether
   * @param y - Vertical center
   */
  public showNotice(text: string, y: number): void {
    const { painter, scene, wait } = this.kit;
    this.notice?.destroy();
    const notice = painter.text(scene.scale.width / 2, y, text, {
      color: PALETTE.damageText,
      fontSize: 19,
      stroke: true,
    });
    notice.setDepth(DEPTH.tooltip);
    this.notice = notice;
    scene.tweens.add({
      alpha: 0,
      delay: wait(900),
      duration: wait(400),
      onComplete: () => notice.destroy(),
      targets: notice,
    });
  }

  /**
   * Veils the field and names the outcome.
   * @param victory - Whether the party won
   * @param subtitle - Line under the title
   */
  public showOutcome(victory: boolean, subtitle: string): void {
    const { painter, scene, wait } = this.kit;
    const { width, height } = scene.scale;
    const veil = scene.add.graphics().setDepth(DEPTH.outcome);
    veil.fillStyle(
      victory ? PALETTE.paper : PALETTE.defeatVeil,
      victory ? 0.7 : 0.78,
    );
    veil.fillRect(0, 0, width, height);
    veil.setAlpha(0);
    scene.tweens.add({ alpha: 1, duration: wait(500), targets: veil });
    const titleY = height * 0.4;
    const title = painter
      .text(width / 2, titleY, victory ? "Victory" : "The cultivator falls", {
        color: victory ? cssColor(PALETTE.jadeDark) : PALETTE.damageText,
        fontSize: 58,
        stroke: true,
      })
      .setDepth(DEPTH.outcome + 1);
    if (victory) {
      title.setShadow(0, 0, cssColor(PALETTE.gold), 22, true, true);
    }
    title.setAlpha(0).setScale(this.kit.reducedMotion ? 1 : 0.7);
    scene.tweens.add({
      alpha: 1,
      duration: wait(520),
      ease: "Back.easeOut",
      scale: 1,
      targets: title,
    });
    const line = painter
      .text(width / 2, titleY + 54, subtitle, {
        color: victory ? PALETTE.inkSoft : cssColor(PALETTE.paperLight),
        fontSize: 20,
        stroke: victory,
      })
      .setDepth(DEPTH.outcome + 1);
    line.setAlpha(0);
    scene.tweens.add({
      alpha: 1,
      delay: wait(260),
      duration: wait(420),
      targets: line,
    });
    if (victory) {
      this.burstLeaves(width / 2, titleY);
    }
  }
}
