import { Vector3 } from "@babylonjs/core";
import type { Component } from "../Component";
import { GridCell } from "../../grid/GridCell";
import type { MovementSegment } from "../../navigation/NavigationGraph";

/**
 * Stores runtime path/motion state for grid-based movement.
 */
export class GridPathMovementComponent implements Component {
  /** Configured movement speed in world units per second. */
  public speed: number;

  /** Current world-space velocity while moving along a step. */
  public velocity: Vector3;

  /** Current normalized travel direction in world-space. */
  public direction: Vector3;

  /** Precomputed path cells from start to destination (inclusive). */
  public pathCells: GridCell[];

  /** Index of the next path cell to reach. */
  public nextStepIndex: number;

  /** Precomputed multi-floor movement segments. */
  public pathSegments: MovementSegment[];

  /** Index of the current movement segment. */
  public currentSegmentIndex: number;

  /** Index of the next route point inside the current movement segment. */
  public currentPointIndex: number;

  /** Destination cell for the active precomputed path. */
  public activeTargetCell: GridCell | null;

  /** Destination story for the active precomputed path. */
  public activeTargetStoryIndex: number | null;

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
    this.pathSegments = [];
    this.currentSegmentIndex = 0;
    this.currentPointIndex = 0;
    this.activeTargetCell = null;
    this.activeTargetStoryIndex = null;
    this.isMoving = false;
  }

  /**
   * Clears any active path and resets runtime movement vectors.
   */
  public resetPathState(): void {
    this.pathCells = [];
    this.nextStepIndex = 0;
    this.pathSegments = [];
    this.currentSegmentIndex = 0;
    this.currentPointIndex = 0;
    this.activeTargetCell = null;
    this.activeTargetStoryIndex = null;
    this.isMoving = false;
    this.velocity.setAll(0);
    this.direction.setAll(0);
  }
}
