import type { Component } from "../Component";
import { HexCell } from "../../hex/HexCell";

/**
 * Stores tactical hex occupancy and movement intent for an entity.
 */
export class HexPositionComponent implements Component {
  /** Hex cell currently occupied by this entity. */
  public currentCell: HexCell;

  /** Building story currently occupied by this entity. */
  public currentStoryIndex: number;

  /** Optional target hex cell requested by gameplay input/AI. */
  public targetCell: HexCell | null;

  /** Optional target story requested by gameplay input/AI. */
  public targetStoryIndex: number | null;

  /**
   * Creates a hex-position component.
   *
   * @param currentCell - Current occupied hex cell.
   * @param currentStoryIndex - Current building story index.
   * @param targetCell - Optional destination hex cell.
   * @param targetStoryIndex - Optional destination story index.
   */
  public constructor(
    currentCell: HexCell,
    currentStoryIndex = 0,
    targetCell: HexCell | null = null,
    targetStoryIndex: number | null = null
  ) {
    this.currentCell = currentCell;
    this.currentStoryIndex = currentStoryIndex;
    this.targetCell = targetCell;
    this.targetStoryIndex = targetStoryIndex;
  }
}
