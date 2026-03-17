/**
 * Configuration used to normalize imported model sizes.
 */
export interface NormalizationConfig {
  /** Currently supported normalization mode. */
  mode?: "height";

  /** Target model height in world-space meters. */
  targetHeight?: number;

  /** Align the model so the lowest Y sits on ground level after scaling. */
  grounded?: boolean;
}

/**
 * Axis-aligned dimensions of a model.
 */
export interface ModelBounds {
  width: number;
  height: number;
  depth: number;
}

/**
 * Debug output from normalization operations.
 */
export interface NormalizationResult {
  scaleFactor: number;
  originalBounds: ModelBounds;
  normalizedBounds: ModelBounds;
}
