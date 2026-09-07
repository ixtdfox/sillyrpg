export interface EdisonInteriorEditFloor {
  readonly storyIndex: number;
  readonly label: string;
  readonly worldY: number;
}

export interface EdisonInteriorEditState {
  readonly activeBuildingId: string;
  readonly activeStoryIndex: number;
  readonly floors: readonly EdisonInteriorEditFloor[];
}

export interface EdisonInteriorEditableObject {
  readonly type: string;
  readonly interiorBuildingId?: string;
  readonly position: readonly [number, number, number];
}

type EdisonInteriorEditListener = (state: EdisonInteriorEditState | null) => void;

export class EdisonInteriorEditService {
  private state: EdisonInteriorEditState | null = null;
  private readonly listeners = new Set<EdisonInteriorEditListener>();

  public getState(): EdisonInteriorEditState | null {
    return this.state;
  }

  public getActiveBuildingId(): string | null {
    return this.state?.activeBuildingId ?? null;
  }

  public getActiveStoryIndex(): number | null {
    return this.state?.activeStoryIndex ?? null;
  }

  public isActive(): boolean {
    return this.state !== null;
  }

  public canEditObject(object: EdisonInteriorEditableObject | null): boolean {
    if (!object) {
      return false;
    }

    if (!this.state) {
      return true;
    }

    return Boolean(
      object.type === "interior" &&
      object.interiorBuildingId === this.state.activeBuildingId &&
      this.isObjectOnActiveStory(object, this.state)
    );
  }

  public enterBuilding(buildingId: string, floors: readonly EdisonInteriorEditFloor[]): void {
    const sortedFloors = [...floors].sort((left, right) => left.storyIndex - right.storyIndex);
    const firstFloor = sortedFloors[0];
    if (!firstFloor) {
      throw new Error(`Building '${buildingId}' has no editable floors.`);
    }

    this.state = {
      activeBuildingId: buildingId,
      activeStoryIndex: firstFloor.storyIndex,
      floors: sortedFloors
    };
    this.emitChanged();
  }

  public selectStory(storyIndex: number): void {
    const state = this.state;
    if (!state || state.activeStoryIndex === storyIndex) {
      return;
    }

    if (!state.floors.some((floor) => floor.storyIndex === storyIndex)) {
      throw new Error(`Building '${state.activeBuildingId}' has no floor ${storyIndex + 1}.`);
    }

    this.state = {
      ...state,
      activeStoryIndex: storyIndex
    };
    this.emitChanged();
  }

  public exit(): void {
    if (!this.state) {
      return;
    }

    this.state = null;
    this.emitChanged();
  }

  public onDidChange(listener: EdisonInteriorEditListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  public dispose(): void {
    this.state = null;
    this.listeners.clear();
  }

  private emitChanged(): void {
    for (const listener of [...this.listeners]) {
      listener(this.state);
    }
  }

  private isObjectOnActiveStory(object: EdisonInteriorEditableObject, state: EdisonInteriorEditState): boolean {
    const floors = [...state.floors].sort((left, right) => left.worldY - right.worldY);
    const floorIndex = floors.findIndex((floor) => floor.storyIndex === state.activeStoryIndex);
    const floor = floors[floorIndex];
    if (!floor) {
      return false;
    }

    const nextFloor = floors[floorIndex + 1];
    const y = object.position[1];
    return y >= floor.worldY - 0.1 && (!nextFloor || y < nextFloor.worldY - 0.05);
  }
}
