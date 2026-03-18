import { Vector3 } from "@babylonjs/core";
import type { Component } from "../Component";
import { HexCell } from "../../hex/HexCell";

/**
 * Stores runtime path/motion state for hex-based movement.
 */
export class HexPathMovementComponent implements Component {
  /** Configured movement speed in world units per second. */
  public speed: number;

  /** Current world-space velocity while moving along a step. */
  public velocity: Vector3;

  /** Current normalized travel direction in world-space. */
  public direction: Vector3;

  /** Precomputed path cells from start to destination (inclusive). */
  public pathCells: HexCell[];

  /** Index of the next path cell to reach. */
  public nextStepIndex: number;

  /** True while actively traversing a path. */
  public isMoving: boolean;

  /**
   * Creates path-based movement state.
   *
   * @param speed - Movement speed in world units per second.
   */
  public constructor(speed: number) {
    this.speed = speed;
    this.velocity = Vector3.Zero();
    this.direction = Vector3.Zero();
    this.pathCells = [];
    this.nextStepIndex = 0;
    this.isMoving = false;
  }

  /**
   * Clears any active path and resets runtime movement vectors.
   */
  public resetPathState(): void {
    this.pathCells = [];
    this.nextStepIndex = 0;
    this.isMoving = false;
    this.velocity.setAll(0);
    this.direction.setAll(0);
  }
}
