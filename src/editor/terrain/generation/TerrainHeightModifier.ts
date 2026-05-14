import type { TerrainGenerationContext } from "./TerrainGenerationContext";
import type { TerrainHeightField } from "../../../core/world/terrain/TerrainHeightField";

/**
 * Контракт Chain of Responsibility для пост-обработки generated heightfield.
 *
 * Modifier получает immutable входной TerrainHeightField и возвращает либо его,
 * либо новый экземпляр с измененными высотами.
 */
export interface TerrainHeightModifier {
  /** Стабильный id шага пост-обработки для диагностики и тестов. */
  readonly id: string;

  /** Применяет доменную трансформацию к высотам terrain. */
  apply(heightField: TerrainHeightField, context: TerrainGenerationContext): TerrainHeightField;
}
