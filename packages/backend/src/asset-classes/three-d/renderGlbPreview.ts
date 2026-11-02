import { type Material, NodeIO, type TextureInfo } from "@gltf-transform/core";
import sharp from "sharp";

type Point2 = [number, number];
type Point3 = [number, number, number];
type Matrix4 = [
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
];

interface DecodedTexture {
  data: Uint8Array;
  height: number;
  width: number;
  wrapS: number;
  wrapT: number;
}

interface PreviewTriangle {
  color: string;
  depth: number;
  opacity: number;
  points: Point2[];
}

const CLAMP_TO_EDGE = 33071;
const MIRRORED_REPEAT = 33648;

/** Restricts a number to an inclusive range. */
function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

/** Applies a glTF sampler's wrapping rule to one texture coordinate. */
function wrapTextureCoordinate(value: number, mode: number): number {
  if (mode === CLAMP_TO_EDGE) return clamp(value, 0, 1);
  const whole = Math.floor(value);
  const fraction = value - whole;
  if (mode === MIRRORED_REPEAT)
    return Math.abs(whole) % 2 === 1 ? 1 - fraction : fraction;
  return fraction;
}

/** Transforms one local-space point by a glTF node world matrix. */
function transformPoint(matrix: Matrix4, point: Point3): Point3 {
  return [
    matrix[0] * point[0] +
      matrix[4] * point[1] +
      matrix[8] * point[2] +
      matrix[12],
    matrix[1] * point[0] +
      matrix[5] * point[1] +
      matrix[9] * point[2] +
      matrix[13],
    matrix[2] * point[0] +
      matrix[6] * point[1] +
      matrix[10] * point[2] +
      matrix[14],
  ];
}

/** Projects one world-space point into the workshop's isometric view. */
function projectPoint(point: Point3): Point3 {
  const [x, y, z] = point;
  return [(x - z) * Math.SQRT1_2, -y + (x + z) * 0.35, x + z + y];
}

/** Estimates soft hemispheric lighting from a triangle's world-space normal. */
function triangleBrightness(points: Point3[]): number {
  const [a, b, c] = points;
  if (!a || !b || !c) return 1;
  const first: Point3 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const second: Point3 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
  const normal: Point3 = [
    first[1] * second[2] - first[2] * second[1],
    first[2] * second[0] - first[0] * second[2],
    first[0] * second[1] - first[1] * second[0],
  ];
  const length = Math.hypot(...normal);
  if (length < 0.000001) return 1;
  const lightLength = Math.hypot(0.3, 1, 0.5);
  const light: Point3 = [0.3 / lightLength, 1 / lightLength, 0.5 / lightLength];
  const diffuse = Math.abs(
    (normal[0] * light[0] + normal[1] * light[1] + normal[2] * light[2]) /
      length,
  );
  return 0.78 + diffuse * 0.42;
}

/** Decodes the base-color image and sampler used by one glTF material. */
async function decodeBaseColorTexture(
  material: Material | null,
): Promise<DecodedTexture | undefined> {
  const texture = material?.getBaseColorTexture();
  const image = texture?.getImage();
  const info = material?.getBaseColorTextureInfo();
  if (!image || !info) return undefined;
  const decoded = await sharp(image)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return {
    data: decoded.data,
    height: decoded.info.height,
    width: decoded.info.width,
    wrapS: info.getWrapS(),
    wrapT: info.getWrapT(),
  };
}

/** Reads the color nearest the center of one UV-mapped triangle. */
function sampleTexture(
  texture: DecodedTexture,
  coordinates: Point2[],
): [number, number, number, number] {
  const coordinate = coordinates.reduce(
    (total, value) => [total[0] + value[0] / 3, total[1] + value[1] / 3],
    [0, 0] as Point2,
  );
  const u = wrapTextureCoordinate(coordinate[0], texture.wrapS);
  const v = wrapTextureCoordinate(coordinate[1], texture.wrapT);
  const x = clamp(Math.floor(u * texture.width), 0, texture.width - 1);
  const y = clamp(Math.floor(v * texture.height), 0, texture.height - 1);
  const offset = (y * texture.width + x) * 4;
  return [
    texture.data[offset] ?? 255,
    texture.data[offset + 1] ?? 255,
    texture.data[offset + 2] ?? 255,
    texture.data[offset + 3] ?? 255,
  ];
}

/** Converts material, texture and lighting values into an SVG fill color. */
function resolveTriangleColor(
  factor: number[],
  texture: DecodedTexture | undefined,
  coordinates: Point2[],
  brightness: number,
): { color: string; opacity: number } {
  const sampled = texture
    ? sampleTexture(texture, coordinates)
    : ([255, 255, 255, 255] as const);
  const channels = sampled
    .slice(0, 3)
    .map((value, index) =>
      Math.round(clamp(value * (factor[index] ?? 1) * brightness, 0, 255)),
    );
  return {
    color: `rgb(${channels.join(",")})`,
    opacity: clamp((sampled[3] / 255) * (factor[3] ?? 1), 0, 1),
  };
}

/** Returns the UV accessor selected by the material's base-color texture. */
function textureCoordinates(
  material: Material | null,
): { attribute: string; info: TextureInfo } | undefined {
  const info = material?.getBaseColorTextureInfo();
  if (!info) return undefined;
  return { attribute: `TEXCOORD_${info.getTexCoord()}`, info };
}

/**
 * Produces a texture-aware isometric thumbnail from a validated GLB.
 * @param bytes - Self-contained GLB model data
 * @returns A 320 by 320 PNG resembling the Babylon workshop presentation
 */
export async function renderGlbPreview(bytes: Uint8Array): Promise<Buffer> {
  const document = await new NodeIO().readBinary(bytes);
  const triangles: PreviewTriangle[] = [];
  for (const node of document.getRoot().listNodes()) {
    const matrix = node.getWorldMatrix() as Matrix4;
    for (const primitive of node.getMesh()?.listPrimitives() ?? []) {
      const position = primitive.getAttribute("POSITION");
      if (!position) continue;
      const material = primitive.getMaterial();
      const factor = material?.getBaseColorFactor() ?? [0.4, 0.7, 0.6, 1];
      const texture = await decodeBaseColorTexture(material);
      const coordinateSelection = textureCoordinates(material);
      const coordinateAccessor = coordinateSelection
        ? primitive.getAttribute(coordinateSelection.attribute)
        : null;
      const indices = primitive.getIndices()?.getArray();
      const count = indices?.length ?? position.getCount();
      for (let index = 0; index + 2 < count; index += 3) {
        const vertexIndices = [0, 1, 2].map(
          (offset) => indices?.[index + offset] ?? index + offset,
        );
        const worldPoints = vertexIndices.map((vertexIndex) =>
          transformPoint(
            matrix,
            position.getElement(vertexIndex, [0, 0, 0]) as Point3,
          ),
        );
        const projected = worldPoints.map(projectPoint);
        const coordinates = vertexIndices.map((vertexIndex) =>
          coordinateAccessor
            ? (coordinateAccessor.getElement(vertexIndex, [0, 0]) as Point2)
            : ([0, 0] as Point2),
        );
        const fill = resolveTriangleColor(
          factor,
          texture && coordinateAccessor ? texture : undefined,
          coordinates,
          triangleBrightness(worldPoints),
        );
        triangles.push({
          ...fill,
          depth: projected.reduce((total, point) => total + point[2], 0),
          points: projected.map(([x, y]) => [x, y]),
        });
      }
    }
  }
  let xMin = Infinity;
  let xMax = -Infinity;
  let yMin = Infinity;
  let yMax = -Infinity;
  for (const triangle of triangles) {
    for (const point of triangle.points) {
      xMin = Math.min(xMin, point[0]);
      xMax = Math.max(xMax, point[0]);
      yMin = Math.min(yMin, point[1]);
      yMax = Math.max(yMax, point[1]);
    }
  }
  const scale = 240 / Math.max(xMax - xMin, yMax - yMin, 0.01);
  const shapes = triangles
    .sort((left, right) => left.depth - right.depth)
    .map((triangle) => {
      const svgPoints = triangle.points
        .map(
          (point) =>
            `${160 + (point[0] - (xMin + xMax) / 2) * scale},${160 + (point[1] - (yMin + yMax) / 2) * scale}`,
        )
        .join(" ");
      return `<polygon points="${svgPoints}" fill="${triangle.color}" fill-opacity="${triangle.opacity}" stroke="${triangle.color}" stroke-opacity="${triangle.opacity}" stroke-width="0.35" stroke-linejoin="round"/>`;
    })
    .join("");
  return sharp(
    Buffer.from(
      `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="320"><rect width="320" height="320" fill="#0c2024"/><ellipse cx="160" cy="267" rx="86" ry="16" fill="#061316" opacity="0.55"/>${shapes}</svg>`,
    ),
  )
    .png()
    .toBuffer();
}
