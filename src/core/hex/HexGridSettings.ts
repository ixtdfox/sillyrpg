/**
 * Runtime settings for the logical hex ground system.
 */
export interface HexGridSettings {
  /** Hex outer radius in world units. */
  readonly hexSize: number;

  /** Vertical overlay offset to avoid z-fighting. */
  readonly overlayVerticalOffset: number;

  /** Initial state of debug grid visibility. */
  readonly debugEnabledByDefault: boolean;
}

/**
 * Default settings for first-pass tactical ground grid.
 */
export const DEFAULT_HEX_GRID_SETTINGS: HexGridSettings = {
  hexSize: 1,
  overlayVerticalOffset: 0.06,
  debugEnabledByDefault: false,
};
