export class EditorSelectionState {
  private selectedObjectId: string | null;

  public constructor() {
    this.selectedObjectId = null;
  }

  public getSelectedObjectId(): string | null {
    return this.selectedObjectId;
  }

  public setSelectedObjectId(objectId: string | null): void {
    this.selectedObjectId = objectId;
  }

  public clear(): void {
    this.selectedObjectId = null;
  }
}
