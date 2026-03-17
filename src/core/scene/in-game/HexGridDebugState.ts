/**
 * Holds mutable UI state for hex grid debug visibility.
 */
export class HexGridDebugState {
  private isDebugEnabled: boolean;

  /**
   * Creates state with optional initial value.
   */
  public constructor(initialValue = false) {
    this.isDebugEnabled = initialValue;
  }

  /**
   * Returns current debug visibility state.
   */
  public getIsDebugEnabled(): boolean {
    return this.isDebugEnabled;
  }

  /**
   * Toggles state and returns new value.
   */
  public toggle(): boolean {
    this.isDebugEnabled = !this.isDebugEnabled;
    return this.isDebugEnabled;
  }
}
