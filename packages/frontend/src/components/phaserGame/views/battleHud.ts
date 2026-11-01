import type Phaser from "phaser";
import type { BattleLayout } from "../battleLayout";
import { PALETTE } from "../battlePaint";
import { leafOutline } from "../leafShape";
import type { ViewKit } from "./unitView";

/** What the End Turn button says and whether it can be pressed. */
export type EndTurnState = "ready" | "suggested" | "waiting";

/** Values the HUD shows. */
export interface HudValues {
  aether: number;
  aetherPerTurn: number;
  discardCount: number;
  drawCount: number;
  endTurn: EndTurnState;
  turn: number;
}

/**
 * Aether, piles, the End Turn button, and the room banner. Built once per
 * layout and updated in place, so counters can pulse when they change.
 */
export class BattleHud {
  public readonly container: Phaser.GameObjects.Container;
  private readonly aetherLabel: Phaser.GameObjects.Text;
  private readonly aetherOrb: Phaser.GameObjects.Container;
  private readonly button: Phaser.GameObjects.Container;
  private readonly buttonFace: Phaser.GameObjects.Graphics;
  private readonly buttonLabel: Phaser.GameObjects.Text;
  private readonly discardLabel: Phaser.GameObjects.Text;
  private readonly drawLabel: Phaser.GameObjects.Text;
  private readonly hint: Phaser.GameObjects.Text;
  private readonly turnLabel: Phaser.GameObjects.Text;
  private values?: HudValues;
  private hovered = false;

  /**
   * @param kit - Scene services
   * @param layout - Positions for this view size
   * @param floorLabel - Banner text naming the room
   */
  public constructor(
    private readonly kit: ViewKit,
    private readonly layout: BattleLayout,
    floorLabel: string,
  ) {
    const { painter, scene } = kit;
    this.container = scene.add.container(0, 0);
    const { aether, banner, discardPile, drawPile, endTurn } = layout;

    this.aetherOrb = scene.add.container(aether.x, aether.y);
    const orb = scene.add.graphics();
    orb.fillStyle(0x000000, 0.18);
    orb.fillCircle(3, 5, aether.radius * 0.95);
    orb.fillStyle(PALETTE.jade, 0.95);
    orb.fillPoints(
      painter.vectors(
        leafOutline(
          0,
          0,
          aether.radius * 2.5,
          aether.radius * 1.75,
          -Math.PI / 2 + 0.5,
        ),
      ),
      true,
    );
    orb.fillStyle(PALETTE.dew, 1);
    orb.fillCircle(0, 2, aether.radius * 0.66);
    orb.fillStyle(0xffffff, 0.45);
    orb.fillCircle(
      -aether.radius * 0.2,
      -aether.radius * 0.15,
      aether.radius * 0.18,
    );
    this.aetherLabel = painter.text(0, 3, "", {
      color: "#ffffff",
      fontSize: Math.round(aether.radius * 0.55),
      stroke: true,
    });
    this.aetherOrb.add([orb, this.aetherLabel]);
    this.aetherOrb.add(
      painter.text(0, aether.radius + 12, "Aether", {
        color: PALETTE.ink,
        fontSize: 13,
        stroke: true,
      }),
    );

    const piles = scene.add.graphics();
    drawPileShape(piles, drawPile.x, drawPile.y, PALETTE.sage);
    drawPileShape(piles, discardPile.x, discardPile.y, PALETTE.stone);
    this.drawLabel = this.pileLabel(drawPile.x, drawPile.y);
    this.discardLabel = this.pileLabel(discardPile.x, discardPile.y);
    const drawCaption = painter.text(drawPile.x, drawPile.y + 44, "Draw", {
      color: PALETTE.ink,
      fontSize: 12,
      stroke: true,
    });
    const discardCaption = painter.text(
      discardPile.x,
      discardPile.y + 44,
      "Discard",
      {
        color: PALETTE.ink,
        fontSize: 12,
        stroke: true,
      },
    );

    this.button = scene.add.container(endTurn.x, endTurn.y);
    this.buttonFace = scene.add.graphics();
    this.buttonLabel = painter.text(0, -1, "End Turn", {
      color: "#ffffff",
      fontSize: 18,
      stroke: true,
    });
    this.button.add([this.buttonFace, this.buttonLabel]);
    this.button.add(
      painter.text(0, endTurn.height / 2 + 11, "E", {
        color: PALETTE.inkSoft,
        fontSize: 11,
      }),
    );

    const title = painter.text(banner.x, banner.y, floorLabel, {
      color: PALETTE.ink,
      fontSize: 20,
      stroke: true,
    });
    this.turnLabel = painter.text(banner.x, banner.y + 24, "", {
      color: PALETTE.inkSoft,
      fontSize: 14,
      stroke: true,
    });
    this.hint = painter.text(banner.x, banner.y + 52, "", {
      color: PALETTE.hintText,
      fontSize: 15,
      stroke: true,
    });

    this.container.add([
      piles,
      this.drawLabel,
      this.discardLabel,
      drawCaption,
      discardCaption,
      this.aetherOrb,
      this.button,
      title,
      this.turnLabel,
      this.hint,
    ]);
  }

  /**
   * Shows new values, pulsing whatever changed.
   * @param values - Current Aether, piles, turn, and button state
   */
  public update(values: HudValues): void {
    const previous = this.values;
    this.values = values;
    this.aetherLabel.setText(`${values.aether}/${values.aetherPerTurn}`);
    this.drawLabel.setText(String(values.drawCount));
    this.discardLabel.setText(String(values.discardCount));
    this.turnLabel.setText(`Turn ${values.turn}`);
    this.redrawButton();
    if (!previous) {
      return;
    }
    if (previous.aether !== values.aether) {
      this.pulse(this.aetherOrb, values.aether > previous.aether ? 1.18 : 0.88);
    }
    if (previous.drawCount !== values.drawCount) {
      this.pulse(this.drawLabel, 1.3);
    }
    if (previous.discardCount !== values.discardCount) {
      this.pulse(this.discardLabel, 1.3);
    }
  }

  /**
   * @param text - Instruction under the field, or empty to hide it
   */
  public setHint(text: string): void {
    this.hint.setText(text);
  }

  /**
   * @param hovered - Whether the pointer is over the End Turn button
   */
  public setButtonHover(hovered: boolean): void {
    if (hovered === this.hovered) {
      return;
    }
    this.hovered = hovered;
    this.redrawButton();
  }

  /**
   * @param x - Pointer x
   * @param y - Pointer y
   * @returns Whether the point is on the End Turn button
   */
  public isOnButton(x: number, y: number): boolean {
    const { endTurn } = this.layout;
    return (
      Math.abs(x - endTurn.x) <= endTurn.width / 2 &&
      Math.abs(y - endTurn.y) <= endTurn.height / 2
    );
  }

  /**
   * Removes the HUD.
   */
  public destroy(): void {
    this.kit.scene.tweens.killTweensOf([
      this.aetherOrb,
      this.drawLabel,
      this.discardLabel,
      this.button,
    ]);
    this.container.destroy();
  }

  /**
   * Repaints the End Turn button for its state. With nothing left to play,
   * it glows gold so the player knows to end the turn.
   */
  private redrawButton(): void {
    const state = this.values?.endTurn ?? "ready";
    const { height, width } = this.layout.endTurn;
    const face = this.buttonFace;
    const radius = { bl: 22, br: 6, tl: 6, tr: 22 };
    const waiting = state === "waiting";
    face.clear();
    face.fillStyle(0x000000, 0.2);
    face.fillRoundedRect(
      -width / 2 + 3,
      -height / 2 + 5,
      width,
      height,
      radius,
    );
    if (state === "suggested") {
      face.lineStyle(10, PALETTE.gold, 0.35);
      face.strokeRoundedRect(
        -width / 2 - 4,
        -height / 2 - 4,
        width + 8,
        height + 8,
        radius,
      );
    }
    let fill: number = PALETTE.jade;
    if (waiting) {
      fill = PALETTE.stone;
    } else if (this.hovered) {
      fill = PALETTE.jadeDark;
    }
    face.fillStyle(fill, 1);
    face.fillRoundedRect(-width / 2, -height / 2, width, height, radius);
    face.lineStyle(
      2,
      state === "suggested" ? PALETTE.gold : PALETTE.jadeDark,
      1,
    );
    face.strokeRoundedRect(-width / 2, -height / 2, width, height, radius);
    this.buttonLabel.setText(waiting ? "Enemy Turn" : "End Turn");
    this.button.setScale(this.hovered && !waiting ? 1.05 : 1);
  }

  /**
   * @param x - Pile center x
   * @param y - Pile center y
   * @returns The count label on the pile
   */
  private pileLabel(x: number, y: number): Phaser.GameObjects.Text {
    return this.kit.painter.text(x, y + 22, "", {
      color: "#ffffff",
      fontSize: 16,
      stroke: true,
    });
  }

  /**
   * @param target - Object to bounce
   * @param scale - Peak scale
   */
  private pulse(
    target: Phaser.GameObjects.Container | Phaser.GameObjects.Text,
    scale: number,
  ): void {
    if (this.kit.reducedMotion) {
      return;
    }
    this.kit.scene.tweens.killTweensOf(target);
    target.setScale(1);
    this.kit.scene.tweens.add({
      duration: this.kit.wait(130),
      ease: "Quad.easeOut",
      scale,
      targets: target,
      yoyo: true,
    });
  }
}

/**
 * Draws a small stack of cards.
 * @param graphics - Target graphics
 * @param x - Pile center x
 * @param y - Pile center y
 * @param color - Card back color
 */
function drawPileShape(
  graphics: Phaser.GameObjects.Graphics,
  x: number,
  y: number,
  color: number,
): void {
  for (let index = 2; index >= 0; index -= 1) {
    const left = x - 22 + index * 3;
    const top = y - 30 - index * 3;
    graphics.fillStyle(index === 0 ? color : PALETTE.paperLight, 1);
    graphics.fillRoundedRect(left, top, 44, 60, 7);
    graphics.lineStyle(1.5, PALETTE.stoneDark, 0.9);
    graphics.strokeRoundedRect(left, top, 44, 60, 7);
  }
}
