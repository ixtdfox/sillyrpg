import type { TerrainGenerationContext } from "./TerrainGenerationContext";
import type { TerrainHeightField } from "./TerrainHeightField";

export interface TerrainHeightModifier {
  readonly id: string;
  apply(heightField: TerrainHeightField, context: TerrainGenerationContext): TerrainHeightField;
}
