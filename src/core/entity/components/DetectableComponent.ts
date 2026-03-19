import type { Component } from "../Component";

/**
 * Marks an entity as eligible for perception systems.
 */
export class DetectableComponent implements Component {
  /** Category label for debugging/analytics. */
  public kind: string;

  /** Whether this entity is currently visible to perception checks. */
  public isVisible: boolean;

  /**
   * Creates a detectable marker.
   */
  public constructor(kind: string, isVisible = true) {
    this.kind = kind;
    this.isVisible = isVisible;
  }
}
