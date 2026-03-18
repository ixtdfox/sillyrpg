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
  /**
   * Fixed yaw offset to align movement-facing yaw with the imported model forward axis.
   * Keep in one place so model forward corrections are easy to tune.
   */
  private static readonly MODEL_FORWARD_YAW_OFFSET = 0;

  /** Minimum horizontal movement magnitude required before updating facing. */
  private static readonly FACING_DIRECTION_EPSILON = 1e-4;
  /** Max yaw rotation speed (radians per second) while turning toward movement direction. */
  private static readonly FACING_TURN_SPEED = Math.PI * 6;

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
    if (!hexPosition.targetCell) {
      return;
    }

    if (pathMovement.isMoving && !this.isActivePathForTarget(pathMovement, hexPosition.targetCell)) {
      pathMovement.resetPathState();
    }

    if (pathMovement.isMoving) {
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

  private isActivePathForTarget(pathMovement: HexPathMovementComponent, targetCell: HexPositionComponent["targetCell"]): boolean {
    if (!targetCell || pathMovement.pathCells.length === 0) {
      return false;
    }

    const activeDestination = pathMovement.pathCells[pathMovement.pathCells.length - 1];
    return activeDestination.equals(targetCell);
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
    this.updateFacingRotation(transform, toNext, deltaSeconds);

    if (remainingDistance <= maxStepDistance) {
      this.completeCurrentStep(transform, hexPosition, pathMovement, nextCell, nextCellCenter);
      return;
    }

    const frameDelta = direction.scale(maxStepDistance);
    transform.value.addInPlace(frameDelta);
  }

  private updateFacingRotation(transform: TransformComponent, movementVector: Vector3, deltaSeconds: number): void {
    const horizontalMagnitudeSquared = movementVector.x * movementVector.x + movementVector.z * movementVector.z;
    const epsilonSquared = MovementSystem.FACING_DIRECTION_EPSILON * MovementSystem.FACING_DIRECTION_EPSILON;
    if (horizontalMagnitudeSquared <= epsilonSquared) {
      return;
    }

    const targetYaw = Math.atan2(movementVector.x, movementVector.z) + MovementSystem.MODEL_FORWARD_YAW_OFFSET;
    const yawDelta = this.wrapToPi(targetYaw - transform.rotation.y);
    const maxYawStep = MovementSystem.FACING_TURN_SPEED * deltaSeconds;
    const clampedYawDelta = Math.max(-maxYawStep, Math.min(maxYawStep, yawDelta));
    transform.rotation.y = this.wrapToPi(transform.rotation.y + clampedYawDelta);
  }

  private wrapToPi(angle: number): number {
    return Math.atan2(Math.sin(angle), Math.cos(angle));
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
