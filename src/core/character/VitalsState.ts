/**
 * Represents mutable current and maximum values for a vital resource.
 */
export class VitalsState {
  /** Current value. */
  public current: number;

  /** Maximum allowed value. */
  public max: number;

  /**
   * Creates a new vitals state.
   *
   * @param current - Initial current value.
   * @param max - Initial maximum value.
   */
  public constructor(current: number = 100, max: number = 100) {
    this.current = current;
    this.max = max;
  }
}
