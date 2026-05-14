import { WORLD_GRID_ORIGIN_Y, WORLD_VERTICAL_TILE_SIZE } from "../../../../core/grid/WorldGridConstants";
import type { TerrainGenerationContext } from "../TerrainGenerationContext";
import { TerrainHeightField } from "../../../../core/world/terrain/TerrainHeightField";
import type { TerrainHeightModifier } from "../TerrainHeightModifier";

/**
 * Политика привязки terrain heights к вертикальной world grid.
 */
export class TerrainHeightQuantizationPolicy {
  /**
   * Округляет высоту к ближайшему уровню WORLD_VERTICAL_TILE_SIZE.
   */
  public quantize(height: number): number {
    return (
      WORLD_GRID_ORIGIN_Y +
      Math.round((height - WORLD_GRID_ORIGIN_Y) / WORLD_VERTICAL_TILE_SIZE) * WORLD_VERTICAL_TILE_SIZE
    );
  }
}

/**
 * Modifier, который делает generated heights совместимыми с вертикальной grid.
 */
export class TerrainHeightQuantizeModifier implements TerrainHeightModifier {
  public readonly id = "heightQuantize";
  private readonly quantizationPolicy: TerrainHeightQuantizationPolicy;

  public constructor(quantizationPolicy = new TerrainHeightQuantizationPolicy()) {
    this.quantizationPolicy = quantizationPolicy;
  }

  /**
   * Квантует каждую высоту к WORLD_VERTICAL_TILE_SIZE.
   */
  public apply(heightField: TerrainHeightField, _context: TerrainGenerationContext): TerrainHeightField {
    const nextHeights = heightField.cloneHeights();
    for (let index = 0; index < nextHeights.length; index += 1) {
      nextHeights[index] = this.quantizationPolicy.quantize(nextHeights[index] ?? 0);
    }
    return heightField.withHeights(nextHeights);
  }
}
