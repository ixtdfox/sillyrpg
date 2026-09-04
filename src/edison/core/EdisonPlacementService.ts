export interface EdisonPlacementAsset {
  readonly id: string;
  readonly title: string;
  readonly modelPath: string;
  readonly objectType: string;
  readonly gridSize: number;
  readonly connectedPresetId?: string;
}

export class EdisonPlacementService {
  private selectedAsset: EdisonPlacementAsset | null = null;
  private readonly listeners = new Set<(asset: EdisonPlacementAsset | null) => void>();

  public getSelectedAsset(): EdisonPlacementAsset | null {
    return this.selectedAsset;
  }

  public select(asset: EdisonPlacementAsset): void {
    if (this.selectedAsset?.id === asset.id) {
      return;
    }

    this.selectedAsset = asset;
    this.notifyChanged();
  }

  public toggle(asset: EdisonPlacementAsset): void {
    if (this.selectedAsset?.id === asset.id) {
      this.clear();
      return;
    }

    this.select(asset);
  }

  public clear(): void {
    if (!this.selectedAsset) {
      return;
    }

    this.selectedAsset = null;
    this.notifyChanged();
  }

  public onDidChange(listener: (asset: EdisonPlacementAsset | null) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  public dispose(): void {
    this.listeners.clear();
    this.selectedAsset = null;
  }

  private notifyChanged(): void {
    for (const listener of [...this.listeners]) {
      listener(this.selectedAsset);
    }
  }
}
