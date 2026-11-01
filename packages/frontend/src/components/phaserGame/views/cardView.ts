import type Phaser from "phaser";
import { describeEffect } from "../../tower/logic/cardRules";
import type { CombatCard } from "../../tower/logic/combat";
import { cardImageKey } from "../battleAssetRequests";
import { layoutCardPanels } from "../battleLayout";
import { PALETTE } from "../battlePaint";
import { approach, type CardPose } from "../handFan";
import { hashSeed, leafOutline } from "../leafShape";
import type { ViewKit } from "./unitView";

/** How the card's edge glows. */
export type CardGlow = "none" | "playable" | "ready";

/** Time constant for a card easing toward its pose. */
const CARD_SETTLE_MS = 70;

/** Card corner radii: leaf-cut corners on one diagonal. */
const CARD_RADIUS = { bl: 18, br: 6, tl: 6, tr: 18 };

/**
 * One card in the hand or in flight. Each frame it eases toward its target
 * pose, so re-fanning, hovering, and dragging all glide instead of jump.
 * While it flies to a pile or a target, a tween drives it instead.
 */
export class CardView {
  public readonly container: Phaser.GameObjects.Container;
  /** Where the card is heading. The scene changes this freely. */
  public target: CardPose;
  /** True while a tween, not easing, moves the card */
  public flying = false;
  private readonly glow: Phaser.GameObjects.Graphics;
  private readonly costLabel: Phaser.GameObjects.Text;
  private glowState: CardGlow = "none";

  /**
   * @param kit - Scene services
   * @param card - Card in hand
   * @param size - Card size at scale 1
   * @param accent - Owner color for the owner strip
   * @param ownerName - Who brought the card
   * @param start - Pose the card appears at
   */
  public constructor(
    private readonly kit: ViewKit,
    public readonly card: CombatCard,
    private readonly size: { height: number; width: number },
    accent: number,
    ownerName: string,
    start: CardPose,
  ) {
    const { scene } = kit;
    this.container = scene.add.container(start.x, start.y);
    this.container.setRotation(start.rotation).setScale(start.scale);
    this.target = { ...start };
    this.glow = scene.add.graphics();
    this.container.add(this.glow);
    this.costLabel = this.drawFace(accent, ownerName);
  }

  /**
   * @returns Instance id of the card
   */
  public get id(): string {
    return this.card.instanceId;
  }

  /**
   * @returns Top center of the card as it sits now, where the aiming arrow starts
   */
  public get top(): { x: number; y: number } {
    const { container } = this;
    const reach = (this.size.height * container.scale) / 2;
    return {
      x: container.x + Math.sin(container.rotation) * reach,
      y: container.y - Math.cos(container.rotation) * reach,
    };
  }

  /**
   * Eases the card toward its target pose for one frame.
   * @param delta - Frame time in milliseconds
   */
  public ease(delta: number): void {
    if (this.flying) {
      return;
    }
    const { container, target } = this;
    container.setPosition(
      approach(container.x, target.x, delta, CARD_SETTLE_MS),
      approach(container.y, target.y, delta, CARD_SETTLE_MS),
    );
    container.setRotation(
      approach(
        container.rotation,
        target.rotation,
        delta,
        CARD_SETTLE_MS,
        0.002,
      ),
    );
    container.setScale(
      approach(container.scale, target.scale, delta, CARD_SETTLE_MS, 0.002),
    );
  }

  /**
   * Shows whether the card can be played, and whether letting go now plays it.
   * @param glow - Edge glow to show
   * @param affordable - Whether the player has the Aether for it
   */
  public setGlow(glow: CardGlow, affordable: boolean): void {
    this.costLabel.setColor(affordable ? "#ffffff" : "#ffb3a6");
    if (glow === this.glowState) {
      return;
    }
    this.glowState = glow;
    this.glow.clear();
    if (glow === "none") {
      return;
    }
    const color = glow === "ready" ? PALETTE.gold : 0x7fe0b0;
    const { height, width } = this.size;
    for (const [spread, alpha] of [
      [10, 0.18],
      [6, 0.3],
      [3, 0.55],
    ] as const) {
      this.glow.lineStyle(spread, color, alpha);
      this.glow.strokeRoundedRect(
        -width / 2 - spread / 2,
        -height / 2 - spread / 2,
        width + spread,
        height + spread,
        CARD_RADIUS,
      );
    }
  }

  /**
   * Shakes the card side to side, for a play that was refused.
   */
  public refuse(): void {
    if (this.kit.reducedMotion) {
      return;
    }
    const startRotation = this.container.rotation;
    this.kit.scene.tweens.add({
      duration: 50,
      onComplete: () => this.container.setRotation(startRotation),
      repeat: 3,
      rotation: startRotation + 0.06,
      targets: this.container,
      yoyo: true,
    });
  }

  /**
   * Flies the card under a tween instead of easing, then calls back.
   * @param pose - Where it ends
   * @param durationMs - Flight time
   * @param options.alpha - Opacity at the end
   * @param options.delay - Milliseconds before it leaves
   * @param options.ease - Tween ease
   * @param onDone - Called when it lands
   */
  public flyTo(
    pose: CardPose,
    durationMs: number,
    options: { alpha?: number; delay?: number; ease?: string },
    onDone?: () => void,
  ): void {
    this.flying = true;
    this.kit.scene.tweens.killTweensOf(this.container);
    this.kit.scene.tweens.add({
      alpha: options.alpha ?? 1,
      delay: options.delay ?? 0,
      duration: durationMs,
      ease: options.ease ?? "Cubic.easeInOut",
      onComplete: () => {
        this.target = { ...pose };
        this.flying = false;
        onDone?.();
      },
      rotation: pose.rotation,
      scale: pose.scale,
      targets: this.container,
      x: pose.x,
      y: pose.y,
    });
  }

  /**
   * Removes the card.
   */
  public destroy(): void {
    this.kit.scene.tweens.killTweensOf(this.container);
    this.container.destroy();
  }

  /**
   * Paints the card: leaf-cornered paper, cost leaf, title, art, rules,
   * and the owner strip.
   * @param accent - Owner color
   * @param ownerName - Who brought the card
   * @returns The cost label, whose color tracks affordability
   */
  private drawFace(accent: number, ownerName: string): Phaser.GameObjects.Text {
    const { painter, scene } = this.kit;
    const { rules } = this.card.definition;
    const { height, width } = this.size;
    const left = -width / 2;
    const top = -height / 2;
    const body = scene.add.graphics();
    body.fillStyle(0x000000, 0.22);
    body.fillRoundedRect(left + 3, top + 6, width, height, CARD_RADIUS);
    body.fillStyle(PALETTE.paperLight, 1);
    body.fillRoundedRect(left, top, width, height, CARD_RADIUS);
    body.lineStyle(2.5, kindColor(rules.effects[0]?.kind), 1);
    body.strokeRoundedRect(left, top, width, height, CARD_RADIUS);
    body.fillStyle(accent, 0.92);
    body.fillRect(left + 7, top + height - 17, width - 14, 11);
    this.container.add(body);

    const panels = layoutCardPanels({ height, width, x: 0, y: 0 });
    const artKey = cardImageKey(this.card.definition.id);
    if (scene.textures.exists(artKey)) {
      this.container.add(
        painter.containedImage(
          artKey,
          panels.art.x,
          panels.art.y,
          panels.art.width,
          panels.art.height,
        ),
      );
    } else {
      const wash = scene.add.graphics();
      const color = kindColor(rules.effects[0]?.kind);
      painter.wash(
        wash,
        panels.art.x,
        panels.art.y,
        panels.art.width * 0.5,
        color,
        hashSeed(this.card.definition.id),
      );
      painter.leaf(
        wash,
        panels.art.x,
        panels.art.y,
        panels.art.height * 0.7,
        -Math.PI / 2 + 0.6,
        color,
        0.55,
      );
      this.container.add(wash);
    }
    const scale = width / 110;
    this.container.add(
      painter.text(panels.title.x + 9, panels.title.y, rules.name, {
        color: PALETTE.ink,
        fontSize: Math.max(
          9,
          Math.min(15, Math.round(12 * scale)) -
            (rules.name.length > 14 ? 2 : 0),
        ),
        wrapWidth: panels.title.width - 22,
      }),
    );
    this.container.add(
      painter.text(
        panels.rules.x,
        panels.rules.y - 5,
        rules.effects.map(describeEffect).join("\n"),
        {
          color: PALETTE.ink,
          fontSize: Math.max(9, Math.min(14, Math.round(11 * scale))),
          wrapWidth: panels.rules.width - 4,
        },
      ),
    );
    this.container.add(
      painter.text(0, top + height - 12, ownerName, {
        color: "#ffffff",
        fontSize: Math.max(8, Math.round(9 * scale)),
      }),
    );

    const cost = scene.add.graphics();
    const leaf = painter.vectors(
      leafOutline(left + 11, top + 11, 38, 27, -Math.PI / 4),
    );
    cost.fillStyle(PALETTE.jade, 1);
    cost.fillPoints(leaf, true);
    cost.lineStyle(1.5, PALETTE.jadeDark, 1);
    cost.strokePoints(leaf, true);
    this.container.add(cost);
    const costLabel = painter.text(
      left + 11,
      top + 11,
      String(rules.aetherCost),
      {
        color: "#ffffff",
        fontSize: 17,
        stroke: true,
      },
    );
    this.container.add(costLabel);
    return costLabel;
  }
}

/**
 * @param kind - A card's first effect kind
 * @returns The pigment for its border and painted stand-in
 */
export function kindColor(kind: string | undefined): number {
  if (kind === "attack") {
    return PALETTE.ember;
  }
  if (kind === "defend") {
    return PALETTE.steel;
  }
  if (kind === "aether") {
    return PALETTE.dew;
  }
  if (kind === "combo") {
    return PALETTE.gold;
  }
  return PALETTE.jade;
}
