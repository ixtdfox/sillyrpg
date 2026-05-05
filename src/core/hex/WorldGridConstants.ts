/**
 * One generated building floor/wall module in world units.
 *
 * The current building generator exports 1 meter tiles/modules, so tactical grid
 * sizing is anchored here instead of duplicating raw numbers in runtime settings.
 */
export const WORLD_TILE_SIZE = 1.0;

/**
 * Hex corner-to-corner diameter on the XZ plane should match one building tile.
 *
 * HexGrid.hexSize is the outer radius (center-to-corner), so the tactical
 * hex radius is half of the generator's 1m tile/module size. The current
 * overlay orientation has an X-axis flat-to-flat width of sqrt(3) * radius.
 */
export const HEX_CORNER_TO_CORNER_WIDTH = WORLD_TILE_SIZE;
export const HEX_OUTER_RADIUS = HEX_CORNER_TO_CORNER_WIDTH / 2;
export const HEX_FLAT_TO_FLAT_WIDTH = Math.sqrt(3) * HEX_OUTER_RADIUS;
