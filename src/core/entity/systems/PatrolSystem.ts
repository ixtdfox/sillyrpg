import { Scene as BabylonScene } from "@babylonjs/core";
import type { EntityManager } from "../EntityManager";
import type { System } from "../System";
import { AIComponent } from "../components/AIComponent";
import { HexPathMovementComponent } from "../components/HexPathMovementComponent";
import { HexPositionComponent } from "../components/HexPositionComponent";
import { PatrolComponent } from "../components/PatrolComponent";
import { HexCell } from "../../hex/HexCell";
import { HexPathfinder } from "../../hex/HexPathfinder";
import { getInGameSceneRuntimeContext, type InGameSceneRuntimeContext } from "../../scene/in-game/InGameSceneRuntimeContext";
import { WorldModeController } from "../../game/WorldModeController";

/**
 * Assigns local random patrol targets for idle AI entities.
 */
export class PatrolSystem implements System {
  private readonly entityManager: EntityManager;
  private readonly worldModeController: WorldModeController;
  private runtimeContext: InGameSceneRuntimeContext | null;
  private pathfinder: HexPathfinder | null;

  public constructor(entityManager: EntityManager, worldModeController: WorldModeController) {
    this.entityManager = entityManager;
    this.worldModeController = worldModeController;
    this.runtimeContext = null;
    this.pathfinder = null;
  }

  public setScene(scene: BabylonScene | null): void {
    this.runtimeContext = scene ? getInGameSceneRuntimeContext(scene) : null;
    this.pathfinder = this.runtimeContext ? new HexPathfinder(this.runtimeContext.hexGridRuntime.getGrid()) : null;
  }

  public update(_deltaSeconds: number): void {
    if (!this.runtimeContext || !this.pathfinder) {
      return;
    }
    if (this.worldModeController.isTurnBased()) {
      return;
    }

    const entities = this.entityManager.query(AIComponent, PatrolComponent, HexPositionComponent, HexPathMovementComponent);

    for (const entity of entities) {
      const patrol = entity.getComponent(PatrolComponent);
      const hexPosition = entity.getComponent(HexPositionComponent);
      const pathMovement = entity.getComponent(HexPathMovementComponent);

      if (!patrol.anchorCell) {
        patrol.anchorCell = hexPosition.currentCell;
      }

      if (patrol.currentPatrolTargetCell && hexPosition.currentCell.equals(patrol.currentPatrolTargetCell)) {
        patrol.currentPatrolTargetCell = null;
      }

      if (hexPosition.targetCell || pathMovement.isMoving) {
        continue;
      }

      const nextDestination = this.pickNextDestination(hexPosition.currentCell, patrol);
      if (!nextDestination) {
        continue;
      }

      patrol.currentPatrolTargetCell = nextDestination;
      hexPosition.targetCell = nextDestination;
    }
  }

  private pickNextDestination(currentCell: HexCell, patrol: PatrolComponent): HexCell | null {
    if (!this.runtimeContext || !this.pathfinder || !patrol.anchorCell) {
      return null;
    }

    const grid = this.runtimeContext.hexGridRuntime.getGrid();

    for (let attempt = 0; attempt < patrol.maxCandidateAttempts; attempt += 1) {
      const dq = this.randomInt(-patrol.radiusCells, patrol.radiusCells);
      const dr = this.randomInt(-patrol.radiusCells, patrol.radiusCells);
      const candidate = new HexCell(patrol.anchorCell.q + dq, patrol.anchorCell.r + dr);

      if (!grid.contains(candidate)) {
        continue;
      }

      if (candidate.equals(currentCell)) {
        continue;
      }

      if (patrol.anchorCell.distance(candidate) > patrol.radiusCells) {
        continue;
      }

      const path = this.pathfinder.findPath(currentCell, candidate);
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