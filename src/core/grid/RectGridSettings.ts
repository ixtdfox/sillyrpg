import { RECT_TILE_SIZE } from "./WorldGridConstants";

/**
 * Runtime settings for the logical grid ground system.
 */
export interface RectGridSettings {
  /** Rectangular tile size in world units. */
  readonly tileSize: number;

  /** Vertical overlay offset to avoid z-fighting. */
  readonly overlayVerticalOffset: number;

  /** Initial state of debug grid visibility. */
  readonly debugEnabledByDefault: boolean;
}

/**
 * Default settings for tactical ground grid.
 *
 * `tileSize` intentionally comes from world-grid constants so the game grid overlay
 * stays aligned with the generated building tile/module size.
 */
export const DEFAULT_RECT_GRID_SETTINGS: RectGridSettings = {
  tileSize: RECT_TILE_SIZE,
  overlayVerticalOffset: 0.06,
  debugEnabledByDefault: false,
};
