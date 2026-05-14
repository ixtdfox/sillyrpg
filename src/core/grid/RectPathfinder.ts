import { GridCell } from "./GridCell";
import { RectGrid } from "./RectGrid";

/**
 * Правило, которое запрещает вход в конкретную клетку.
 */
export type GridCellBlockedPredicate = (cell: GridCell) => boolean;

/**
 * Правило, которое запрещает переход между двумя соседними клетками.
 */
export type GridEdgeBlockedPredicate = (fromCell: GridCell, toCell: GridCell) => boolean;

/**
 * Сервис поиска кратчайшего пути по bounded RectGrid.
 *
 * Реализация использует BFS Strategy для невзвешенной 4-связной сетки. Весовые
 * и многоэтажные маршруты живут в navigation-пакете, а этот класс остается
 * компактным grid-level pathfinder для простых систем и fallback-сценариев.
 */
export class RectPathfinder {
  private readonly grid: RectGrid;
  private readonly isCellBlocked: GridCellBlockedPredicate;
  private readonly isEdgeBlocked: GridEdgeBlockedPredicate;

  /**
   * Создает pathfinder для конкретной сетки.
   *
   * @param grid - Логическая RectGrid.
   * @param isCellBlocked - Внешняя политика блокировки клеток.
   * @param isEdgeBlocked - Внешняя политика блокировки ребер.
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
   * Ищет кратчайший путь от start до goal.
   *
   * @returns Список клеток [start..goal] включительно или null, если путь невозможен.
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

  /**
   * Восстанавливает путь по parent map, созданной BFS.
   */
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

  /**
   * Единая точка построения ключа клетки для visited/parent maps.
   */
  private cellKey(cell: GridCell): string {
    return cell.key();
  }
}
