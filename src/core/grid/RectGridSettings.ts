import { RECT_TILE_SIZE } from "./WorldGridConstants";

/**
 * Настройки runtime-системы прямоугольной сетки.
 */
export interface RectGridSettings {
  /** Размер прямоугольного тайла в мировых единицах. */
  readonly tileSize: number;

  /** Вертикальный offset overlay, чтобы debug-плоскости не мерцали с землей. */
  readonly overlayVerticalOffset: number;

  /** Начальное состояние видимости debug-сетки. */
  readonly debugEnabledByDefault: boolean;
}

/**
 * Настройки тактической grid-системы по умолчанию.
 *
 * `tileSize` намеренно берется из world-grid constants: так runtime overlay,
 * pathfinding и generated building modules остаются в одном масштабе.
 */
export const DEFAULT_RECT_GRID_SETTINGS: RectGridSettings = {
  tileSize: RECT_TILE_SIZE,
  overlayVerticalOffset: 0.06,
  debugEnabledByDefault: false,
};
