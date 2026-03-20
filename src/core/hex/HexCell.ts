/**
 * Immutable axial hex cell coordinate.
 */
export class HexCell {
  /** Axial q coordinate. */
  public readonly q: number;

  /** Axial r coordinate. */
  public readonly r: number;

  /**
   * Creates a hex cell coordinate.
   *
   * @param q - Axial q coordinate.
   * @param r - Axial r coordinate.
   */
  public constructor(q: number, r: number) {
    this.q = q;
    this.r = r;
  }

  /**
   * Returns true when both coordinates match.
   *
   * @param other - Other cell coordinate.
   * @returns True when equal.
   */
  public equals(other: HexCell): boolean {
    return this.q === other.q && this.r === other.r;
  }

  public distance(a: HexCell): number {
    const dq = this.q - a.q;
    const dr = this.r - a.r;
    const ds = -this.q - this.r - (-a.q - a.r);
    return (Math.abs(dq) + Math.abs(dr) + Math.abs(ds)) / 2;
  }
}
