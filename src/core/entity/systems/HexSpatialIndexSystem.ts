import type { EntityManager } from "../EntityManager";
import type { System } from "../System";
import { HexPositionComponent } from "../components/HexPositionComponent";
import { HexCell } from "../../hex/HexCell";
import { HexSpatialIndex } from "../services/HexSpatialIndex";

/**
 * Keeps HexSpatialIndex synchronized with ECS HexPositionComponent values.
 */
export class HexSpatialIndexSystem implements System {
  private readonly entityManager: EntityManager;
  private readonly spatialIndex: HexSpatialIndex;
  private readonly trackedEntityCells: Map<string, HexCell>;

  public constructor(entityManager: EntityManager, spatialIndex: HexSpatialIndex) {
    this.entityManager = entityManager;
    this.spatialIndex = spatialIndex;
    this.trackedEntityCells = new Map<string, HexCell>();
  }

  public update(_deltaSeconds: number): void {
    const entitiesWithHexPosition = this.entityManager.query(HexPositionComponent);
    const currentEntityIds = new Set<string>();

    for (const entity of entitiesWithHexPosition) {
      const entityId = entity.getId();
      currentEntityIds.add(entityId);

      const hexPosition = entity.getComponent(HexPositionComponent);
      const previousCell = this.trackedEntityCells.get(entityId);
      const currentCell = hexPosition.currentCell;

      if (!previousCell) {
        this.spatialIndex.addEntity(entityId, currentCell);
        this.trackedEntityCells.set(entityId, new HexCell(currentCell.q, currentCell.r));
        continue;
      }

      if (!previousCell.equals(currentCell)) {
        this.spatialIndex.moveEntity(entityId, previousCell, currentCell);
        this.trackedEntityCells.set(entityId, new HexCell(currentCell.q, currentCell.r));
      }
    }

    for (const [trackedEntityId] of this.trackedEntityCells) {
      if (currentEntityIds.has(trackedEntityId)) {
        continue;
      }

      this.spatialIndex.removeEntity(trackedEntityId);
      this.trackedEntityCells.delete(trackedEntityId);
    }
  }
}
