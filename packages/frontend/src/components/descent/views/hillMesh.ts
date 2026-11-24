import { VertexBuffer } from "@babylonjs/core/Buffers/buffer";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import { VertexData } from "@babylonjs/core/Meshes/mesh.vertexData";
import { elevationAt } from "../logic/layers/elevation";
import type { TerrainHill } from "../logic/layers/layerTypes";
import { worldZToMapY } from "./mapOrientation";

/**
 * Compact deterministic signature for a hill list so meshes only recompute
 * vertex buffers when the layer's hills actually change.
 * @param hills - Walkable hills on the current layer
 * @returns Stable string key
 */
export function hillsSignature(hills: readonly TerrainHill[]): string {
  if (hills.length === 0) return "";
  let key = `${hills.length}:`;
  for (let index = 0; index < hills.length; index += 1) {
    const hill = hills[index] as TerrainHill;
    key += `${hill.id}@${hill.x},${hill.y},${hill.radius},${hill.plateauRadius},${hill.height};`;
  }
  return key;
}

/**
 * Displaces a Babylon ground mesh's Y vertices to match the layer's walkable
 * hills, optionally recomputing smooth vertex normals for directional lighting.
 * @param mesh - Updatable Babylon ground mesh
 * @param hills - Walkable hills to sculpt into the surface
 * @param mapHeight - Playable map height used for `worldZToMapY`
 * @param recomputeNormals - Whether to recompute vertex normals for lighting
 */
export function applyHillsToGroundMesh(
  mesh: Mesh,
  hills: readonly TerrainHill[],
  mapHeight: number,
  recomputeNormals: boolean,
): void {
  const positions = mesh.getVerticesData(VertexBuffer.PositionKind);
  if (positions === null) return;
  const originX = mesh.position.x;
  const originZ = mesh.position.z;
  for (let offset = 0; offset < positions.length; offset += 3) {
    const worldX = (positions[offset] as number) + originX;
    const worldZ = (positions[offset + 2] as number) + originZ;
    const mapY = worldZToMapY(worldZ, mapHeight);
    positions[offset + 1] = elevationAt(hills, worldX, mapY);
  }
  mesh.updateVerticesData(VertexBuffer.PositionKind, positions);
  if (recomputeNormals) {
    const indices = mesh.getIndices();
    if (indices !== null) {
      const normals = new Float32Array(positions.length);
      VertexData.ComputeNormals(positions, indices, normals);
      mesh.updateVerticesData(VertexBuffer.NormalKind, normals);
    }
  }
  mesh.refreshBoundingInfo(true);
}
