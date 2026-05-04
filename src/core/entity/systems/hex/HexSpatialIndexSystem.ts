import type { EntityManager } from "../../EntityManager";
import type { System } from "../../System";
import { HexPositionComponent } from "../../components/HexPositionComponent";
import { HexCell } from "../../../hex/HexCell";
import { HexSpatialIndex } from "./HexSpatialIndex";

interface TrackedHexPosition {
  readonly cell: HexCell;
  readonly storyIndex: number;
}

/**
 * Keeps HexSpatialIndex synchronized with ECS HexPositionComponent values.
 */
export class HexSpatialIndexSystem implements System {
  private readonly entityManager: EntityManager;
  private readonly spatialIndex: HexSpatialIndex;
  private readonly trackedEntityCells: Map<string, TrackedHexPosition>;

  public constructor(entityManager: EntityManager, spatialIndex: HexSpatialIndex) {
    this.entityManager = entityManager;
    this.spatialIndex = spatialIndex;
    this.trackedEntityCells = new Map<string, TrackedHexPosition>();
  }

  public update(_deltaSeconds: number): void {
    const entitiesWithHexPosition = this.entityManager.query(HexPositionComponent);
    const currentEntityIds = new Set<string>();

    for (const entity of entitiesWithHexPosition) {
      const entityId = entity.getId();
      currentEntityIds.add(entityId);

      const hexPosition = entity.getComponent(HexPositionComponent);
      const previousPosition = this.trackedEntityCells.get(entityId);
      const currentCell = hexPosition.currentCell;
      const currentStoryIndex = hexPosition.currentStoryIndex;

      if (!previousPosition) {
        this.spatialIndex.addEntity(entityId, currentCell, currentStoryIndex);
        this.trackedEntityCells.set(entityId, {
          cell: new HexCell(currentCell.q, currentCell.r),
          storyIndex: currentStoryIndex
        });
        continue;
      }

      if (!previousPosition.cell.equals(currentCell) || previousPosition.storyIndex !== currentStoryIndex) {
        this.spatialIndex.moveEntity(
          entityId,
          previousPosition.cell,
          currentCell,
          previousPosition.storyIndex,
          currentStoryIndex
        );
        this.trackedEntityCells.set(entityId, {
          cell: new HexCell(currentCell.q, currentCell.r),
          storyIndex: currentStoryIndex
        });
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
