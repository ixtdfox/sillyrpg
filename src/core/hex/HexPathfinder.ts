import { HexCell } from "./HexCell";
import { HexGrid } from "./HexGrid";

/**
 * Optional rule used to reject traversal through blocked cells.
 */
export type HexCellBlockedPredicate = (cell: HexCell) => boolean;

/**
 * Computes deterministic shortest paths across bounded hex grids.
 */
export class HexPathfinder {
  private readonly grid: HexGrid;
  private readonly isCellBlocked: HexCellBlockedPredicate;

  /**
   * Creates a new pathfinder for a specific grid.
   *
   * @param grid - Logical hex grid.
   * @param isCellBlocked - Optional blocked-cell predicate.
   */
  public constructor(grid: HexGrid, isCellBlocked: HexCellBlockedPredicate = () => false) {
    this.grid = grid;
    this.isCellBlocked = isCellBlocked;
  }

  /**
   * Finds a shortest path from start to goal.
   *
   * @returns Inclusive cell list [start..goal], or null when unreachable/invalid.
   */
  public findPath(start: HexCell, goal: HexCell): HexCell[] | null {
    if (!this.grid.contains(start) || !this.grid.contains(goal)) {
      return null;
    }

    if (start.equals(goal)) {
      return [start];
    }

    const queue: HexCell[] = [start];
    const visited = new Set<string>([this.cellKey(start)]);
    const parentByKey = new Map<string, HexCell>();

    while (queue.length > 0) {
      const current = queue.shift();
      if (!current) {
        break;
      }

      for (const neighbor of this.grid.getNeighbors(current)) {
        if (!this.grid.contains(neighbor) || this.isCellBlocked(neighbor)) {
          continue;
        }

        const neighborKey = this.cellKey(neighbor);
        if (visited.has(neighborKey)) {
          continue;
        }

        visited.add(neighborKey);
        parentByKey.set(neighborKey, current);

        if (neighbor.equals(goal)) {
          return this.reconstructPath(start, goal, parentByKey);
        }

        queue.push(neighbor);
      }
    }

    return null;
  }

  private reconstructPath(start: HexCell, goal: HexCell, parentByKey: Map<string, HexCell>): HexCell[] {
    const path: HexCell[] = [goal];
    let current = goal;

    while (!current.equals(start)) {
      const parent = parentByKey.get(this.cellKey(current));
      if (!parent) {
        return [];
      }

      path.push(parent);
      current = parent;
    }

    path.reverse();
    return path;
  }

  private cellKey(cell: HexCell): string {
    return `${cell.q},${cell.r}`;
  }
}
