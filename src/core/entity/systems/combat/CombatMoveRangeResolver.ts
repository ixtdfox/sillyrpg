import { HexCell } from "../../../hex/HexCell";
import { HexGrid } from "../../../hex/HexGrid";
import { HexMovementCostResolver } from "../hex/HexMovementCostResolver";

export interface CombatMoveRangeResolution {
  readonly reachableCells: readonly HexCell[];
  readonly costByCellKey: ReadonlyMap<string, number>;
}

/**
 * Resolves movement-reachable hex cells for the active combatant using MP budget.
 */
export class CombatMoveRangeResolver {
  private readonly movementCostResolver: HexMovementCostResolver;

  public constructor(movementCostResolver: HexMovementCostResolver) {
    this.movementCostResolver = movementCostResolver;
  }

  public resolveReachableCells(
    grid: HexGrid,
    startCell: HexCell,
    movementPoints: number,
    isCellBlocked: (cell: HexCell) => boolean
  ): CombatMoveRangeResolution {
    if (movementPoints <= 0 || !grid.contains(startCell)) {
      return {
        reachableCells: [],
        costByCellKey: new Map<string, number>(),
      };
    }

    const queue: HexCell[] = [startCell];
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

        const stepCost = this.movementCostResolver.getStepCost(current, neighbor);
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

    const reachableCells: HexCell[] = [];
    for (const [key, totalCost] of costByCellKey.entries()) {
      if (totalCost <= 0) {
        continue;
      }
      reachableCells.push(parseCellKey(key));
    }

    return {
      reachableCells,
      costByCellKey,
    };
  }
}

function cellKey(cell: HexCell): string {
  return `${cell.q}:${cell.r}`;
}

function parseCellKey(key: string): HexCell {
  const [qToken, rToken] = key.split(":");
  return new HexCell(Number(qToken), Number(rToken));
}
