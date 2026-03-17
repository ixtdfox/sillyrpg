import { TransformNode, Vector3 } from "@babylonjs/core";
import type { ModelBounds } from "./types";

/**
 * Computes aggregate world-space bounds from all child meshes.
 */
export function computeAggregateModelBounds(root: TransformNode): ModelBounds | null {
  const childMeshes = root.getChildMeshes(false);

  if (childMeshes.length === 0) {
    return null;
  }

  const min = new Vector3(Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY);
  const max = new Vector3(Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY);

  for (const mesh of childMeshes) {
    mesh.computeWorldMatrix(true);
    const boundingInfo = mesh.getBoundingInfo();

    min.copyFrom(Vector3.Minimize(min, boundingInfo.boundingBox.minimumWorld));
    max.copyFrom(Vector3.Maximize(max, boundingInfo.boundingBox.maximumWorld));
  }

  if (
    !Number.isFinite(min.x) ||
    !Number.isFinite(min.y) ||
    !Number.isFinite(min.z) ||
    !Number.isFinite(max.x) ||
    !Number.isFinite(max.y) ||
    !Number.isFinite(max.z)
  ) {
    return null;
  }

  return {
    width: Math.max(0, max.x - min.x),
    height: Math.max(0, max.y - min.y),
    depth: Math.max(0, max.z - min.z)
  };
}

/**
 * Returns the lowest world-space Y point across all child meshes.
 */
export function computeLowestPointY(root: TransformNode): number | null {
  const childMeshes = root.getChildMeshes(false);

  if (childMeshes.length === 0) {
    return null;
  }

  let lowestY = Number.POSITIVE_INFINITY;

  for (const mesh of childMeshes) {
    mesh.computeWorldMatrix(true);
    const boundingInfo = mesh.getBoundingInfo();
    lowestY = Math.min(lowestY, boundingInfo.boundingBox.minimumWorld.y);
  }

  return Number.isFinite(lowestY) ? lowestY : null;
}
