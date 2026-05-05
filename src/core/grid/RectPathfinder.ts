import { GridCell } from "./GridCell";
import { RectGrid } from "./RectGrid";

/**
 * Optional rule used to reject traversal through blocked cells.
 */
export type GridCellBlockedPredicate = (cell: GridCell) => boolean;
export type GridEdgeBlockedPredicate = (fromCell: GridCell, toCell: GridCell) => boolean;

/**
 * Computes deterministic shortest paths across bounded grid grids.
 */
export class RectPathfinder {
  private readonly grid: RectGrid;
  private readonly isCellBlocked: GridCellBlockedPredicate;
  private readonly isEdgeBlocked: GridEdgeBlockedPredicate;

  /**
   * Creates a new pathfinder for a specific grid.
   *
   * @param grid - Logical grid grid.
   * @param isCellBlocked - Optional blocked-cell predicate.
   * @param isEdgeBlocked - Optional blocked-edge predicate.
   */
  public constructor(
    grid: RectGrid,
    isCellBlocked: GridCellBlockedPredicate = () => false,
    isEdgeBlocked: GridEdgeBlockedPredicate = () => false
  ) {
    this.grid = grid;
    this.isCellBlocked = isCellBlocked;
    this.isEdgeBlocked = isEdgeBlocked;
  }

  /**
   * Finds a shortest path from start to goal.
   *
   * @returns Inclusive cell list [start..goal], or null when unreachable/invalid.
   */
  public findPath(start: GridCell, goal: GridCell): GridCell[] | null {
    if (!this.grid.contains(start) || !this.grid.contains(goal)) {
      return null;
    }

    if (start.equals(goal)) {
      return [start];
    }

    const queue: GridCell[] = [start];
    const visited = new Set<string>([this.cellKey(start)]);
    const parentByKey = new Map<string, GridCell>();

    while (queue.length > 0) {
      const current = queue.shift();
      if (!current) {
        break;
      }

      for (const neighbor of this.grid.getNeighbors(current)) {
        if (!this.grid.contains(neighbor) || this.isCellBlocked(neighbor)) {
          continue;
        }

        if (this.isEdgeBlocked(current, neighbor)) {
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

  private reconstructPath(start: GridCell, goal: GridCell, parentByKey: Map<string, GridCell>): GridCell[] {
    const path: GridCell[] = [goal];
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

  private cellKey(cell: GridCell): string {
    return cell.key();
  }
}
