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
}
