import type { TerrainBrushCenter } from "./TerrainBrushTypes";
import type { TerrainHeightField } from "../../../core/world/terrain/TerrainHeightField";
import { TerrainIndexMath, TerrainScalarMath } from "../../../core/world/terrain/TerrainMath";

/**
 * Sampler высот для terrain editing tools.
 */
export class TerrainHeightSampler {
  private readonly scalarMath: TerrainScalarMath;
  private readonly indexMath: TerrainIndexMath;

  public constructor(
    scalarMath = new TerrainScalarMath(),
    indexMath = new TerrainIndexMath(scalarMath)
  ) {
    this.scalarMath = scalarMath;
    this.indexMath = indexMath;
  }

  /**
   * Читает высоту ближайшей вершины к brush center.
   */
  public sampleNearest(field: TerrainHeightField, center: TerrainBrushCenter): number {
    const { ix, iz } = this.resolveNearestVertex(field, center);
    return field.getHeight(ix, iz);
  }

  /**
   * Преобразует локальные координаты кисти в ближайший индекс вершины.
   */
  public resolveNearestVertex(field: TerrainHeightField, center: TerrainBrushCenter): { ix: number; iz: number } {
    const normalizedX = this.scalarMath.clamp01(center.x / Math.max(0.0001, field.width) + 0.5);
    const normalizedZ = this.scalarMath.clamp01(0.5 - center.z / Math.max(0.0001, field.depth));
    return {
      ix: this.indexMath.clampIndex(Math.round(normalizedX * (field.resolutionX - 1)), field.resolutionX),
      iz: this.indexMath.clampIndex(Math.round(normalizedZ * (field.resolutionZ - 1)), field.resolutionZ)
    };
  }
}
