import { Vector3 } from "@babylonjs/core";
import type { Component } from "../Component";

/**
 * Stores initial scene spawn transform for an entity.
 */
export class SpawnComponent implements Component {
  /** Spawn position in world coordinates. */
  public readonly position: Vector3;

  /** Spawn rotation in world coordinates. */
  public readonly rotation: Vector3;

  /**
   * Creates spawn data.
   *
   * @param position - Initial spawn position.
   * @param rotation - Initial spawn rotation.
   */
  public constructor(position: Vector3, rotation: Vector3 = Vector3.Zero()) {
    this.position = position;
    this.rotation = rotation;
  }
}
