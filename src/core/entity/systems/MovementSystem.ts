import { Scene as BabylonScene, Vector3 } from "@babylonjs/core";
import type { EntityManager } from "../EntityManager";
import type { System } from "../System";
import { TransformComponent } from "../components/TransformComponent";
import { HexPathMovementComponent } from "../components/HexPathMovementComponent";
import { HexPositionComponent } from "../components/HexPositionComponent";
import { HexPathfinder } from "../../hex/HexPathfinder";
import { getInGameSceneRuntimeContext, type InGameSceneRuntimeContext } from "../../scene/in-game/InGameSceneRuntimeContext";

/**
 * Executes path-based hex movement and synchronizes transform positions.
 */
export class MovementSystem implements System {
  private readonly entityManager: EntityManager;
  private scene: BabylonScene | null;
  private runtimeContext: InGameSceneRuntimeContext | null;
  private pathfinder: HexPathfinder | null;

  public constructor(entityManager: EntityManager) {
    this.entityManager = entityManager;
    this.scene = null;
    this.runtimeContext = null;
    this.pathfinder = null;
  }

  public setScene(scene: BabylonScene | null): void {
    this.scene = scene;
    this.runtimeContext = scene ? getInGameSceneRuntimeContext(scene) : null;
    this.pathfinder = this.runtimeContext ? new HexPathfinder(this.runtimeContext.hexGridRuntime.getGrid()) : null;
  }

  public update(deltaSeconds: number): void {
    if (!this.runtimeContext || !this.pathfinder) {
      return;
    }

    const movingEntities = this.entityManager.query(TransformComponent, HexPositionComponent, HexPathMovementComponent);

    for (const entity of movingEntities) {
      const transform = entity.getComponent(TransformComponent);
      const hexPosition = entity.getComponent(HexPositionComponent);
      const pathMovement = entity.getComponent(HexPathMovementComponent);
      this.tryInitializePath(hexPosition, pathMovement);
      this.advanceMovementStep(transform, hexPosition, pathMovement, deltaSeconds);
    }
  }

  private tryInitializePath(hexPosition: HexPositionComponent, pathMovement: HexPathMovementComponent): void {
    if (pathMovement.isMoving || !hexPosition.targetCell) {
      return;
    }

    if (hexPosition.currentCell.equals(hexPosition.targetCell)) {
      hexPosition.targetCell = null;
      pathMovement.resetPathState();
      return;
    }

    const path = this.pathfinder?.findPath(hexPosition.currentCell, hexPosition.targetCell) ?? null;
    if (!path || path.length < 2) {
      hexPosition.targetCell = null;
      pathMovement.resetPathState();
      return;
    }

    pathMovement.pathCells = path;
    pathMovement.nextStepIndex = 1;
    pathMovement.isMoving = true;
  }

  private advanceMovementStep(
    transform: TransformComponent,
    hexPosition: HexPositionComponent,
    pathMovement: HexPathMovementComponent,
    deltaSeconds: number
  ): void {
    if (!pathMovement.isMoving || !this.runtimeContext) {
      return;
    }

    const nextCell = pathMovement.pathCells[pathMovement.nextStepIndex];
    if (!nextCell) {
      this.finishMovement(hexPosition, pathMovement);
      return;
    }

    const nextCellCenter = this.runtimeContext.hexGridRuntime.getGrid().cellToWorld(nextCell, transform.value.y);
    const toNext = nextCellCenter.subtract(transform.value);
    const remainingDistance = toNext.length();

    if (remainingDistance <= Number.EPSILON) {
      this.completeCurrentStep(transform, hexPosition, pathMovement, nextCell, nextCellCenter);
      return;
    }

    const direction = toNext.scale(1 / remainingDistance);
    const maxStepDistance = pathMovement.speed * deltaSeconds;

    pathMovement.direction.copyFrom(direction);
    pathMovement.velocity.copyFrom(direction.scale(pathMovement.speed));

    if (remainingDistance <= maxStepDistance) {
      this.completeCurrentStep(transform, hexPosition, pathMovement, nextCell, nextCellCenter);
      return;
    }

    const frameDelta = direction.scale(maxStepDistance);
    transform.value.addInPlace(frameDelta);
  }

  private completeCurrentStep(
    transform: TransformComponent,
    hexPosition: HexPositionComponent,
    pathMovement: HexPathMovementComponent,
    reachedCell: HexPositionComponent["currentCell"],
    reachedCellCenter: Vector3
  ): void {
    transform.value.copyFrom(reachedCellCenter);
    hexPosition.currentCell = reachedCell;
    pathMovement.nextStepIndex += 1;

    if (pathMovement.nextStepIndex >= pathMovement.pathCells.length) {
      this.finishMovement(hexPosition, pathMovement);
    }
  }

  private finishMovement(hexPosition: HexPositionComponent, pathMovement: HexPathMovementComponent): void {
    hexPosition.targetCell = null;
    pathMovement.resetPathState();
  }
}
