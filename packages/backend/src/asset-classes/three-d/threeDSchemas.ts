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
/** Accepted generation request, with bounded strings and explicit provider selection. */
export const threeDGenerationSchema = z.object({
  design: threeDDesignSchema.optional(),
  generationId: z.uuid(),
  kind: z.enum(["prop", "environment", "character"]),
  prompt: z.string().trim().min(1).max(4000),
  provider: z.enum(["demo", "design", "meshy"]).default("design"),
  useLore: z.boolean().default(false),
});
