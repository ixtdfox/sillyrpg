import { Vector3, type TransformNode } from "@babylonjs/core";
import type { TerrainHeightField } from "../TerrainHeightField";
import type { TerrainQuadtreeNode } from "./TerrainQuadtreeLodTypes";

export interface TerrainQuadtreeNodeWorldBounds {
  readonly minLocal: Vector3;
  readonly maxLocal: Vector3;
  readonly worldCorners: readonly Vector3[];
}

/**
 * Builds conservative quadtree-node bounds before a patch mesh exists.
 */
export class TerrainQuadtreeBoundsBuilder {
  public buildWorldBounds(
    node: TerrainQuadtreeNode,
    heightField: TerrainHeightField,
    terrainRoot: TransformNode,
    guardWorldPadding: number,
    maxHeightPadding: number
  ): TerrainQuadtreeNodeWorldBounds {
    const scaling = terrainRoot.absoluteScaling ?? Vector3.One();
    const horizontalScale = Math.max(0.0001, (Math.abs(scaling.x) + Math.abs(scaling.z)) * 0.5);
    const verticalScale = Math.max(0.0001, Math.abs(scaling.y));
    const horizontalPaddingLocal = Math.max(0, guardWorldPadding) / horizontalScale;
    const verticalPaddingLocal = Math.max(0, maxHeightPadding) / verticalScale;
    const halfX = node.sizeWorldX * 0.5;
    const halfZ = node.sizeWorldZ * 0.5;
    const minLocal = new Vector3(
      node.centerLocalX - halfX - horizontalPaddingLocal,
      heightField.minHeight - verticalPaddingLocal,
      node.centerLocalZ - halfZ - horizontalPaddingLocal
    );
    const maxLocal = new Vector3(
      node.centerLocalX + halfX + horizontalPaddingLocal,
      heightField.maxHeight + verticalPaddingLocal,
      node.centerLocalZ + halfZ + horizontalPaddingLocal
    );
    const worldMatrix = terrainRoot.computeWorldMatrix(true);
    const worldCorners = [
      new Vector3(minLocal.x, minLocal.y, minLocal.z),
      new Vector3(maxLocal.x, minLocal.y, minLocal.z),
      new Vector3(minLocal.x, maxLocal.y, minLocal.z),
      new Vector3(maxLocal.x, maxLocal.y, minLocal.z),
      new Vector3(minLocal.x, minLocal.y, maxLocal.z),
      new Vector3(maxLocal.x, minLocal.y, maxLocal.z),
      new Vector3(minLocal.x, maxLocal.y, maxLocal.z),
      new Vector3(maxLocal.x, maxLocal.y, maxLocal.z)
    ].map((corner) => Vector3.TransformCoordinates(corner, worldMatrix));

    return {
      minLocal,
      maxLocal,
      worldCorners
    };
  }

  public computeHorizontalDistanceToNodeAabb(
    node: TerrainQuadtreeNode,
    anchorLocal: Vector3,
    horizontalWorldScale = 1
  ): number {
    const halfX = node.sizeWorldX * 0.5;
    const halfZ = node.sizeWorldZ * 0.5;
    const minX = node.centerLocalX - halfX;
    const maxX = node.centerLocalX + halfX;
    const minZ = node.centerLocalZ - halfZ;
    const maxZ = node.centerLocalZ + halfZ;
    const dx = anchorLocal.x < minX ? minX - anchorLocal.x : anchorLocal.x > maxX ? anchorLocal.x - maxX : 0;
    const dz = anchorLocal.z < minZ ? minZ - anchorLocal.z : anchorLocal.z > maxZ ? anchorLocal.z - maxZ : 0;
    return Math.sqrt((dx * dx) + (dz * dz)) * Math.max(0.0001, horizontalWorldScale);
  }
}
