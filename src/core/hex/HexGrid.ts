import { Vector3 } from "@babylonjs/core";
import { HexCell } from "./HexCell";

/**
 * Defines rectangular axial bounds for generated ground grid cells.
 */
export interface HexGridBounds {
  /** Minimum axial q. */
  readonly minQ: number;

  /** Maximum axial q. */
  readonly maxQ: number;

  /** Minimum axial r. */
  readonly minR: number;

  /** Maximum axial r. */
  readonly maxR: number;
}

/**
 * Encapsulates logical hex grid math on the XZ plane.
 */
export class HexGrid {
  private static readonly SQRT3 = Math.sqrt(3);

  /** Grid world-space origin. */
  private readonly origin: Vector3;

  /** Hex outer radius (center to corner) in world units. */
  private readonly hexSize: number;

  /** Axial bounds derived from current ground area. */
  private readonly bounds: HexGridBounds;

  /**
   * Creates a logical hex grid.
   *
   * @param origin - World-space origin for axial {0,0}.
   * @param hexSize - Hex outer radius.
   * @param bounds - Grid bounds.
   */
  public constructor(origin: Vector3, hexSize: number, bounds: HexGridBounds) {
    this.origin = origin.clone();
    this.hexSize = hexSize;
    this.bounds = bounds;
  }

  /**
   * Creates grid bounds from world rectangle corners projected to axial coordinates.
   *
   * @param origin - World origin for {0,0}.
   * @param hexSize - Hex outer radius.
   * @param minX - World minimum X.
   * @param maxX - World maximum X.
   * @param minZ - World minimum Z.
   * @param maxZ - World maximum Z.
   * @returns Derived grid bounds.
   */
  public static deriveBoundsFromWorldRect(
    origin: Vector3,
    hexSize: number,
    minX: number,
    maxX: number,
    minZ: number,
    maxZ: number
  ): HexGridBounds {
    const sampleToAxial = (x: number, z: number): HexCell => {
      const localX = x - origin.x;
      const localZ = z - origin.z;
      const q = (HexGrid.SQRT3 / 3 * localX - 1 / 3 * localZ) / hexSize;
      const r = (2 / 3 * localZ) / hexSize;
      return HexGrid.roundAxial(q, r);
    };

    const corners = [
      sampleToAxial(minX, minZ),
      sampleToAxial(minX, maxZ),
      sampleToAxial(maxX, minZ),
      sampleToAxial(maxX, maxZ),
    ];

    const qValues = corners.map((cell) => cell.q);
    const rValues = corners.map((cell) => cell.r);

    return {
      minQ: Math.min(...qValues) - 1,
      maxQ: Math.max(...qValues) + 1,
      minR: Math.min(...rValues) - 1,
      maxR: Math.max(...rValues) + 1,
    };
  }

  /**
   * Returns current axial grid bounds.
   */
  public getBounds(): HexGridBounds {
    return this.bounds;
  }

  /**
   * Returns configured origin.
   */
  public getOrigin(): Vector3 {
    return this.origin.clone();
  }

  /**
   * Returns configured hex size.
   */
  public getHexSize(): number {
    return this.hexSize;
  }

  /**
   * Converts world position to nearest axial hex cell.
   *
   * @param worldPosition - World-space position.
   * @returns Rounded axial cell.
   */
  public worldToCell(worldPosition: Vector3): HexCell {
    const localX = worldPosition.x - this.origin.x;
    const localZ = worldPosition.z - this.origin.z;

    const q = (HexGrid.SQRT3 / 3 * localX - 1 / 3 * localZ) / this.hexSize;
    const r = (2 / 3 * localZ) / this.hexSize;

    return HexGrid.roundAxial(q, r);
  }

  /**
   * Converts axial hex coordinate to world center position.
   *
   * @param cell - Axial cell.
   * @param y - Optional target Y coordinate.
   * @returns World center for the requested cell.
   */
  public cellToWorld(cell: HexCell, y = this.origin.y): Vector3 {
    const x = this.hexSize * HexGrid.SQRT3 * (cell.q + cell.r / 2);
    const z = this.hexSize * (3 / 2) * cell.r;
    return new Vector3(this.origin.x + x, y, this.origin.z + z);
  }

  /**
   * Returns axial neighbors in clockwise order.
   *
   * @param cell - Source cell.
   * @returns Six adjacent cells.
   */
  public getNeighbors(cell: HexCell): HexCell[] {
    return [
      new HexCell(cell.q + 1, cell.r),
      new HexCell(cell.q + 1, cell.r - 1),
      new HexCell(cell.q, cell.r - 1),
      new HexCell(cell.q - 1, cell.r),
      new HexCell(cell.q - 1, cell.r + 1),
      new HexCell(cell.q, cell.r + 1),
    ];
  }

  /**
   * Rounds floating axial coordinates using cube-round algorithm.
   */
  private static roundAxial(q: number, r: number): HexCell {
    const x = q;
    const z = r;
    const y = -x - z;

    let rx = Math.round(x);
    let ry = Math.round(y);
    let rz = Math.round(z);

    const xDiff = Math.abs(rx - x);
    const yDiff = Math.abs(ry - y);
    const zDiff = Math.abs(rz - z);

    if (xDiff > yDiff && xDiff > zDiff) {
      rx = -ry - rz;
    } else if (yDiff > zDiff) {
      ry = -rx - rz;
    } else {
      rz = -rx - ry;
    }

    return new HexCell(rx, rz);
  }
}
