/**
 * One generated building floor/wall module in world units.
 *
 * Shared contract with procedural_floorplan_ru_v2/game_grid.py:
 * 1 Blender meter = 1 Babylon world unit.
 * 1 building tile/module = 1 game grid tile diameter.
 * Wall thickness is visual geometry and never changes the logical grid size.
 */
export const WORLD_TILE_SIZE = 1.0;
export const WORLD_TILE_SIZE_M = WORLD_TILE_SIZE;

/**
 * Grid tile diameter on the XZ plane should match one building tile.
 *
 * RectGrid.tileSize is the tile size (center-to-corner), so the tactical
 * grid radius is half of the generator's 1m tile/module size.
 */
export const RECT_TILE_SIZE = WORLD_TILE_SIZE;

/**
 * Shared editor/runtime origin for the logical game grid.
 *
 * Blender preview draws this same origin in Blender X/Y, which maps to game X/Z
 * after export. Ground AABBs only bound how many cells are built; they do not
 * move the grid contract.
 */
export const WORLD_GRID_ORIGIN_X = 0;
export const WORLD_GRID_ORIGIN_Y = 0;
export const WORLD_GRID_ORIGIN_Z = 0;
export const WORLD_VERTICAL_TILE_SIZE = WORLD_TILE_SIZE;
