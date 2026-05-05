import type { Component } from "../Component";
import { GridCell } from "../../grid/GridCell";

/**
 * Stores tactical grid occupancy and movement intent for an entity.
 */
export class GridPositionComponent implements Component {
  /** Grid cell currently occupied by this entity. */
  public currentCell: GridCell;

  /** Building story currently occupied by this entity. */
  public currentStoryIndex: number;

  /** Optional target grid cell requested by gameplay input/AI. */
  public targetCell: GridCell | null;

  /** Optional target story requested by gameplay input/AI. */
  public targetStoryIndex: number | null;

  /**
   * Creates a grid-position component.
   *
   * @param currentCell - Current occupied grid cell.
   * @param currentStoryIndex - Current building story index.
   * @param targetCell - Optional destination grid cell.
   * @param targetStoryIndex - Optional destination story index.
   */
  public constructor(
    currentCell: GridCell,
    currentStoryIndex = 0,
    targetCell: GridCell | null = null,
    targetStoryIndex: number | null = null
  ) {
    this.currentCell = currentCell;
    this.currentStoryIndex = currentStoryIndex;
    this.targetCell = targetCell;
    this.targetStoryIndex = targetStoryIndex;
  }
}
