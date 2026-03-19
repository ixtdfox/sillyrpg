import type { Component } from "../Component";
import type { DetectableKind } from "./DetectableKinds";

/**
 * Marks an entity as eligible for perception systems.
 */
export class DetectableComponent implements Component {
  /** Category label for debugging/analytics. */
  public kind: DetectableKind | string;

  /** Whether this entity is currently visible to perception checks. */
  public isVisible: boolean;

  /**
   * Creates a detectable marker.
   */
  public constructor(kind: DetectableKind | string, isVisible = true) {
    this.kind = kind;
    this.isVisible = isVisible;
  }
}
