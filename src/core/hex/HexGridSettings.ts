import { HEX_OUTER_RADIUS } from "./WorldGridConstants";

/**
 * Runtime settings for the logical hex ground system.
 */
export interface HexGridSettings {
  /** Hex outer radius in world units: center to corner, not diameter. */
  readonly hexSize: number;

  /** Vertical overlay offset to avoid z-fighting. */
  readonly overlayVerticalOffset: number;

  /** Initial state of debug grid visibility. */
  readonly debugEnabledByDefault: boolean;
}

/**
 * Default settings for tactical ground grid.
 *
 * `hexSize` intentionally comes from world-grid constants so the game hex overlay
 * stays aligned with the generated building tile/module size.
 */
export const DEFAULT_HEX_GRID_SETTINGS: HexGridSettings = {
  hexSize: HEX_OUTER_RADIUS,
  overlayVerticalOffset: 0.06,
  debugEnabledByDefault: false,
};
