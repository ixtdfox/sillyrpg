export interface EdisonSceneObjectSelection {
  readonly kind: "scene-object";
  readonly objectId: string;
}

export interface EdisonTerrainSelection {
  readonly kind: "terrain";
  readonly terrainId: string;
}

export type EdisonSelection = EdisonSceneObjectSelection | EdisonTerrainSelection | null;

export class EdisonSelectionService {
  private selection: EdisonSelection = null;
  private readonly listeners = new Set<(selection: EdisonSelection) => void>();

  public getSelection(): EdisonSelection {
    return this.selection;
  }

  public getSelectedObjectId(): string | null {
    return this.selection?.kind === "scene-object" ? this.selection.objectId : null;
  }

  public selectSceneObject(objectId: string): void {
    this.setSelection({ kind: "scene-object", objectId });
  }

  public selectTerrain(terrainId: string): void {
    this.setSelection({ kind: "terrain", terrainId });
  }

  public clear(): void {
    this.setSelection(null);
  }

  public onDidChange(listener: (selection: EdisonSelection) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  public dispose(): void {
    this.listeners.clear();
    this.selection = null;
  }

  private setSelection(selection: EdisonSelection): void {
    if (this.areEqual(this.selection, selection)) {
      return;
    }

    this.selection = selection;
    for (const listener of [...this.listeners]) {
      listener(this.selection);
    }
  }

  private areEqual(left: EdisonSelection, right: EdisonSelection): boolean {
    if (left === right) {
      return true;
    }

    if (!left || !right || left.kind !== right.kind) {
      return false;
    }

    if (left.kind === "scene-object" && right.kind === "scene-object") {
      return left.objectId === right.objectId;
    }

    if (left.kind === "terrain" && right.kind === "terrain") {
      return left.terrainId === right.terrainId;
    }

    return false;
  }
}
