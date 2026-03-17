import { TransformNode, Vector3 } from "@babylonjs/core";
import { computeAggregateModelBounds, computeLowestPointY } from "./bounds";
import type { NormalizationConfig, NormalizationResult } from "./types";

const MIN_SOURCE_HEIGHT = 1e-5;

/**
 * Uniformly normalizes a model to the configured target size.
 */
export function normalizeModel(root: TransformNode, config: NormalizationConfig): NormalizationResult | null {
  if (config.mode !== undefined && config.mode !== "height") {
    console.warn(`Model normalization mode '${config.mode}' is unsupported.`);
    return null;
  }

  if (typeof config.targetHeight !== "number" || !Number.isFinite(config.targetHeight) || config.targetHeight <= 0) {
    console.warn("Model normalization requires a positive numeric targetHeight.");
    return null;
  }

  const originalBounds = computeAggregateModelBounds(root);

  if (!originalBounds) {
    console.warn("Model normalization skipped because no mesh bounds were found.");
    return null;
  }

  if (originalBounds.height <= MIN_SOURCE_HEIGHT) {
    console.warn(
      `Model normalization skipped because source height (${originalBounds.height}) is too small for stable scaling.`
    );
    return null;
  }

  const scaleFactor = config.targetHeight / originalBounds.height;
  root.scaling = root.scaling.multiplyByFloats(scaleFactor, scaleFactor, scaleFactor);
  root.computeWorldMatrix(true);

  if (config.grounded) {
    const lowestY = computeLowestPointY(root);

    if (lowestY !== null) {
      root.position = root.position.subtract(new Vector3(0, lowestY, 0));
      root.computeWorldMatrix(true);
    }
  }

  const normalizedBounds = computeAggregateModelBounds(root);

  if (!normalizedBounds) {
    return null;
  }

  return {
    scaleFactor,
    originalBounds,
    normalizedBounds
  };
}
