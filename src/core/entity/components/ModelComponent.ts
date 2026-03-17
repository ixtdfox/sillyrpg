import type { Component } from "../Component";
import type { NormalizationConfig } from "../../model/normalization";

/**
 * Stores the model asset path used to spawn an entity in a Babylon scene.
 */
export class ModelComponent implements Component {
  /** Relative path to the model asset. */
  public readonly assetPath: string;

  /** Optional model normalization settings applied during load. */
  public readonly normalization?: NormalizationConfig;

  /**
   * Creates a model component.
   *
   * @param assetPath - Relative path to model file.
   * @param normalization - Optional normalization rules for this model.
   */
  public constructor(assetPath: string, normalization?: NormalizationConfig) {
    this.assetPath = assetPath;
    this.normalization = normalization;
  }
}
