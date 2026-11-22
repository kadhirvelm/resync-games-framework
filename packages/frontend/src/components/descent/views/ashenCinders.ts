import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { CreateDisc } from "@babylonjs/core/Meshes/Builders/discBuilder";
import { CreatePlane } from "@babylonjs/core/Meshes/Builders/planeBuilder";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import type { Scene } from "@babylonjs/core/scene";

/** How many cinder birds circle the rim. */
const FLOCK_SIZE = 7;

/** World position and wing beat of one circling cinder bird. */
export interface CinderBirdPose {
  /** Seconds into the flight loop. */
  time: number;
  /** Rim circle centre. */
  centerX: number;
  /** Rim circle centre depth. */
  centerZ: number;
  /** Circle radius in world units. */
  radius: number;
  /** Per-bird phase offset so the flock is not a single shape. */
  phase: number;
  /** Cruise height above the plateau. */
  height: number;
}

/**
 * Deterministic pose of one cinder bird at a moment. Pure so the flock
 * motion is unit-testable without a WebGL context.
 * @param pose - Bird flight parameters
 * @returns Position, heading in radians, and wing flap angle in radians
 */
export function cinderBirdFrame(pose: CinderBirdPose): {
  x: number;
  y: number;
  z: number;
  heading: number;
  flap: number;
} {
  const angle = pose.time * 0.16 + pose.phase;
  return {
    flap: Math.sin(pose.time * 9 + pose.phase * 3) * 0.65,
    heading: -angle,
    x: pose.centerX + Math.cos(angle) * pose.radius,
    y: pose.height + Math.sin(pose.time * 0.5 + pose.phase) * 1.6,
    z: pose.centerZ + Math.sin(angle) * pose.radius,
  };
}

/** Handle that advances the flock once per frame. */
export interface CinderFlockHandle {
  /**
   * Moves every bird and beats its wings.
   * @param deltaMs - Milliseconds since the last frame
   */
  update: (deltaMs: number) => void;
}

/**
 * Adds a small flock of ash cinders circling the rim: dark bird silhouettes
 * with beating wings, so the sky above the Hold has some life in it.
 * @param scene - Descent battlefield
 * @param mapWidth - Playable ground width
 * @param mapHeight - Playable ground height
 * @returns Per-frame updater for the flock
 */
export function addCinderFlock(
  scene: Scene,
  mapWidth: number,
  mapHeight: number,
): CinderFlockHandle {
  const bodyMaterial = new StandardMaterial("cinder-body", scene);
  bodyMaterial.diffuseColor = Color3.FromHexString("#17110f");
  bodyMaterial.emissiveColor = Color3.FromHexString("#3d1c0c");
  bodyMaterial.specularColor = Color3.Black();

  const birds: {
    root: TransformNode;
    left: Mesh;
    right: Mesh;
    phase: number;
    radius: number;
    height: number;
  }[] = [];
  for (let index = 0; index < FLOCK_SIZE; index += 1) {
    const root = new TransformNode(`cinder-${index}`, scene);
    const body = CreateDisc(
      `cinder-body-${index}`,
      { radius: 0.16, tessellation: 6 },
      scene,
    );
    body.parent = root;
    body.material = bodyMaterial;
    body.isPickable = false;
    const left = CreatePlane(
      `cinder-wing-l-${index}`,
      { height: 0.34, width: 0.9 },
      scene,
    );
    left.parent = root;
    left.position.set(-0.45, 0, 0);
    left.material = bodyMaterial;
    left.isPickable = false;
    const right = left.clone(`cinder-wing-r-${index}`);
    right.position.x = 0.45;
    const phase = (index / FLOCK_SIZE) * Math.PI * 2;
    birds.push({
      height: 16 + (index % 4) * 2.5,
      left,
      phase,
      radius: 14 + (index % 3) * 6,
      right,
      root,
    });
  }

  let time = 0;
  return {
    update: (deltaMs: number) => {
      time += deltaMs / 1000;
      for (const bird of birds) {
        const frame = cinderBirdFrame({
          centerX: mapWidth / 2,
          centerZ: mapHeight / 2,
          height: bird.height,
          phase: bird.phase,
          radius: bird.radius + Math.min(mapWidth, mapHeight) / 2,
          time,
        });
        bird.root.position.set(frame.x, frame.y, frame.z);
        bird.root.rotation.y = frame.heading;
        bird.left.rotation.z = frame.flap;
        bird.right.rotation.z = -frame.flap;
        bird.root.rotation.z = Math.sin(time * 0.16 + bird.phase) * 0.25;
      }
    },
  };
}
