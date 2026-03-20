import { HexCell } from "../../../hex/HexCell";

/**
 * Broad-phase spatial index keyed by axial hex cells.
 */
export class HexSpatialIndex {
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

  public addEntity(entityId: string, cell: HexCell): void {
    this.removeEntity(entityId);

    const key = this.getCellKey(cell);
    const entitiesAtCell = this.cellKeyToEntities.get(key) ?? new Set<string>();
    entitiesAtCell.add(entityId);
    this.cellKeyToEntities.set(key, entitiesAtCell);
    this.entityToCellKey.set(entityId, key);
  }

  public moveEntity(entityId: string, fromCell: HexCell, toCell: HexCell): void {
    if (fromCell.equals(toCell)) {
      return;
    }

    this.removeEntityFromCell(entityId, fromCell);
    this.addEntity(entityId, toCell);
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

  public removeEntityFromCell(entityId: string, cell: HexCell): void {
    const key = this.getCellKey(cell);
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

  public getEntitiesAt(cell: HexCell): string[] {
    const key = this.getCellKey(cell);
    return Array.from(this.cellKeyToEntities.get(key) ?? []);
  }

  public getEntitiesInCells(cells: readonly HexCell[]): string[] {
    const result = new Set<string>();

    for (const cell of cells) {
      const entitiesAtCell = this.getEntitiesAt(cell);
      for (const entityId of entitiesAtCell) {
        result.add(entityId);
      }
    }

    return Array.from(result);
  }

  private getCellKey(cell: HexCell): string {
    return `${cell.q}:${cell.r}`;
  }
}
