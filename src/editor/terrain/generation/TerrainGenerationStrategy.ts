import type { TerrainHeightField } from "../../../core/world/terrain/TerrainHeightField";
import type { TerrainGenerationContext } from "./TerrainGenerationContext";

/**
 * Контракт Strategy для генерации исходного heightfield.
 *
 * Каждая реализация отвечает только за первичный профиль рельефа. Общие
 * пост-обработчики высоты применяются отдельно через TerrainHeightModifier.
 */
export interface TerrainGenerationStrategy {
  /** Стабильный id, который хранится в descriptor generator.strategy. */
  readonly id: string;

  /** Создает heightfield по уже нормализованному контексту генерации. */
  generate(context: TerrainGenerationContext): TerrainHeightField;
}
