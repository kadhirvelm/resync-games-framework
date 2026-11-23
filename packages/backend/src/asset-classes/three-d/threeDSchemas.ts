import { THREE_D_CHARACTER_ANIMATIONS } from "@resync-game-framework/api";
import { z } from "zod";

/** Bounds used before allocating any renderer or provider resources. */
export const THREE_D_LIMITS = {
  animations: 32,
  bytes: 20 * 1024 * 1024,
  duration: 60,
  materials: 64,
  meshes: 128,
  nodes: 512,
  textureEdge: 4096,
  textures: 16,
  triangles: 100_000,
} as const;
/** A finite three-dimensional coordinate. */
const position = z.tuple([
  z.number().finite().min(-24).max(24),
  z.number().finite().min(-24).max(24),
  z.number().finite().min(-24).max(24),
]);
/** Untrusted model designs contain data, never executable source. */
export const threeDDesignSchema = z.object({
  name: z.string().trim().min(1).max(80),
  parts: z
    .array(
      z.object({
        color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
        joint: z.enum([
          "body",
          "head",
          "leftArm",
          "rightArm",
          "leftLeg",
          "rightLeg",
        ]),
        name: z.string().trim().min(1).max(60),
        position,
        scale: z.tuple([
          z.number().min(0.05).max(24),
          z.number().min(0.05).max(24),
          z.number().min(0.05).max(24),
        ]),
        shape: z.enum(["box", "cylinder"]),
      }),
    )
    .min(1)
    .max(64),
});
/** Optional preset animation appended to a character's base five clips. */
export const threeDExtraAnimationSchema = z.object({
  actionId: z.number().int().nonnegative(),
  clipName: z
    .string()
    .trim()
    .min(1)
    .max(32)
    .regex(/^[a-z][a-zA-Z0-9_-]*$/),
});
/** Accepted generation request, with bounded strings and explicit provider selection. */
export const threeDGenerationSchema = z
  .object({
    design: threeDDesignSchema.optional(),
    extraAnimations: z.array(threeDExtraAnimationSchema).max(5).optional(),
    generationId: z.uuid(),
    kind: z.enum(["prop", "environment", "character"]),
    prompt: z.string().trim().min(1).max(4000),
    provider: z.enum(["demo", "design", "meshy"]).default("design"),
    sourceAssetId: z.uuid().optional(),
    useLore: z.boolean().default(false),
  })
  .superRefine((value, ctx) => {
    if (
      (value.sourceAssetId || value.extraAnimations?.length) &&
      (value.kind !== "character" || value.provider !== "meshy")
    ) {
      ctx.addIssue({
        code: "custom",
        message:
          "sourceAssetId and extraAnimations require a Meshy character generation.",
      });
    }
    if (!value.extraAnimations?.length) return;
    const seenNames = new Set<string>(THREE_D_CHARACTER_ANIMATIONS);
    const seenActions = new Set<number>([0, 30, 99, 178, 189]);
    for (const extra of value.extraAnimations) {
      if (seenNames.has(extra.clipName)) {
        ctx.addIssue({
          code: "custom",
          message: `Duplicate character clip name: ${extra.clipName}.`,
        });
      }
      if (seenActions.has(extra.actionId)) {
        ctx.addIssue({
          code: "custom",
          message: `Duplicate Meshy action id: ${extra.actionId}.`,
        });
      }
      seenNames.add(extra.clipName);
      seenActions.add(extra.actionId);
    }
  });
