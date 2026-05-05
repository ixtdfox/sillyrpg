import { Scene as BabylonScene } from "@babylonjs/core";
import type { EntityManager } from "../EntityManager";
import type { System } from "../System";
import { AIComponent } from "../components/AIComponent";
import { GridPathMovementComponent } from "../components/GridPathMovementComponent";
import { GridPositionComponent } from "../components/GridPositionComponent";
import { PatrolComponent } from "../components/PatrolComponent";
import { GridCell } from "../../grid/GridCell";
import { getInGameSceneRuntimeContext, type InGameSceneRuntimeContext } from "../../scene/in-game/InGameSceneRuntimeContext";
import { WorldModeController } from "../../game/WorldModeController";
import { GridNavigationPathService } from "../../navigation/GridNavigationPathService";

/**
 * Assigns local random patrol targets for idle AI entities.
 */
export class PatrolSystem implements System {
  private readonly entityManager: EntityManager;
  private readonly worldModeController: WorldModeController;
  private runtimeContext: InGameSceneRuntimeContext | null;

  public constructor(entityManager: EntityManager, worldModeController: WorldModeController) {
    this.entityManager = entityManager;
    this.worldModeController = worldModeController;
    this.runtimeContext = null;
  }

  public setScene(scene: BabylonScene | null): void {
    this.runtimeContext = scene ? getInGameSceneRuntimeContext(scene) : null;
  }

  public update(_deltaSeconds: number): void {
    if (!this.runtimeContext) {
      return;
    }
    if (this.worldModeController.isTurnBased()) {
      return;
    }

    const entities = this.entityManager.query(AIComponent, PatrolComponent, GridPositionComponent, GridPathMovementComponent);

    for (const entity of entities) {
      const patrol = entity.getComponent(PatrolComponent);
      const gridPosition = entity.getComponent(GridPositionComponent);
      const pathMovement = entity.getComponent(GridPathMovementComponent);

      if (!patrol.anchorCell) {
        patrol.anchorCell = gridPosition.currentCell;
      }

      if (patrol.currentPatrolTargetCell && gridPosition.currentCell.equals(patrol.currentPatrolTargetCell)) {
        patrol.currentPatrolTargetCell = null;
      }

      if (gridPosition.targetCell || pathMovement.isMoving) {
        continue;
      }

      const nextDestination = this.pickNextDestination(gridPosition.currentCell, gridPosition.currentStoryIndex, patrol);
      if (!nextDestination) {
        continue;
      }

      patrol.currentPatrolTargetCell = nextDestination;
      gridPosition.targetCell = nextDestination;
      gridPosition.targetStoryIndex = gridPosition.currentStoryIndex;
    }
  }

  private pickNextDestination(currentCell: GridCell, storyIndex: number, patrol: PatrolComponent): GridCell | null {
    if (!this.runtimeContext || !patrol.anchorCell) {
      return null;
    }

    const grid = this.runtimeContext.gridRuntime.getGrid();
    const navigationPathService = GridNavigationPathService.fromGridRuntime(this.runtimeContext.gridRuntime);

    for (let attempt = 0; attempt < patrol.maxCandidateAttempts; attempt += 1) {
      const dq = this.randomInt(-patrol.radiusCells, patrol.radiusCells);
      const dr = this.randomInt(-patrol.radiusCells, patrol.radiusCells);
      const candidate = new GridCell(patrol.anchorCell.x + dq, patrol.anchorCell.z + dr);

      if (!grid.contains(candidate)) {
        continue;
      }

      if (!this.runtimeContext.gridRuntime.isWalkableCell(candidate, storyIndex)) {
        continue;
      }

      if (candidate.equals(currentCell)) {
        continue;
      }

      if (patrol.anchorCell.distance(candidate) > patrol.radiusCells) {
        continue;
      }

      const path = navigationPathService.findPath({
        fromCell: currentCell,
        fromStoryIndex: storyIndex,
        toCell: candidate,
        toStoryIndex: storyIndex
      });
      if (!path || path.length === 0) {
        continue;
      }

      return candidate;
    }

    return null;
  }

  private randomInt(minInclusive: number, maxInclusive: number): number {
    const range = maxInclusive - minInclusive + 1;
    return Math.floor(Math.random() * range) + minInclusive;
  }
}
