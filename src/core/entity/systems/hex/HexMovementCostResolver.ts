import { HexCell } from "../../../hex/HexCell";

export type HexMovementCostProvider = (cell: HexCell, storyIndex: number) => number;

/**
 * Resolves MP movement costs per hex step.
 */
export class HexMovementCostResolver {
  private movementCostProvider: HexMovementCostProvider | null;

  public constructor() {
    this.movementCostProvider = null;
  }

  public setMovementCostProvider(movementCostProvider: HexMovementCostProvider | null): void {
    this.movementCostProvider = movementCostProvider;
  }

  public getStepCost(_fromCell: HexCell, toCell: HexCell, storyIndex = 0): number {
    return this.movementCostProvider?.(toCell, storyIndex) ?? 1;
  }
}
