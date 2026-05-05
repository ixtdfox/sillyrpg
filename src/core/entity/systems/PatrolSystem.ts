import { Scene as BabylonScene } from "@babylonjs/core";
import type { EntityManager } from "../EntityManager";
import type { System } from "../System";
import { AIComponent } from "../components/AIComponent";
import { GridPathMovementComponent } from "../components/GridPathMovementComponent";
import { GridPositionComponent } from "../components/GridPositionComponent";
import { PatrolComponent } from "../components/PatrolComponent";
import { GridCell } from "../../grid/GridCell";
import { RectPathfinder } from "../../grid/RectPathfinder";
import { getInGameSceneRuntimeContext, type InGameSceneRuntimeContext } from "../../scene/in-game/InGameSceneRuntimeContext";
import { WorldModeController } from "../../game/WorldModeController";

/**
 * Assigns local random patrol targets for idle AI entities.
 */
export class PatrolSystem implements System {
  private readonly entityManager: EntityManager;
  private readonly worldModeController: WorldModeController;
  private runtimeContext: InGameSceneRuntimeContext | null;
  private pathfinder: RectPathfinder | null;

  public constructor(entityManager: EntityManager, worldModeController: WorldModeController) {
    this.entityManager = entityManager;
    this.worldModeController = worldModeController;
    this.runtimeContext = null;
    this.pathfinder = null;
  }

  public setScene(scene: BabylonScene | null): void {
    this.runtimeContext = scene ? getInGameSceneRuntimeContext(scene) : null;
    this.pathfinder = this.runtimeContext ? new RectPathfinder(this.runtimeContext.gridRuntime.getGrid()) : null;
  }

  public update(_deltaSeconds: number): void {
    if (!this.runtimeContext || !this.pathfinder) {
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
    if (!this.runtimeContext || !this.pathfinder || !patrol.anchorCell) {
      return null;
    }

    const grid = this.runtimeContext.gridRuntime.getGrid();

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

      const pathfinder = new RectPathfinder(
        grid,
        (cell) => !this.runtimeContext!.gridRuntime.isWalkableCell(cell, storyIndex),
        (fromCell, toCell) => this.runtimeContext!.gridRuntime.isNavigationEdgeBlocked(fromCell, toCell, storyIndex)
      );
      const path = pathfinder.findPath(currentCell, candidate);
      if (!path || path.length < 2) {
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
