import { GridCell } from "../../../grid/GridCell";
import { RectGrid } from "../../../grid/RectGrid";
import { GridMovementCostResolver } from "../grid/GridMovementCostResolver";

export interface CombatMoveRangeResolution {
  readonly reachableCells: readonly GridCell[];
  readonly costByCellKey: ReadonlyMap<string, number>;
}

/**
 * Resolves movement-reachable grid cells for the active combatant using MP budget.
 */
export class CombatMoveRangeResolver {
  private readonly movementCostResolver: GridMovementCostResolver;

  public constructor(movementCostResolver: GridMovementCostResolver) {
    this.movementCostResolver = movementCostResolver;
  }

  public resolveReachableCells(
    grid: RectGrid,
    startCell: GridCell,
    movementPoints: number,
    isCellBlocked: (cell: GridCell) => boolean,
    storyIndex = 0,
    isEdgeBlocked: (fromCell: GridCell, toCell: GridCell) => boolean = () => false
  ): CombatMoveRangeResolution {
    if (movementPoints <= 0 || !grid.contains(startCell)) {
      return {
        reachableCells: [],
        costByCellKey: new Map<string, number>(),
      };
    }

    const queue: GridCell[] = [startCell];
    const costByCellKey = new Map<string, number>([[cellKey(startCell), 0]]);

    while (queue.length > 0) {
      const current = queue.shift();
      if (!current) {
        continue;
      }

      const currentCost = costByCellKey.get(cellKey(current));
      if (currentCost === undefined) {
        continue;
      }

      for (const neighbor of grid.getNeighbors(current)) {
        if (!grid.contains(neighbor) || isCellBlocked(neighbor)) {
          continue;
        }

        if (isEdgeBlocked(current, neighbor)) {
          continue;
        }

        const stepCost = this.movementCostResolver.getStepCost(current, neighbor, storyIndex);
        if (!Number.isFinite(stepCost) || stepCost <= 0) {
          continue;
        }

        const nextCost = currentCost + stepCost;
        if (nextCost > movementPoints) {
          continue;
        }

        const neighborKey = cellKey(neighbor);
        const knownCost = costByCellKey.get(neighborKey);

        if (knownCost !== undefined && knownCost <= nextCost) {
          continue;
        }

        costByCellKey.set(neighborKey, nextCost);
        queue.push(neighbor);
      }
    }

    const reachableCells: GridCell[] = [];
    for (const [key, totalCost] of costByCellKey.entries()) {
      reachableCells.push(parseCellKey(key));
    }

    return {
      reachableCells,
      costByCellKey,
    };
  }
}

function cellKey(cell: GridCell): string {
  return `${cell.x}:${cell.z}`;
}

function parseCellKey(key: string): GridCell {
  const [qToken, rToken] = key.split(":");
  return new GridCell(Number(qToken), Number(rToken));
}
