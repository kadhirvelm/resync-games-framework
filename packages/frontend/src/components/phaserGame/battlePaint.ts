import type Phaser from "phaser";
import { containedScale } from "./containedScale";
import { leafOutline, type PaintPoint, washBlots } from "./leafShape";

type PhaserRuntime = typeof import("phaser");

/** Battle palette: paper, ink, and the pigments of the art direction. */
export const PALETTE = {
  aetherText: "#2f8a80",
  blockText: "#3f6f8c",
  damageText: "#b5432f",
  defeatVeil: 0x1b2620,
  dew: 0x3f9e95,
  ember: 0xb5543f,
  gold: 0xc49a3a,
  hintText: "#7a5810",
  ink: "#24332b",
  inkNumber: 0x24332b,
  inkSoft: "#4b5a52",
  jade: 0x4e8f6a,
  jadeDark: 0x2f5e45,
  paper: 0xf3efe4,
  paperLight: 0xfffdf6,
  sage: 0x9db89a,
  steel: 0x557a90,
  stone: 0x8a8f8c,
  stoneDark: 0x5d625f,
} as const;

const HEADING_FONT = "Georgia, 'Times New Roman', serif";

/** Options for {@link BattlePainter.text}. */
export interface TextOptions {
  /** Line alignment. Defaults to center. */
  align?: "left" | "center";
  /** CSS color */
  color: string;
  fontSize: number;
  /** Outline the text for legibility over art */
  stroke?: boolean;
  /** Wrap width in pixels */
  wrapWidth?: number;
}

/**
 * @param color - Phaser color number
 * @returns CSS hex color
 */
export function cssColor(color: number): string {
  return `#${color.toString(16).padStart(6, "0")}`;
}

/**
 * @param color - Phaser color number
 * @returns Red, green, and blue channels from 0 to 255, for camera fades
 */
export function rgb(color: number): [number, number, number] {
  return [(color >> 16) & 0xff, (color >> 8) & 0xff, color & 0xff];
}

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
 * Paper-and-ink drawing helpers shared by every battle view.
 */
export class BattlePainter {
  /**
   * @param Phaser - Phaser module namespace
   * @param scene - Scene that owns the created objects
   */
  public constructor(
    private readonly Phaser: PhaserRuntime,
    private readonly scene: Phaser.Scene,
  ) {}

  /**
   * @param points - Outline in canvas pixels
   * @returns The same points as Phaser vectors, for polygon fills
   */
  public vectors(points: PaintPoint[]): Phaser.Math.Vector2[] {
    return points.map(
      (point) => new this.Phaser.Math.Vector2(point.x, point.y),
    );
  }

  /**
   * Creates centered serif text.
   * @param x - Horizontal center
   * @param y - Vertical center
   * @param copy - Text
   * @param options - Color, size, stroke, and wrapping
   * @returns The text object, not yet in any container
   */
  public text(
    x: number,
    y: number,
    copy: string,
    options: TextOptions,
  ): Phaser.GameObjects.Text {
    const label = this.scene.add.text(x, y, copy, {
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
        options.color === "#ffffff"
          ? PALETTE.ink
          : cssColor(PALETTE.paperLight),
        Math.max(3, options.fontSize / 6),
      );
    }
    label.setOrigin(0.5);
    return label;
  }

  /**
   * Paints a soft watercolor wash from overlapping blots.
   * @param graphics - Target graphics
   * @param x - Wash center x
   * @param y - Wash center y
   * @param radius - Wash radius
   * @param color - Pigment
   * @param seed - Layout seed
   * @param strength - Multiplier on each blot's opacity
   */
  public wash(
    graphics: Phaser.GameObjects.Graphics,
    x: number,
    y: number,
    radius: number,
    color: number,
    seed: number,
    strength = 1,
  ): void {
    for (const blot of washBlots(x, y, radius, seed)) {
      graphics.fillStyle(color, blot.alpha * strength);
      graphics.fillCircle(blot.x, blot.y, blot.radius);
    }
  }

  /**
   * Paints one leaf with its midrib.
   * @param graphics - Target graphics
   * @param x - Leaf center x
   * @param y - Leaf center y
   * @param length - Stem-to-tip length
   * @param angle - Stem-to-tip direction in radians
   * @param color - Fill color
   * @param alpha - Fill opacity
   */
  public leaf(
    graphics: Phaser.GameObjects.Graphics,
    x: number,
    y: number,
    length: number,
    angle: number,
    color: number,
    alpha: number,
  ): void {
    const points = leafOutline(x, y, length, length * 0.48, angle);
    graphics.fillStyle(color, alpha);
    graphics.fillPoints(this.vectors(points), true);
    graphics.lineStyle(1, PALETTE.jadeDark, alpha * 0.8);
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
   * Draws a soft contact shadow so a figure sits on the ground instead of
   * floating over the backdrop.
   * @param graphics - Target graphics
   * @param x - Center x of the feet
   * @param y - Ground line
   * @param width - Shadow width
   */
  public contactShadow(
    graphics: Phaser.GameObjects.Graphics,
    x: number,
    y: number,
    width: number,
  ): void {
    const layers = 5;
    for (let index = 0; index < layers; index += 1) {
      const share = 1 - index / layers;
      graphics.fillStyle(0x000000, 0.07);
      graphics.fillEllipse(x, y, width * share, width * 0.16 * share);
    }
  }

  /**
   * Draws a texture scaled to fit inside a frame.
   * @param key - Texture key
   * @param x - Frame center x
   * @param y - Frame center y
   * @param frameWidth - Maximum display width
   * @param frameHeight - Maximum display height
   * @returns The image, not yet in any container
   */
  public containedImage(
    key: string,
    x: number,
    y: number,
    frameWidth: number,
    frameHeight: number,
  ): Phaser.GameObjects.Image {
    const image = this.scene.add.image(x, y, key);
    image.setScale(
      containedScale(image.width, image.height, frameWidth, frameHeight),
    );
    return image;
  }
}
