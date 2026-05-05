import { GridCell } from "../../../grid/GridCell";

/**
 * Broad-phase spatial index keyed by rectangular grid cells.
 */
export class GridSpatialIndex {
  private readonly entityToCellKey: Map<string, string>;
  private readonly cellKeyToEntities: Map<string, Set<string>>;

  public constructor() {
    this.entityToCellKey = new Map<string, string>();
    this.cellKeyToEntities = new Map<string, Set<string>>();
  }

  public clear(): void {
    this.entityToCellKey.clear();
    this.cellKeyToEntities.clear();
  }

  public addEntity(entityId: string, cell: GridCell, storyIndex = 0): void {
    this.removeEntity(entityId);

    const key = this.getCellKey(cell, storyIndex);
    const entitiesAtCell = this.cellKeyToEntities.get(key) ?? new Set<string>();
    entitiesAtCell.add(entityId);
    this.cellKeyToEntities.set(key, entitiesAtCell);
    this.entityToCellKey.set(entityId, key);
  }

  public moveEntity(entityId: string, fromCell: GridCell, toCell: GridCell, fromStoryIndex = 0, toStoryIndex = 0): void {
    if (fromCell.equals(toCell) && fromStoryIndex === toStoryIndex) {
      return;
    }

    this.removeEntityFromCell(entityId, fromCell, fromStoryIndex);
    this.addEntity(entityId, toCell, toStoryIndex);
  }

  public removeEntity(entityId: string): void {
    const previousKey = this.entityToCellKey.get(entityId);
    if (!previousKey) {
      return;
    }

    const entitiesAtCell = this.cellKeyToEntities.get(previousKey);
    entitiesAtCell?.delete(entityId);

    if (entitiesAtCell && entitiesAtCell.size === 0) {
      this.cellKeyToEntities.delete(previousKey);
    }

    this.entityToCellKey.delete(entityId);
  }

  public removeEntityFromCell(entityId: string, cell: GridCell, storyIndex = 0): void {
    const key = this.getCellKey(cell, storyIndex);
    const entitiesAtCell = this.cellKeyToEntities.get(key);
    entitiesAtCell?.delete(entityId);

    if (entitiesAtCell && entitiesAtCell.size === 0) {
      this.cellKeyToEntities.delete(key);
    }

    const mappedKey = this.entityToCellKey.get(entityId);
    if (mappedKey === key) {
      this.entityToCellKey.delete(entityId);
    }
  }

  public getEntitiesAt(cell: GridCell, storyIndex = 0): string[] {
    const key = this.getCellKey(cell, storyIndex);
    return Array.from(this.cellKeyToEntities.get(key) ?? []);
  }

  public getEntitiesInCells(cells: readonly GridCell[], storyIndex = 0): string[] {
    const result = new Set<string>();

    for (const cell of cells) {
      const entitiesAtCell = this.getEntitiesAt(cell, storyIndex);
      for (const entityId of entitiesAtCell) {
        result.add(entityId);
      }
    }

    return Array.from(result);
  }

  private getCellKey(cell: GridCell, storyIndex: number): string {
    return `${storyIndex}:${cell.x}:${cell.z}`;
  }
}
