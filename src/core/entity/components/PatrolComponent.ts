import type { Component } from "../Component";
import { GridCell } from "../../grid/GridCell";

/**
 * Stores minimal local patrol state for autonomous NPC movement.
 */
export class PatrolComponent implements Component {
  /** Patrol anchor used as the center point for candidate destinations. */
  public anchorCell: GridCell | null;

  /** Maximum grid distance from anchor for patrol destinations. */
  public radiusCells: number;

  /** Active patrol destination cell currently assigned to movement. */
  public currentPatrolTargetCell: GridCell | null;

  /** Number of random picks attempted when finding a valid patrol destination. */
  public maxCandidateAttempts: number;

  public constructor(radiusCells: number, maxCandidateAttempts = 8) {
    this.anchorCell = null;
    this.radiusCells = radiusCells;
    this.currentPatrolTargetCell = null;
    this.maxCandidateAttempts = maxCandidateAttempts;
  }
}
