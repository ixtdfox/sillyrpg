import { TerrainHeightField } from "./TerrainHeightField";

export interface TerrainHeightFieldRectangle {
  readonly minX: number;
  readonly maxX: number;
  readonly minZ: number;
  readonly maxZ: number;
  readonly targetHeight: number;
  /** Extra local-space margin used to flatten boundary triangles cleanly. */
  readonly padding?: number;
}

/**
 * Applies deterministic, hard-edged height edits to a terrain heightfield.
 */
export class TerrainHeightFieldFitter {
  public flattenRectangle(field: TerrainHeightField, rectangle: TerrainHeightFieldRectangle): TerrainHeightField {
    const minX = Math.min(rectangle.minX, rectangle.maxX);
    const maxX = Math.max(rectangle.minX, rectangle.maxX);
    const minZ = Math.min(rectangle.minZ, rectangle.maxZ);
    const maxZ = Math.max(rectangle.minZ, rectangle.maxZ);
    const targetHeight = rectangle.targetHeight;
    const padding = rectangle.padding ?? 0;
    if (!Number.isFinite(targetHeight)) {
      throw new Error("TerrainHeightField rectangle targetHeight must be finite.");
    }
    if (!Number.isFinite(padding) || padding < 0) {
      throw new Error("TerrainHeightField rectangle padding must be a finite non-negative number.");
    }

    const nextHeights = field.cloneHeights();
    let changed = false;
    for (let iz = 0; iz < field.resolutionZ; iz += 1) {
      const v = field.resolutionZ <= 1 ? 0 : iz / (field.resolutionZ - 1);
      const z = (0.5 - v) * field.depth;
      if (z < minZ - padding || z > maxZ + padding) {
        continue;
      }

      for (let ix = 0; ix < field.resolutionX; ix += 1) {
        const u = field.resolutionX <= 1 ? 0 : ix / (field.resolutionX - 1);
        const x = (u - 0.5) * field.width;
        if (x < minX - padding || x > maxX + padding) {
          continue;
        }

        const index = iz * field.resolutionX + ix;
        if (nextHeights[index] === targetHeight) {
          continue;
        }
        nextHeights[index] = targetHeight;
        changed = true;
      }
    }

    return changed ? field.withHeights(nextHeights) : field;
  }
}
