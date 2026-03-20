import { HexCell } from "../../../hex/HexCell";

/**
 * Resolves MP movement costs per hex step.
 */
export class HexMovementCostResolver {
  public getStepCost(_fromCell: HexCell, _toCell: HexCell): number {
    return 1;
  }
}
