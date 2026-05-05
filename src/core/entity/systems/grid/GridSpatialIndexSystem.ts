import type { EntityManager } from "../../EntityManager";
import type { System } from "../../System";
import { GridPositionComponent } from "../../components/GridPositionComponent";
import { GridCell } from "../../../grid/GridCell";
import { GridSpatialIndex } from "./GridSpatialIndex";

interface TrackedGridPosition {
  readonly cell: GridCell;
  readonly storyIndex: number;
}

/**
 * Keeps GridSpatialIndex synchronized with ECS GridPositionComponent values.
 */
export class GridSpatialIndexSystem implements System {
  private readonly entityManager: EntityManager;
  private readonly spatialIndex: GridSpatialIndex;
  private readonly trackedEntityCells: Map<string, TrackedGridPosition>;

  public constructor(entityManager: EntityManager, spatialIndex: GridSpatialIndex) {
    this.entityManager = entityManager;
    this.spatialIndex = spatialIndex;
    this.trackedEntityCells = new Map<string, TrackedGridPosition>();
  }

  public update(_deltaSeconds: number): void {
    const entitiesWithGridPosition = this.entityManager.query(GridPositionComponent);
    const currentEntityIds = new Set<string>();

    for (const entity of entitiesWithGridPosition) {
      const entityId = entity.getId();
      currentEntityIds.add(entityId);

      const gridPosition = entity.getComponent(GridPositionComponent);
      const previousPosition = this.trackedEntityCells.get(entityId);
      const currentCell = gridPosition.currentCell;
      const currentStoryIndex = gridPosition.currentStoryIndex;

      if (!previousPosition) {
        this.spatialIndex.addEntity(entityId, currentCell, currentStoryIndex);
        this.trackedEntityCells.set(entityId, {
          cell: new GridCell(currentCell.x, currentCell.z),
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
          cell: new GridCell(currentCell.x, currentCell.z),
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
