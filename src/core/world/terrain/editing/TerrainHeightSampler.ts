import type { TerrainBrushCenter } from "./TerrainBrushTypes";
import type { TerrainHeightField } from "../TerrainHeightField";

export class TerrainHeightSampler {
  public sampleNearest(field: TerrainHeightField, center: TerrainBrushCenter): number {
    const { ix, iz } = this.resolveNearestVertex(field, center);
    return field.getHeight(ix, iz);
  }

  public resolveNearestVertex(field: TerrainHeightField, center: TerrainBrushCenter): { ix: number; iz: number } {
    const normalizedX = clamp01(center.x / Math.max(0.0001, field.width) + 0.5);
    const normalizedZ = clamp01(0.5 - center.z / Math.max(0.0001, field.depth));
    return {
      ix: clampIndex(Math.round(normalizedX * (field.resolutionX - 1)), field.resolutionX),
      iz: clampIndex(Math.round(normalizedZ * (field.resolutionZ - 1)), field.resolutionZ)
    };
  }
}

function clampIndex(value: number, size: number): number {
  return Math.max(0, Math.min(size - 1, value));
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.max(0, Math.min(1, value));
}
