import { Scene as BabylonScene, Vector3 } from "@babylonjs/core";
import type { EntityManager } from "../EntityManager";
import type { System } from "../System";
import { TransformComponent } from "../components/TransformComponent";
import { GridPathMovementComponent } from "../components/GridPathMovementComponent";
import { GridPositionComponent } from "../components/GridPositionComponent";
import { CombatStatsComponent } from "../components/CombatStatsComponent";
import { GridCell } from "../../grid/GridCell";
import { getInGameSceneRuntimeContext, type InGameSceneRuntimeContext } from "../../scene/in-game/InGameSceneRuntimeContext";
import { WorldModeController } from "../../game/WorldModeController";
import { TurnBasedCombatState } from "../../game/TurnBasedCombatState";
import { GridMovementCostResolver } from "./grid/GridMovementCostResolver";
import { GridSpatialIndex } from "./grid/GridSpatialIndex";
import type { RectGrid } from "../../grid/RectGrid";
import type { MovementSegment, NavigationNode } from "../../navigation/NavigationGraph";
import { GridNavigationPathService, RectNavigationDebugFlag } from "../../navigation/GridNavigationPathService";

/**
 * Executes path-based grid movement and synchronizes transform positions.
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
  private readonly movementCostResolver: GridMovementCostResolver;
  private readonly spatialIndex: GridSpatialIndex;
  private scene: BabylonScene | null;
  private runtimeContext: InGameSceneRuntimeContext | null;
  private activeGrid: RectGrid | null;

  public constructor(
    entityManager: EntityManager,
    worldModeController: WorldModeController,
    combatState: TurnBasedCombatState,
    movementCostResolver: GridMovementCostResolver,
    spatialIndex: GridSpatialIndex
  ) {
    this.entityManager = entityManager;
    this.worldModeController = worldModeController;
    this.combatState = combatState;
    this.movementCostResolver = movementCostResolver;
    this.spatialIndex = spatialIndex;
    this.scene = null;
    this.runtimeContext = null;
    this.activeGrid = null;
  }

  public setScene(scene: BabylonScene | null): void {
    this.scene = scene;
    this.runtimeContext = scene ? getInGameSceneRuntimeContext(scene) : null;
    this.activeGrid = this.runtimeContext ? this.runtimeContext.gridRuntime.getGrid() : null;
    this.movementCostResolver.setMovementCostProvider(
      this.runtimeContext
        ? (cell, storyIndex) => this.runtimeContext?.gridRuntime.getMovementCost(cell, storyIndex) ?? 1
        : null
    );
  }

  public update(deltaSeconds: number): void {
    if (!this.runtimeContext) {
      return;
    }

    const currentGrid = this.runtimeContext.gridRuntime.getGrid();
    if (this.activeGrid !== currentGrid) {
      this.activeGrid = currentGrid;
    }

    const movingEntities = this.entityManager.query(TransformComponent, GridPositionComponent, GridPathMovementComponent);

    for (const entity of movingEntities) {
      const transform = entity.getComponent(TransformComponent);
      const gridPosition = entity.getComponent(GridPositionComponent);
      const pathMovement = entity.getComponent(GridPathMovementComponent);
      if (!this.canEntityMove(entity.getId(), gridPosition, pathMovement)) {
        continue;
      }

      this.tryInitializePath(entity.getId(), gridPosition, pathMovement);
      this.advanceMovementStep(entity.getId(), transform, gridPosition, pathMovement, deltaSeconds);
    }
  }

  private tryInitializePath(entityId: string, gridPosition: GridPositionComponent, pathMovement: GridPathMovementComponent): void {
    if (!gridPosition.targetCell) {
      return;
    }

    const targetStoryIndex = gridPosition.targetStoryIndex ?? gridPosition.currentStoryIndex;
    if (pathMovement.isMoving && !this.isActivePathForTarget(pathMovement, gridPosition.targetCell, targetStoryIndex)) {
      pathMovement.resetPathState();
    }

    if (pathMovement.isMoving) {
      return;
    }

    if (gridPosition.currentCell.equals(gridPosition.targetCell) && gridPosition.currentStoryIndex === targetStoryIndex) {
      gridPosition.targetCell = null;
      gridPosition.targetStoryIndex = null;
      pathMovement.resetPathState();
      return;
    }

    const path = this.findMovementSegments(entityId, gridPosition, gridPosition.targetCell, targetStoryIndex);
    if (!path || path.length === 0) {
      console.warn(
        `[MovementSystem] Cannot connect start ${gridPosition.currentStoryIndex}:${gridPosition.currentCell.x}:${gridPosition.currentCell.z} to target ${targetStoryIndex}:${gridPosition.targetCell.x}:${gridPosition.targetCell.z}.`
      );
      gridPosition.targetCell = null;
      gridPosition.targetStoryIndex = null;
      pathMovement.resetPathState();
      return;
    }

    const limitedPath = this.limitSegmentsByMovementBudget(path);
    if (limitedPath.length === 0) {
      gridPosition.targetCell = null;
      gridPosition.targetStoryIndex = null;
      pathMovement.resetPathState();
      return;
    }

    pathMovement.pathSegments = limitedPath;
    pathMovement.pathCells = [gridPosition.currentCell, ...limitedPath.map((segment) => segment.toCell)];
    pathMovement.nextStepIndex = 1;
    pathMovement.currentSegmentIndex = 0;
    pathMovement.currentPointIndex = 0;
    pathMovement.activeTargetCell = gridPosition.targetCell;
    pathMovement.activeTargetStoryIndex = targetStoryIndex;
    pathMovement.isMoving = true;
  }

  private isActivePathForTarget(
    pathMovement: GridPathMovementComponent,
    targetCell: GridPositionComponent["targetCell"],
    targetStoryIndex: number
  ): boolean {
    if (!targetCell || !pathMovement.activeTargetCell || pathMovement.activeTargetStoryIndex === null) {
      return false;
    }

    return pathMovement.activeTargetCell.equals(targetCell) && pathMovement.activeTargetStoryIndex === targetStoryIndex;
  }

  private advanceMovementStep(
    entityId: string,
    transform: TransformComponent,
    gridPosition: GridPositionComponent,
    pathMovement: GridPathMovementComponent,
    deltaSeconds: number
  ): void {
    if (!pathMovement.isMoving || !this.runtimeContext) {
      return;
    }

    const segment = pathMovement.pathSegments[pathMovement.currentSegmentIndex];
    if (!segment) {
      this.finishMovement(gridPosition, pathMovement);
      return;
    }

    const routePoint = segment.points[pathMovement.currentPointIndex];
    if (!routePoint) {
      this.completeRouteSegment(entityId, transform, gridPosition, pathMovement, segment);
      return;
    }

    this.advanceTowardWorldPoint(
      transform,
      pathMovement,
      routePoint.position,
      deltaSeconds,
      () => this.completeRoutePoint(entityId, transform, gridPosition, pathMovement, segment)
    );
  }

  private advanceTowardWorldPoint(
    transform: TransformComponent,
    pathMovement: GridPathMovementComponent,
    targetPoint: Vector3,
    deltaSeconds: number,
    onReached: () => void
  ): void {
    const toNext = targetPoint.subtract(transform.value);
    const remainingDistance = toNext.length();

    if (remainingDistance <= Number.EPSILON) {
      onReached();
      return;
    }

    const direction = toNext.scale(1 / remainingDistance);
    const maxStepDistance = pathMovement.speed * deltaSeconds;

    pathMovement.direction.copyFrom(direction);
    pathMovement.velocity.copyFrom(direction.scale(pathMovement.speed));
    this.updateFacingRotation(transform, toNext, deltaSeconds);

    if (remainingDistance <= maxStepDistance) {
      transform.value.copyFrom(targetPoint);
      onReached();
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

  private completeRoutePoint(
    entityId: string,
    transform: TransformComponent,
    gridPosition: GridPositionComponent,
    pathMovement: GridPathMovementComponent,
    segment: MovementSegment
  ): void {
    pathMovement.currentPointIndex += 1;
    if (pathMovement.currentPointIndex >= segment.points.length) {
      this.completeRouteSegment(entityId, transform, gridPosition, pathMovement, segment);
    }
  }

  private completeRouteSegment(
    entityId: string,
    transform: TransformComponent,
    gridPosition: GridPositionComponent,
    pathMovement: GridPathMovementComponent,
    segment: MovementSegment
  ): void {
    const previousCell = gridPosition.currentCell;
    const previousStoryIndex = gridPosition.currentStoryIndex;
    const finalPoint = segment.points[segment.points.length - 1];
    if (finalPoint) {
      transform.value.copyFrom(finalPoint.position);
    }
    gridPosition.currentCell = segment.toCell;
    gridPosition.currentStoryIndex = segment.toStoryIndex;
    pathMovement.nextStepIndex += 1;
    pathMovement.currentPointIndex = 0;
    pathMovement.currentSegmentIndex += 1;
    this.consumeMovementPoints(
      entityId,
      segment.cost,
      previousCell,
      segment.toCell,
      previousStoryIndex,
      segment.toStoryIndex
    );

    if (pathMovement.currentSegmentIndex >= pathMovement.pathSegments.length) {
      this.finishMovement(gridPosition, pathMovement);
    }
  }

  private finishMovement(gridPosition: GridPositionComponent, pathMovement: GridPathMovementComponent): void {
    gridPosition.targetCell = null;
    gridPosition.targetStoryIndex = null;
    pathMovement.resetPathState();
  }

  private canEntityMove(
    entityId: string,
    gridPosition: GridPositionComponent,
    pathMovement: GridPathMovementComponent
  ): boolean {
    if (!this.worldModeController.isTurnBased()) {
      return true;
    }

    if (!this.combatState.isActiveEntity(entityId)) {
      pathMovement.resetPathState();
      gridPosition.targetCell = null;
      gridPosition.targetStoryIndex = null;
      return false;
    }

    const combatEntity = this.entityManager.getEntity(entityId);
    const combatStats = combatEntity?.tryGetComponent(CombatStatsComponent);
    if (!combatStats || combatStats.currentMp <= 0) {
      pathMovement.resetPathState();
      gridPosition.targetCell = null;
      gridPosition.targetStoryIndex = null;
      return false;
    }

    return true;
  }

  private limitSegmentsByMovementBudget(path: readonly MovementSegment[]): MovementSegment[] {
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
    const result: MovementSegment[] = [];

    for (const segment of path) {
      const stepCost = segment.cost;
      if (remainingMp < stepCost) {
        break;
      }

      remainingMp -= stepCost;
      result.push(segment);
    }

    return result;
  }

  private consumeMovementPoints(
    entityId: string,
    cost: number,
    fromCell?: GridPositionComponent["currentCell"],
    toCell?: GridPositionComponent["currentCell"],
    fromStoryIndex = 0,
    toStoryIndex = 0
  ): void {
    if (!this.worldModeController.isTurnBased()) {
      return;
    }

    const entity = this.entityManager.getEntity(entityId);
    const combatStats = entity?.tryGetComponent(CombatStatsComponent);
    if (!combatStats) {
      return;
    }

    const stepCost = fromCell && toCell && fromStoryIndex === toStoryIndex
      ? this.movementCostResolver.getStepCost(fromCell, toCell, toStoryIndex)
      : cost;
    combatStats.currentMp = Math.max(0, combatStats.currentMp - stepCost);
  }

  private findMovementSegments(
    entityId: string,
    gridPosition: GridPositionComponent,
    targetCell: GridCell,
    targetStoryIndex: number
  ): MovementSegment[] | null {
    if (!this.runtimeContext) {
      return null;
    }

    const combatStats = this.entityManager.getEntity(entityId)?.tryGetComponent(CombatStatsComponent);
    const path = GridNavigationPathService.fromGridRuntime(this.runtimeContext.gridRuntime).findPath({
      fromCell: gridPosition.currentCell,
      fromStoryIndex: gridPosition.currentStoryIndex,
      toCell: targetCell,
      toStoryIndex: targetStoryIndex,
      activeEntityId: entityId,
      movementPoints: this.worldModeController.isTurnBased() ? combatStats?.currentMp : undefined,
      occupied: (node) => this.isOccupiedByOtherEntity(entityId, gridPosition, node)
    });
    this.logPathDiagnostics(gridPosition.currentCell, gridPosition.currentStoryIndex, targetCell, targetStoryIndex, path);
    return path;
  }

  private logPathDiagnostics(
    fromCell: GridCell,
    fromStoryIndex: number,
    toCell: GridCell,
    toStoryIndex: number,
    path: MovementSegment[] | null
  ): void {
    if (!this.runtimeContext || !path) {
      return;
    }
    if (!new RectNavigationDebugFlag().isEnabled()) {
      return;
    }

    let cursorCell = fromCell;
    let cursorStory = fromStoryIndex;
    let crossedBlockedEdge = false;
    const steps: string[] = [`${cursorStory}:${cursorCell.x}:${cursorCell.z}`];
    for (const segment of path) {
      const blocked = segment.fromStoryIndex === segment.toStoryIndex
        ? this.runtimeContext.gridRuntime.isNavigationEdgeBlocked(cursorCell, segment.toCell, cursorStory)
        : false;
      if (blocked) {
        crossedBlockedEdge = true;
      }
      cursorCell = segment.toCell;
      cursorStory = segment.toStoryIndex;
      steps.push(
        `${cursorStory}:${cursorCell.x}:${cursorCell.z}[${segment.kind},from=${segment.fromStoryIndex}:${segment.fromCell.x}:${segment.fromCell.z},blocked=${blocked},stair=${segment.metadata?.stairId ?? "n/a"}]`
      );
    }

    console.debug(
      `[RectNavPath] from=${fromStoryIndex}:${fromCell.x}:${fromCell.z} to=${toStoryIndex}:${toCell.x}:${toCell.z} blockedCrossing=${crossedBlockedEdge} path=${steps.join(" -> ")}`
    );
  }

  private isOccupiedByOtherEntity(entityId: string, gridPosition: GridPositionComponent, node: NavigationNode): boolean {
    if (node.cell.equals(gridPosition.currentCell) && node.storyIndex === gridPosition.currentStoryIndex) {
      return false;
    }

    if (!this.worldModeController.isTurnBased()) {
      return false;
    }

    const entitiesAtCell = this.spatialIndex.getEntitiesAt(node.cell, node.storyIndex);
    return entitiesAtCell.some((occupantId) => occupantId !== entityId);
  }
}
