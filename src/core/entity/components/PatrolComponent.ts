import type { Component } from "../Component";
import { HexCell } from "../../hex/HexCell";

/**
 * Stores minimal local patrol state for autonomous NPC movement.
 */
export class PatrolComponent implements Component {
  /** Patrol anchor used as the center point for candidate destinations. */
  public anchorCell: HexCell | null;

  /** Maximum hex distance from anchor for patrol destinations. */
  public radiusCells: number;

  /** Active patrol destination cell currently assigned to movement. */
  public currentPatrolTargetCell: HexCell | null;

  /** Number of random picks attempted when finding a valid patrol destination. */
  public maxCandidateAttempts: number;

  public constructor(radiusCells: number, maxCandidateAttempts = 8) {
    this.anchorCell = null;
    this.radiusCells = radiusCells;
    this.currentPatrolTargetCell = null;
    this.maxCandidateAttempts = maxCandidateAttempts;
  }
}
