/**
 * Размер одного generated floor/wall модуля в мировых единицах.
 *
 * Общий контракт с procedural_floorplan_ru_v2/game_grid.py:
 * 1 Blender meter = 1 Babylon world unit.
 * 1 building tile/module = 1 game grid tile diameter.
 * Толщина стен считается визуальной геометрией и не меняет логический размер сетки.
 */
export const WORLD_TILE_SIZE = 1.0;
export const WORLD_TILE_SIZE_M = WORLD_TILE_SIZE;

/**
 * Диаметр grid tile в XZ-плоскости должен совпадать с building tile.
 *
 * Сейчас RectGrid хранит tileSize как полный размер клетки, поэтому tactical
 * сетка прямо совпадает с 1m module из генератора.
 */
export const RECT_TILE_SIZE = WORLD_TILE_SIZE;

/**
 * Общий origin логической grid-системы для всех потребителей core.
 *
 * Превью Blender рисует тот же origin в Blender X/Y, который после export
 * мапится в game X/Z. AABB земли только ограничивает количество клеток, но не
 * переносит контракт координат.
 */
export const WORLD_GRID_ORIGIN_X = 0;
export const WORLD_GRID_ORIGIN_Y = 0;
export const WORLD_GRID_ORIGIN_Z = 0;
export const WORLD_VERTICAL_TILE_SIZE = WORLD_TILE_SIZE;
