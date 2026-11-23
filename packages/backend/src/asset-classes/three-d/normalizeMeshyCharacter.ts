import { NodeIO } from "@gltf-transform/core";
import { BadRequestException } from "@nestjs/common";
import { THREE_D_CHARACTER_ANIMATIONS } from "@resync-game-framework/api";
import sharp from "sharp";

const CHARACTER_TEXTURE_EDGE = 1024;

/**
 * Converts Meshy's multi-clip character output into the framework contract.
 * @param bytes - Meshy's self-contained animated character GLB
 * @param clipNames - Ordered clip names matching the requested Meshy actions
 * @returns A compact core glTF GLB with canonical clip names
 */
export async function normalizeMeshyCharacter(
  bytes: Uint8Array,
  clipNames: readonly string[] = THREE_D_CHARACTER_ANIMATIONS,
): Promise<Uint8Array> {
  const io = new NodeIO();
  const document = await io.readBinary(bytes);
  const animations = document.getRoot().listAnimations();
  if (animations.length !== clipNames.length)
    throw new BadRequestException(
      `Meshy character output contained ${animations.length} animations, expected ${clipNames.length}.`,
    );
  for (const [index, animation] of animations.entries()) {
    const name = clipNames[index];
    if (!name) throw new BadRequestException("Unknown character animation.");
    animation.setName(name);
  }
  for (const texture of document.getRoot().listTextures()) {
    const image = texture.getImage();
    if (!image) continue;
    const metadata = await sharp(image).metadata();
    const resized = sharp(image).resize({
      fit: "inside",
      height: CHARACTER_TEXTURE_EDGE,
      width: CHARACTER_TEXTURE_EDGE,
      withoutEnlargement: true,
    });
    if (metadata.hasAlpha) {
      texture
        .setImage(await resized.png({ compressionLevel: 9 }).toBuffer())
        .setMimeType("image/png");
      continue;
    }
    texture
      .setImage(
        await resized
          .jpeg({ chromaSubsampling: "4:2:0", progressive: true, quality: 88 })
          .toBuffer(),
      )
      .setMimeType("image/jpeg");
  }
  return io.writeBinary(document);
}
