import { GridCell } from "../../../grid/GridCell";
import { GridNavigationPathService, type ReachableNavigationCell } from "../../../navigation/GridNavigationPathService";
import type { NavigationNode } from "../../../navigation/NavigationGraph";

export interface CombatMoveRangeResolution {
  readonly reachableCells: readonly ReachableNavigationCell[];
  readonly costByCellKey: ReadonlyMap<string, number>;
  readonly consideredStairConnector: boolean;
}

/**
 * Resolves movement-reachable grid cells for the active combatant using MP budget.
 */
export class CombatMoveRangeResolver {
  public resolveReachableCells(
    navigationPathService: GridNavigationPathService,
    startCell: GridCell,
    movementPoints: number,
    startStoryIndex: number,
    occupied: (node: NavigationNode) => boolean,
    activeEntityId?: string
  ): CombatMoveRangeResolution {
    const result = navigationPathService.resolveReachableCells({
      startCell,
      startStoryIndex,
      movementPoints,
      occupied,
      activeEntityId
    });

    return {
      reachableCells: result.reachableCells,
      costByCellKey: result.costByNodeKey,
      consideredStairConnector: result.consideredStairConnector
    };
  }
}
