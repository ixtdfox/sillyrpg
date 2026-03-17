import type { Component } from "../Component";
import type { ModelDefinition } from "../../model/ModelDefinition";

/**
 * Stores the visual model definition used to spawn an entity.
 */
export class ModelComponent implements Component {
  /** Visual model specification for this entity. */
  public readonly definition: ModelDefinition;

  /**
   * Creates a model component.
   *
   * @param definition - Full visual model definition.
   */
  public constructor(definition: ModelDefinition) {
    this.definition = definition;
  }
}
