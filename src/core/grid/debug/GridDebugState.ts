/**
 * Holds mutable UI state for grid grid debug visibility.
 */
export class GridDebugState {
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
