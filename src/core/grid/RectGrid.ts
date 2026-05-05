import { Vector3 } from "@babylonjs/core";
import { GridCell } from "./GridCell";

export interface GridBounds {
  readonly minX: number;
  readonly maxX: number;
  readonly minZ: number;
  readonly maxZ: number;
}

export class RectGrid {
  private readonly origin: Vector3;
  private readonly tileSize: number;
  private readonly bounds: GridBounds;

  public constructor(origin: Vector3, tileSize: number, bounds: GridBounds) {
    if (!Number.isFinite(tileSize) || tileSize <= 0) {
      throw new Error(`RectGrid tileSize must be positive, got ${tileSize}`);
    }
    this.origin = origin.clone();
    this.tileSize = tileSize;
    this.bounds = bounds;
  }

  public static deriveBoundsFromWorldRect(
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

  public getBounds(): GridBounds {
    return this.bounds;
  }

  public getOrigin(): Vector3 {
    return this.origin.clone();
  }

  public getTileSize(): number {
    return this.tileSize;
  }

  public worldToCell(worldPosition: Vector3): GridCell {
    const localX = worldPosition.x - this.origin.x;
    const localZ = worldPosition.z - this.origin.z;
    return new GridCell(Math.floor(localX / this.tileSize), Math.floor(localZ / this.tileSize));
  }

  public cellToWorld(cell: GridCell, y = this.origin.y): Vector3 {
    return new Vector3(
      this.origin.x + (cell.x + 0.5) * this.tileSize,
      y,
      this.origin.z + (cell.z + 0.5) * this.tileSize
    );
  }

  public cellBounds(cell: GridCell): { readonly minX: number; readonly maxX: number; readonly minZ: number; readonly maxZ: number } {
    return {
      minX: this.origin.x + cell.x * this.tileSize,
      maxX: this.origin.x + (cell.x + 1) * this.tileSize,
      minZ: this.origin.z + cell.z * this.tileSize,
      maxZ: this.origin.z + (cell.z + 1) * this.tileSize
    };
  }

  public isWithinBounds(cell: GridCell): boolean {
    return cell.x >= this.bounds.minX
      && cell.x <= this.bounds.maxX
      && cell.z >= this.bounds.minZ
      && cell.z <= this.bounds.maxZ;
  }

  public contains(cell: GridCell): boolean {
    return this.isWithinBounds(cell);
  }

  public getCellsWithinBounds(): GridCell[] {
    const result: GridCell[] = [];
    for (let x = this.bounds.minX; x <= this.bounds.maxX; x += 1) {
      for (let z = this.bounds.minZ; z <= this.bounds.maxZ; z += 1) {
        result.push(new GridCell(x, z));
      }
    }
    return result;
  }

  public getNeighbors(cell: GridCell): GridCell[] {
    return this.getNeighbors4(cell);
  }

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

  public getGridCellsInVisionSector(
    originCell: GridCell,
    forward: Vector3,
    rangeCells: number,
    fovDegrees: number
  ): GridCell[] {
    const normalizedForward = new Vector3(forward.x, 0, forward.z).normalize();
    const minDot = Math.cos((fovDegrees * Math.PI) / 360);
    const originWorld = this.cellToWorld(originCell, 0);
    const result: GridCell[] = [];

    for (let x = originCell.x - rangeCells; x <= originCell.x + rangeCells; x += 1) {
      for (let z = originCell.z - rangeCells; z <= originCell.z + rangeCells; z += 1) {
        const candidate = new GridCell(x, z);
        if (!this.contains(candidate) || originCell.distance(candidate) > rangeCells) {
          continue;
        }
        if (candidate.equals(originCell)) {
          result.push(candidate);
          continue;
        }
        const direction = this.cellToWorld(candidate, 0).subtract(originWorld);
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
