import { Vector3 } from "@babylonjs/core";
import type { Component } from "../Component";

/**
 * Stores an entity's world-space transform data.
 */
export class TransformComponent implements Component {
  /** World-space position. */
  public value: Vector3;

  /** World-space Euler rotation. */
  public rotation: Vector3;

  /**
   * Creates a transform component.
   *
   * @param value - World-space position.
   * @param rotation - World-space Euler rotation.
   */
  public constructor(value: Vector3, rotation: Vector3 = Vector3.Zero()) {
    this.value = value;
    this.rotation = rotation;
  }
}
