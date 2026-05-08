import type { TerrainHeightField } from "./TerrainHeightField";
import type { TerrainGenerationContext } from "./TerrainGenerationContext";

export interface TerrainGenerationStrategy {
  readonly id: string;
  generate(context: TerrainGenerationContext): TerrainHeightField;
}
