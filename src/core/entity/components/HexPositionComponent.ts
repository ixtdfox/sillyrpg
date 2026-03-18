import type { Component } from "../Component";
import { HexCell } from "../../hex/HexCell";

/**
 * Stores tactical hex occupancy and movement intent for an entity.
 */
export class HexPositionComponent implements Component {
  /** Hex cell currently occupied by this entity. */
  public currentCell: HexCell;

  /** Optional target hex cell requested by gameplay input/AI. */
  public targetCell: HexCell | null;

  /**
   * Creates a hex-position component.
   *
   * @param currentCell - Current occupied hex cell.
   * @param targetCell - Optional destination hex cell.
   */
  public constructor(currentCell: HexCell, targetCell: HexCell | null = null) {
    this.currentCell = currentCell;
    this.targetCell = targetCell;
  }
}
