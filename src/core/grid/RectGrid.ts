import { Vector3 } from "@babylonjs/core";
import { GridCell } from "./GridCell";

/**
 * Включающие границы прямоугольной сетки в координатах клеток.
 */
export interface GridBounds {
  readonly minX: number;
  readonly maxX: number;
  readonly minZ: number;
  readonly maxZ: number;
}

/**
 * Прямоугольные AABB-границы одной клетки в XZ-плоскости мировых координат.
 */
export interface GridCellWorldBounds {
  readonly minX: number;
  readonly maxX: number;
  readonly minZ: number;
  readonly maxZ: number;
}

/**
 * Фабрика границ сетки.
 *
 * Отдельный объект держит политику округления и padding вокруг геометрии земли,
 * чтобы RectGrid оставался моделью сетки, а не местом для правил импорта сцены.
 */
export class RectGridBoundsFactory {
  /**
   * Строит bounds из мирового прямоугольника.
   *
   * Крайние мировые координаты переводятся в клетки через floor, после чего
   * добавляется один запасной слой клеток. Этот запас нужен overlay/picking коду:
   * он сглаживает пограничные случаи, когда меш земли или стены лежит ровно на
   * границе тайла.
   */
  public deriveFromWorldRect(
    origin: Vector3,
    tileSize: number,
    minX: number,
    maxX: number,
    minZ: number,
    maxZ: number
  ): GridBounds {
    const minCell = new GridCell(Math.floor((minX - origin.x) / tileSize), Math.floor((minZ - origin.z) / tileSize));
    const maxCell = new GridCell(Math.floor((maxX - origin.x) / tileSize), Math.floor((maxZ - origin.z) / tileSize));
    return {
      minX: Math.min(minCell.x, maxCell.x) - 1,
      maxX: Math.max(minCell.x, maxCell.x) + 1,
      minZ: Math.min(minCell.z, maxCell.z) - 1,
      maxZ: Math.max(minCell.z, maxCell.z) + 1
    };
  }
}

/**
 * Преобразователь между мировыми координатами Babylon и логическими клетками.
 *
 * Это Strategy для преобразования координат: вся арифметика origin/tileSize
 * собрана здесь, поэтому pathfinding и overlay не дублируют формулы.
 */
export class RectGridCoordinateMapper {
  private readonly origin: Vector3;
  private readonly tileSize: number;

  public constructor(origin: Vector3, tileSize: number) {
    this.origin = origin.clone();
    this.tileSize = tileSize;
  }

  /**
   * Преобразует мировую позицию в клетку через floor, чтобы каждая точка XZ
   * попадала в единственный тайл.
   */
  public worldToCell(worldPosition: Vector3): GridCell {
    const localX = worldPosition.x - this.origin.x;
    const localZ = worldPosition.z - this.origin.z;
    return new GridCell(Math.floor(localX / this.tileSize), Math.floor(localZ / this.tileSize));
  }

  /**
   * Возвращает центр клетки в мировых координатах.
   */
  public cellToWorld(cell: GridCell, y = this.origin.y): Vector3 {
    return new Vector3(
      this.origin.x + (cell.x + 0.5) * this.tileSize,
      y,
      this.origin.z + (cell.z + 0.5) * this.tileSize
    );
  }

  /**
   * Возвращает мировые XZ-границы клетки для debug overlay и geometric checks.
   */
  public cellBounds(cell: GridCell): GridCellWorldBounds {
    return {
      minX: this.origin.x + cell.x * this.tileSize,
      maxX: this.origin.x + (cell.x + 1) * this.tileSize,
      minZ: this.origin.z + cell.z * this.tileSize,
      maxZ: this.origin.z + (cell.z + 1) * this.tileSize
    };
  }
}

/**
 * Поставщик соседей клетки.
 *
 * Навигация по умолчанию использует 4-связную сетку, но 8-связный вариант
 * оставлен как явная стратегия для систем обзора/редактора.
 */
export class RectGridNeighborProvider {
  public getNeighbors4(cell: GridCell): GridCell[] {
    return [
      new GridCell(cell.x + 1, cell.z),
      new GridCell(cell.x - 1, cell.z),
      new GridCell(cell.x, cell.z + 1),
      new GridCell(cell.x, cell.z - 1)
    ];
  }

  public getNeighbors8(cell: GridCell): GridCell[] {
    return [
      ...this.getNeighbors4(cell),
      new GridCell(cell.x + 1, cell.z + 1),
      new GridCell(cell.x + 1, cell.z - 1),
      new GridCell(cell.x - 1, cell.z + 1),
      new GridCell(cell.x - 1, cell.z - 1)
    ];
  }
}

/**
 * Объект-запрос для выборки клеток внутри сектора обзора.
 *
 * Сектор считается на XZ-плоскости: Y игнорируется, потому что высоты этажей
 * обслуживаются navigation/runtime слоями, а RectGrid отвечает только за
 * координатную сетку.
 */
export class GridVisionSectorQuery {
  private readonly grid: Pick<RectGrid, "contains" | "cellToWorld">;

  public constructor(grid: Pick<RectGrid, "contains" | "cellToWorld">) {
    this.grid = grid;
  }

  /**
   * Возвращает клетки в Manhattan range и внутри угла обзора.
   */
  public collect(originCell: GridCell, forward: Vector3, rangeCells: number, fovDegrees: number): GridCell[] {
    const normalizedForward = new Vector3(forward.x, 0, forward.z).normalize();
    const minDot = Math.cos((fovDegrees * Math.PI) / 360);
    const originWorld = this.grid.cellToWorld(originCell, 0);
    const result: GridCell[] = [];

    for (let x = originCell.x - rangeCells; x <= originCell.x + rangeCells; x += 1) {
      for (let z = originCell.z - rangeCells; z <= originCell.z + rangeCells; z += 1) {
        const candidate = new GridCell(x, z);
        if (!this.grid.contains(candidate) || originCell.distance(candidate) > rangeCells) {
          continue;
        }
        if (candidate.equals(originCell)) {
          result.push(candidate);
          continue;
        }
        const direction = this.grid.cellToWorld(candidate, 0).subtract(originWorld);
        direction.y = 0;
        const lengthSquared = direction.lengthSquared();
        if (lengthSquared <= Number.EPSILON) {
          result.push(candidate);
          continue;
        }
        direction.scaleInPlace(1 / Math.sqrt(lengthSquared));
        if (Vector3.Dot(normalizedForward, direction) >= minDot) {
          result.push(candidate);
        }
      }
    }

    return result;
  }
}

/**
 * Прямоугольная тактическая сетка.
 *
 * Класс остается фасадом для старого публичного API, но внутренние роли
 * вынесены в Strategy/Factory объекты: координатный mapper, provider соседей,
 * фабрика bounds и query сектора обзора.
 */
export class RectGrid {
  private static readonly boundsFactory = new RectGridBoundsFactory();
  private readonly origin: Vector3;
  private readonly tileSize: number;
  private readonly bounds: GridBounds;
  private readonly coordinateMapper: RectGridCoordinateMapper;
  private readonly neighborProvider: RectGridNeighborProvider;
  private readonly visionSectorQuery: GridVisionSectorQuery;

  /**
   * Создает bounded grid. tileSize валидируется здесь, потому что от него
   * зависят все downstream формулы координат.
   */
  public constructor(origin: Vector3, tileSize: number, bounds: GridBounds) {
    if (!Number.isFinite(tileSize) || tileSize <= 0) {
      throw new Error(`RectGrid tileSize must be positive, got ${tileSize}`);
    }
    this.origin = origin.clone();
    this.tileSize = tileSize;
    this.bounds = bounds;
    this.coordinateMapper = new RectGridCoordinateMapper(this.origin, this.tileSize);
    this.neighborProvider = new RectGridNeighborProvider();
    this.visionSectorQuery = new GridVisionSectorQuery(this);
  }

  /**
   * Фасад обратной совместимости к фабрике bounds.
   */
  public static deriveBoundsFromWorldRect(
    origin: Vector3,
    tileSize: number,
    minX: number,
    maxX: number,
    minZ: number,
    maxZ: number
  ): GridBounds {
    return RectGrid.boundsFactory.deriveFromWorldRect(origin, tileSize, minX, maxX, minZ, maxZ);
  }

  /**
   * Возвращает копию bounds-контракта сетки.
   */
  public getBounds(): GridBounds {
    return this.bounds;
  }

  /**
   * Возвращает копию origin, чтобы внешний код не мутировал состояние сетки.
   */
  public getOrigin(): Vector3 {
    return this.origin.clone();
  }

  /**
   * Возвращает размер клетки в мировых единицах.
   */
  public getTileSize(): number {
    return this.tileSize;
  }

  /**
   * Делегирует conversion strategy: мировая позиция -> клетка.
   */
  public worldToCell(worldPosition: Vector3): GridCell {
    return this.coordinateMapper.worldToCell(worldPosition);
  }

  /**
   * Делегирует conversion strategy: клетка -> центр в мире.
   */
  public cellToWorld(cell: GridCell, y = this.origin.y): Vector3 {
    return this.coordinateMapper.cellToWorld(cell, y);
  }

  /**
   * Возвращает XZ AABB клетки в мировых координатах.
   */
  public cellBounds(cell: GridCell): GridCellWorldBounds {
    return this.coordinateMapper.cellBounds(cell);
  }

  /**
   * Проверяет, лежит ли клетка внутри bounded grid.
   */
  public isWithinBounds(cell: GridCell): boolean {
    return cell.x >= this.bounds.minX
      && cell.x <= this.bounds.maxX
      && cell.z >= this.bounds.minZ
      && cell.z <= this.bounds.maxZ;
  }

  /**
   * Короткий alias для кода, где читаемость важнее названия isWithinBounds.
   */
  public contains(cell: GridCell): boolean {
    return this.isWithinBounds(cell);
  }

  /**
   * Возвращает все клетки bounds в стабильном порядке X -> Z.
   */
  public getCellsWithinBounds(): GridCell[] {
    const result: GridCell[] = [];
    for (let x = this.bounds.minX; x <= this.bounds.maxX; x += 1) {
      for (let z = this.bounds.minZ; z <= this.bounds.maxZ; z += 1) {
        result.push(new GridCell(x, z));
      }
    }
    return result;
  }

  /**
   * Базовая навигационная соседность: 4 направления без диагоналей.
   */
  public getNeighbors(cell: GridCell): GridCell[] {
    return this.getNeighbors4(cell);
  }

  /**
   * Возвращает 4 ортогональных соседей без фильтрации по bounds.
   */
  public getNeighbors4(cell: GridCell): GridCell[] {
    return this.neighborProvider.getNeighbors4(cell);
  }

  /**
   * Возвращает 8 соседей без фильтрации по bounds.
   */
  public getNeighbors8(cell: GridCell): GridCell[] {
    return this.neighborProvider.getNeighbors8(cell);
  }

  /**
   * Возвращает клетки, попадающие в сектор обзора.
   */
  public getGridCellsInVisionSector(
    originCell: GridCell,
    forward: Vector3,
    rangeCells: number,
    fovDegrees: number
  ): GridCell[] {
    return this.visionSectorQuery.collect(originCell, forward, rangeCells, fovDegrees);
  }
}
