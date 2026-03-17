import { Vector3 } from "@babylonjs/core";
import type { Component } from "../Component";

/**
 * Stores movement velocity used by movement update systems.
 */
export class MovementComponent implements Component {
  /** Velocity in units per second. */
  public velocity: Vector3;

  /**
   * Creates a movement component.
   *
   * @param velocity - Velocity in units per second.
   */
  public constructor(velocity: Vector3) {
    this.velocity = velocity;
  }
}
