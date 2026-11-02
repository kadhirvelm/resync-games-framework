import { Document, NodeIO } from "@gltf-transform/core";
import type {
  ThreeDAssetKind,
  ThreeDDesign,
  ThreeDPart,
} from "@resync-game-framework/api";
import { THREE_D_CHARACTER_ANIMATIONS } from "@resync-game-framework/api";
import { threeDDesignSchema } from "./threeDSchemas";

/**
 * Builds flat-shaded box or octagonal cylinder triangles in local unit space.
 * @param shape - Safe primitive kind
 * @returns Unindexed positions and per-face unit normals
 */
function geometry(shape: ThreeDPart["shape"]): {
  positions: number[];
  normals: number[];
} {
  const positions: number[] = [];
  const normals: number[] = [];
  const sides = shape === "box" ? 4 : 8;
  const radius = shape === "box" ? Math.SQRT1_2 : 0.5;
  const offset = shape === "box" ? Math.PI / 4 : 0;
  const ring = Array.from({ length: sides }, (_, i) => [
    Math.cos((i * Math.PI * 2) / sides + offset) * radius,
    Math.sin((i * Math.PI * 2) / sides + offset) * radius,
  ]);
  /** Adds a counter-clockwise triangle and its face normal. */
  const triangle = (
    a: number[],
    b: number[],
    c: number[],
    normal: number[],
  ) => {
    positions.push(...a, ...b, ...c);
    normals.push(...normal, ...normal, ...normal);
  };
  for (let i = 0; i < sides; i += 1) {
    const [x, z] = ring[i] as [number, number];
    const [nx, nz] = ring[(i + 1) % sides] as [number, number];
    const length = Math.hypot(x + nx, z + nz);
    const normal = [(x + nx) / length, 0, (z + nz) / length];
    triangle([x, -0.5, z], [x, 0.5, z], [nx, 0.5, nz], normal);
    triangle([x, -0.5, z], [nx, 0.5, nz], [nx, -0.5, nz], normal);
    triangle([0, 0.5, 0], [nx, 0.5, nz], [x, 0.5, z], [0, 1, 0]);
    triangle([0, -0.5, 0], [x, -0.5, z], [nx, -0.5, nz], [0, -1, 0]);
  }
  return { normals, positions };
}

/**
 * Compiles a validated structured design into a self-contained GLB. Character
 * vertices are rigidly weighted to six independently animated rig joints.
 * @param rawDesign - Model design, validated again at this trust boundary
 * @param kind - Asset animation contract to apply
 * @returns Embedded-buffer GLB bytes
 */
export async function compileThreeDDesign(
  rawDesign: ThreeDDesign,
  kind: ThreeDAssetKind,
): Promise<Uint8Array> {
  const design = threeDDesignSchema.parse(rawDesign);
  const doc = new Document();
  const buffer = doc.createBuffer();
  const scene = doc.createScene(design.name);
  const root = doc.createNode(design.name);
  scene.addChild(root);
  const joints = ["body", "head", "leftArm", "rightArm", "leftLeg", "rightLeg"];
  const rig = joints.map((name) => doc.createNode(name));
  const skin = doc.createSkin("coreborn-rig");
  if (kind === "character") {
    const pivots = joints.map((name) => {
      const parts = design.parts.filter((part) => part.joint === name);
      const count = Math.max(1, parts.length);
      return [0, 1, 2].map(
        (axis) =>
          parts.reduce((sum, part) => sum + (part.position[axis] ?? 0), 0) /
          count,
      ) as [number, number, number];
    });
    for (const [index, joint] of rig.entries()) {
      joint.setTranslation(pivots[index] ?? [0, 0, 0]);
      root.addChild(joint);
      skin.addJoint(joint);
    }
    skin.setSkeleton(root);
    const matrices = pivots.flatMap(([x, y, z]) => [
      1,
      0,
      0,
      0,
      0,
      1,
      0,
      0,
      0,
      0,
      1,
      0,
      -x,
      -y,
      -z,
      1,
    ]);
    skin.setInverseBindMatrices(
      doc
        .createAccessor()
        .setType("MAT4")
        .setArray(new Float32Array(matrices))
        .setBuffer(buffer),
    );
  } else {
    skin.dispose();
    for (const joint of rig) joint.dispose();
  }
  for (const part of design.parts) {
    const meshGeometry = geometry(part.shape);
    const positions = meshGeometry.positions.map(
      (value, i) =>
        value * (part.scale[i % 3] ?? 1) + (part.position[i % 3] ?? 0),
    );
    const vertexCount = positions.length / 3;
    const color = [1, 3, 5].map(
      (index) => Number.parseInt(part.color.slice(index, index + 2), 16) / 255,
    );
    const material = doc
      .createMaterial(part.name)
      .setBaseColorFactor([color[0] ?? 0, color[1] ?? 0, color[2] ?? 0, 1])
      .setMetallicFactor(0)
      .setRoughnessFactor(0.85);
    const primitive = doc
      .createPrimitive()
      .setMaterial(material)
      .setAttribute(
        "POSITION",
        doc
          .createAccessor()
          .setType("VEC3")
          .setArray(new Float32Array(positions))
          .setBuffer(buffer),
      )
      .setAttribute(
        "NORMAL",
        doc
          .createAccessor()
          .setType("VEC3")
          .setArray(new Float32Array(meshGeometry.normals))
          .setBuffer(buffer),
      );
    const node = doc
      .createNode(part.name)
      .setMesh(doc.createMesh(part.name).addPrimitive(primitive));
    if (kind === "character") {
      const jointIndex = joints.indexOf(part.joint);
      primitive.setAttribute(
        "JOINTS_0",
        doc
          .createAccessor()
          .setType("VEC4")
          .setArray(
            new Uint16Array(
              Array.from({ length: vertexCount }, () => [
                jointIndex,
                0,
                0,
                0,
              ]).flat(),
            ),
          )
          .setBuffer(buffer),
      );
      primitive.setAttribute(
        "WEIGHTS_0",
        doc
          .createAccessor()
          .setType("VEC4")
          .setArray(
            new Float32Array(
              Array.from({ length: vertexCount }, () => [1, 0, 0, 0]).flat(),
            ),
          )
          .setBuffer(buffer),
      );
      node.setSkin(skin);
    }
    if (kind === "character") scene.addChild(node);
    else root.addChild(node);
  }
  if (kind === "character") {
    for (const clip of THREE_D_CHARACTER_ANIMATIONS) {
      const animation = doc.createAnimation(clip);
      for (const [index, joint] of rig.entries()) {
        let amount = 0.025;
        if (clip === "walk") amount = index % 2 === 0 ? 0.28 : -0.28;
        if (clip === "attack") amount = index === 3 ? -0.9 : 0.08;
        if (clip === "hit") amount = -0.15;
        if (clip === "death") amount = Math.PI / 2;
        const middle = [Math.sin(amount / 2), 0, 0, Math.cos(amount / 2)];
        const end = clip === "death" ? middle : [0, 0, 0, 1];
        const sampler = doc
          .createAnimationSampler()
          .setInput(
            doc
              .createAccessor()
              .setType("SCALAR")
              .setArray(new Float32Array([0, 0.5, 1]))
              .setBuffer(buffer),
          )
          .setOutput(
            doc
              .createAccessor()
              .setType("VEC4")
              .setArray(new Float32Array([0, 0, 0, 1, ...middle, ...end]))
              .setBuffer(buffer),
          )
          .setInterpolation("LINEAR");
        animation
          .addSampler(sampler)
          .addChannel(
            doc
              .createAnimationChannel()
              .setTargetNode(joint)
              .setTargetPath("rotation")
              .setSampler(sampler),
          );
      }
    }
  }
  return new NodeIO().writeBinary(doc);
}

/**
 * Returns a complete curated fallback for each asset kind without model calls.
 * @param kind - Model type
 * @returns An editable sample design
 */
export function demoThreeDDesign(kind: ThreeDAssetKind): ThreeDDesign {
  /** Creates a named part with a rig mapping. */
  const part = (
    name: string,
    position: ThreeDPart["position"],
    scale: ThreeDPart["scale"],
    color: string,
    joint: ThreeDPart["joint"] = "body",
    shape: ThreeDPart["shape"] = "box",
  ): ThreeDPart => ({ color, joint, name, position, scale, shape });
  if (kind === "character")
    return {
      name: "Jade Wanderer",
      parts: [
        part("robe", [0, 1, 0], [0.7, 0.8, 0.45], "#438c79"),
        part("head", [0, 1.65, 0], [0.42, 0.42, 0.42], "#eac09b", "head"),
        part(
          "left arm",
          [-0.5, 1.05, 0],
          [0.23, 0.75, 0.25],
          "#b6b3a0",
          "leftArm",
        ),
        part(
          "right arm",
          [0.5, 1.05, 0],
          [0.23, 0.75, 0.25],
          "#b6b3a0",
          "rightArm",
        ),
        part(
          "left leg",
          [-0.2, 0.35, 0],
          [0.26, 0.7, 0.3],
          "#273e48",
          "leftLeg",
        ),
        part(
          "right leg",
          [0.2, 0.35, 0],
          [0.26, 0.7, 0.3],
          "#273e48",
          "rightLeg",
        ),
      ],
    };
  if (kind === "environment")
    return {
      name: "Aether Garden",
      parts: [
        part("floor", [0, -0.2, 0], [18, 0.4, 18], "#304f4a"),
        ...[-7, 7].flatMap((x) =>
          [-7, 7].map((z) =>
            part(
              `pillar ${x} ${z}`,
              [x, 1.5, z],
              [1, 3, 1],
              "#7caa95",
              "body",
              "cylinder",
            ),
          ),
        ),
      ],
    };
  return {
    name: "Aether Beacon",
    parts: [
      part("base", [0, 0.2, 0], [1.8, 0.4, 1.8], "#406c64", "body", "cylinder"),
      part("pedestal", [0, 0.7, 0], [0.8, 0.6, 0.8], "#83b4a5"),
      part(
        "crystal",
        [0, 1.3, 0],
        [0.45, 0.7, 0.45],
        "#9beedd",
        "body",
        "cylinder",
      ),
    ],
  };
}
