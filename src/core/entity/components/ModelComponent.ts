import type { Component } from "../Component";

/**
 * Stores the model asset path used to spawn an entity in a Babylon scene.
 */
export class ModelComponent implements Component {
  /** Relative path to the model asset. */
  public readonly assetPath: string;

  /**
   * Creates a model component.
   *
   * @param assetPath - Relative path to model file.
   */
  public constructor(assetPath: string) {
    this.assetPath = assetPath;
  }
}
