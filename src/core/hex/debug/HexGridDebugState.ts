/**
 * Holds mutable UI state for hex grid debug visibility.
 */
export class HexGridDebugState {
  private isDebugEnabled: boolean;

  public constructor(initialValue = false) {
    this.isDebugEnabled = initialValue;
  }

  public getIsDebugEnabled(): boolean {
    return this.isDebugEnabled;
  }

  public toggle(): boolean {
    this.isDebugEnabled = !this.isDebugEnabled;
    return this.isDebugEnabled;
  }
}
