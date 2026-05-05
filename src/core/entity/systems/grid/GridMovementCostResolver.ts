import { GridCell } from "../../../grid/GridCell";

export type GridMovementCostProvider = (cell: GridCell, storyIndex: number) => number;

/**
 * Resolves MP movement costs per grid step.
 */
export class GridMovementCostResolver {
  private movementCostProvider: GridMovementCostProvider | null;

  public constructor() {
    this.movementCostProvider = null;
  }

  public setMovementCostProvider(movementCostProvider: GridMovementCostProvider | null): void {
    this.movementCostProvider = movementCostProvider;
  }

  public getStepCost(_fromCell: GridCell, toCell: GridCell, storyIndex = 0): number {
    return this.movementCostProvider?.(toCell, storyIndex) ?? 1;
  }
}
