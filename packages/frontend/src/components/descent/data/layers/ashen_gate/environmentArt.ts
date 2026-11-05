/** Painted surfaces that dress the Ashen Gate plateau and abyss. */
export type AshenGateTextureRole = "cliff" | "ground" | "lava";

/** One generated texture the battlefield looks up by its prompt tag. */
export interface AshenGateTextureDefinition {
  role: AshenGateTextureRole;
  /** Stable prefix of the generation prompt, used to find the image again. */
  tag: string;
}

/**
 * Canonical texture tags shared by generation and runtime lookup. Generated
 * image ids differ between machines; the prompt tag does not.
 */
export const ASHEN_GATE_TEXTURES = [
  { role: "ground", tag: "Descent Ashen Gate ground texture" },
  { role: "lava", tag: "Descent Ashen Gate lava texture" },
  { role: "cliff", tag: "Descent Ashen Gate cliff texture" },
] as const satisfies readonly AshenGateTextureDefinition[];

/** Image URLs for each painted surface that has been generated. */
export type AshenGateTextureSet = Partial<Record<AshenGateTextureRole, string>>;

/** The fields of a stored static image that texture lookup reads. */
export interface AshenGateTextureCandidate {
  createdAt: string;
  imageUrl: string;
  prompt: string;
}

/**
 * Builds the generation prompt for one texture so lookup can find it later.
 * @param tag - Canonical texture tag
 * @param direction - Art direction for the image agent
 * @returns The tagged prompt
 */
export function ashenGateTexturePrompt(tag: string, direction: string): string {
  return `${tag}. ${direction}`;
}

/**
 * Resolves the newest generated image for each canonical texture tag.
 * @param images - Stored static images, in any order
 * @returns Role-keyed image URLs; missing roles keep procedural surfaces
 */
export function resolveAshenGateTextures(
  images: readonly AshenGateTextureCandidate[],
): AshenGateTextureSet {
  const byNewest = [...images].sort((left, right) =>
    right.createdAt.localeCompare(left.createdAt),
  );
  const resolved: AshenGateTextureSet = {};
  for (const definition of ASHEN_GATE_TEXTURES) {
    const match = byNewest.find((image) =>
      image.prompt.startsWith(`${definition.tag}.`),
    );
    if (match !== undefined) resolved[definition.role] = match.imageUrl;
  }
  return resolved;
}
