import { Vector3 } from "@babylonjs/core";
import type { Component } from "../Component";

/**
 * Stores an entity's world-space position.
 */
export class PositionComponent implements Component {
  /** World-space position. */
  public value: Vector3;

  /**
   * Creates a position component.
   *
   * @param value - World-space position.
   */
  public constructor(value: Vector3) {
    this.value = value;
  }
}
