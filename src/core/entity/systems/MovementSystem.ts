import { Scene as BabylonScene, Vector3 } from "@babylonjs/core";
import type { EntityManager } from "../EntityManager";
import type { System } from "../System";
import { TransformComponent } from "../components/TransformComponent";
import { HexPathMovementComponent } from "../components/HexPathMovementComponent";
import { HexPositionComponent } from "../components/HexPositionComponent";
import { CombatStatsComponent } from "../components/CombatStatsComponent";
import { HexPathfinder } from "../../hex/HexPathfinder";
import { HexCell } from "../../hex/HexCell";
import { getInGameSceneRuntimeContext, type InGameSceneRuntimeContext } from "../../scene/in-game/InGameSceneRuntimeContext";
import { WorldModeController } from "../../game/WorldModeController";
import { TurnBasedCombatState } from "../../game/TurnBasedCombatState";
import { HexMovementCostResolver } from "./hex/HexMovementCostResolver";
import { HexSpatialIndex } from "./hex/HexSpatialIndex";

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
  private readonly worldModeController: WorldModeController;
  private readonly combatState: TurnBasedCombatState;
  private readonly movementCostResolver: HexMovementCostResolver;
  private readonly spatialIndex: HexSpatialIndex;
  private scene: BabylonScene | null;
  private runtimeContext: InGameSceneRuntimeContext | null;
  private pathfinder: HexPathfinder | null;

  public constructor(
    entityManager: EntityManager,
    worldModeController: WorldModeController,
    combatState: TurnBasedCombatState,
    movementCostResolver: HexMovementCostResolver,
    spatialIndex: HexSpatialIndex
  ) {
    this.entityManager = entityManager;
    this.worldModeController = worldModeController;
    this.combatState = combatState;
    this.movementCostResolver = movementCostResolver;
    this.spatialIndex = spatialIndex;
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
      if (!this.canEntityMove(entity.getId(), hexPosition, pathMovement)) {
        continue;
      }

      this.tryInitializePath(entity.getId(), hexPosition, pathMovement);
      this.advanceMovementStep(entity.getId(), transform, hexPosition, pathMovement, deltaSeconds);
    }
  }

  private tryInitializePath(entityId: string, hexPosition: HexPositionComponent, pathMovement: HexPathMovementComponent): void {
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

    const pathfinder = this.createPathfinder(entityId, hexPosition.currentCell);
    const path = pathfinder.findPath(hexPosition.currentCell, hexPosition.targetCell);
    if (!path || path.length < 2) {
      hexPosition.targetCell = null;
      pathMovement.resetPathState();
      return;
    }

    const limitedPath = this.limitPathByMovementBudget(path);
    if (limitedPath.length < 2) {
      hexPosition.targetCell = null;
      pathMovement.resetPathState();
      return;
    }

    pathMovement.pathCells = limitedPath;
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
    entityId: string,
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
      this.completeCurrentStep(entityId, transform, hexPosition, pathMovement, nextCell, nextCellCenter);
      return;
    }

    const direction = toNext.scale(1 / remainingDistance);
    const maxStepDistance = pathMovement.speed * deltaSeconds;

    pathMovement.direction.copyFrom(direction);
    pathMovement.velocity.copyFrom(direction.scale(pathMovement.speed));
    this.updateFacingRotation(transform, toNext, deltaSeconds);

    if (remainingDistance <= maxStepDistance) {
      this.completeCurrentStep(entityId, transform, hexPosition, pathMovement, nextCell, nextCellCenter);
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
    entityId: string,
    transform: TransformComponent,
    hexPosition: HexPositionComponent,
    pathMovement: HexPathMovementComponent,
    reachedCell: HexPositionComponent["currentCell"],
    reachedCellCenter: Vector3
  ): void {
    const previousCell = hexPosition.currentCell;
    transform.value.copyFrom(reachedCellCenter);
    hexPosition.currentCell = reachedCell;
    pathMovement.nextStepIndex += 1;
    this.consumeMovementPointsForStep(entityId, previousCell, reachedCell);

    if (pathMovement.nextStepIndex >= pathMovement.pathCells.length) {
      this.finishMovement(hexPosition, pathMovement);
    }
  }

  private finishMovement(hexPosition: HexPositionComponent, pathMovement: HexPathMovementComponent): void {
    hexPosition.targetCell = null;
    pathMovement.resetPathState();
  }

  private canEntityMove(
    entityId: string,
    hexPosition: HexPositionComponent,
    pathMovement: HexPathMovementComponent
  ): boolean {
    if (!this.worldModeController.isTurnBased()) {
      return true;
    }

    if (!this.combatState.isActiveEntity(entityId)) {
      pathMovement.resetPathState();
      hexPosition.targetCell = null;
      return false;
    }

    const combatEntity = this.entityManager.getEntity(entityId);
    const combatStats = combatEntity?.tryGetComponent(CombatStatsComponent);
    if (!combatStats || combatStats.currentMp <= 0) {
      pathMovement.resetPathState();
      hexPosition.targetCell = null;
      return false;
    }

    return true;
  }

  private limitPathByMovementBudget(path: readonly HexPositionComponent["currentCell"][]): HexPositionComponent["currentCell"][] {
    if (!this.worldModeController.isTurnBased()) {
      return [...path];
    }

    const activeEntityId = this.combatState.getActiveEntityId();
    const activeEntity = activeEntityId ? this.entityManager.getEntity(activeEntityId) : null;
    const combatStats = activeEntity?.tryGetComponent(CombatStatsComponent);
    if (!combatStats) {
      return [...path];
    }

    let remainingMp = combatStats.currentMp;
    const result = [path[0]];

    for (let index = 1; index < path.length; index += 1) {
      const stepCost = this.movementCostResolver.getStepCost(path[index - 1], path[index]);
      if (remainingMp < stepCost) {
        break;
      }

      remainingMp -= stepCost;
      result.push(path[index]);
    }

    return result;
  }

  private consumeMovementPointsForStep(entityId: string, fromCell: HexPositionComponent["currentCell"], toCell: HexPositionComponent["currentCell"]): void {
    if (!this.worldModeController.isTurnBased()) {
      return;
    }

    const entity = this.entityManager.getEntity(entityId);
    const combatStats = entity?.tryGetComponent(CombatStatsComponent);
    if (!combatStats) {
      return;
    }

    const stepCost = this.movementCostResolver.getStepCost(fromCell, toCell);
    combatStats.currentMp = Math.max(0, combatStats.currentMp - stepCost);
  }

  private createPathfinder(entityId: string, startCell: HexCell): HexPathfinder {
    if (!this.runtimeContext || !this.pathfinder || !this.worldModeController.isTurnBased()) {
      return this.pathfinder ?? new HexPathfinder(this.runtimeContext!.hexGridRuntime.getGrid());
    }

    const grid = this.runtimeContext.hexGridRuntime.getGrid();
    return new HexPathfinder(grid, (cell) => this.isBlockedInTurnBased(entityId, startCell, cell));
  }

  private isBlockedInTurnBased(entityId: string, startCell: HexCell, cell: HexCell): boolean {
    if (cell.equals(startCell)) {
      return false;
    }

    const entitiesAtCell = this.spatialIndex.getEntitiesAt(cell);
    return entitiesAtCell.some((occupantId) => occupantId !== entityId);
  }
}
