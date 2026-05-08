import { WORLD_GRID_ORIGIN_Y, WORLD_VERTICAL_TILE_SIZE } from "../../../grid/WorldGridConstants";
import type { TerrainGenerationContext } from "../TerrainGenerationContext";
import { TerrainHeightField } from "../TerrainHeightField";
import type { TerrainHeightModifier } from "../TerrainHeightModifier";

export class TerrainHeightQuantizeModifier implements TerrainHeightModifier {
  public readonly id = "heightQuantize";

  public apply(heightField: TerrainHeightField, _context: TerrainGenerationContext): TerrainHeightField {
    const nextHeights = heightField.cloneHeights();
    for (let index = 0; index < nextHeights.length; index += 1) {
      nextHeights[index] = quantizeHeight(nextHeights[index] ?? 0);
    }
    return heightField.withHeights(nextHeights);
  }
}

function quantizeHeight(height: number): number {
  return (
    WORLD_GRID_ORIGIN_Y +
    Math.round((height - WORLD_GRID_ORIGIN_Y) / WORLD_VERTICAL_TILE_SIZE) * WORLD_VERTICAL_TILE_SIZE
  );
}
