import { Scene as BabylonScene, Vector3 } from "@babylonjs/core";
import type { EntityManager } from "../EntityManager";
import type { System } from "../System";
import { TransformComponent } from "../components/TransformComponent";
import { HexPathMovementComponent } from "../components/HexPathMovementComponent";
import { HexPositionComponent } from "../components/HexPositionComponent";
import { CombatStatsComponent } from "../components/CombatStatsComponent";
import { HexCell } from "../../hex/HexCell";
import { getInGameSceneRuntimeContext, type InGameSceneRuntimeContext } from "../../scene/in-game/InGameSceneRuntimeContext";
import { WorldModeController } from "../../game/WorldModeController";
import { TurnBasedCombatState } from "../../game/TurnBasedCombatState";
import { HexMovementCostResolver } from "./hex/HexMovementCostResolver";
import { HexSpatialIndex } from "./hex/HexSpatialIndex";
import type { HexGrid } from "../../hex/HexGrid";
import { MultiFloorPathfinder } from "../../navigation/MultiFloorPathfinder";
import { NavigationGraph, type MovementSegment, type NavigationNode } from "../../navigation/NavigationGraph";

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
  private activeGrid: HexGrid | null;

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
    this.activeGrid = null;
  }

  public setScene(scene: BabylonScene | null): void {
    this.scene = scene;
    this.runtimeContext = scene ? getInGameSceneRuntimeContext(scene) : null;
    this.activeGrid = this.runtimeContext ? this.runtimeContext.hexGridRuntime.getGrid() : null;
  }

  public update(deltaSeconds: number): void {
    if (!this.runtimeContext) {
      return;
    }

    const currentGrid = this.runtimeContext.hexGridRuntime.getGrid();
    if (this.activeGrid !== currentGrid) {
      this.activeGrid = currentGrid;
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

    const targetStoryIndex = hexPosition.targetStoryIndex ?? hexPosition.currentStoryIndex;
    if (pathMovement.isMoving && !this.isActivePathForTarget(pathMovement, hexPosition.targetCell, targetStoryIndex)) {
      pathMovement.resetPathState();
    }

    if (pathMovement.isMoving) {
      return;
    }

    if (hexPosition.currentCell.equals(hexPosition.targetCell) && hexPosition.currentStoryIndex === targetStoryIndex) {
      hexPosition.targetCell = null;
      hexPosition.targetStoryIndex = null;
      pathMovement.resetPathState();
      return;
    }

    const path = this.findMovementSegments(entityId, hexPosition, hexPosition.targetCell, targetStoryIndex);
    if (!path || path.length === 0) {
      console.warn(
        `[MovementSystem] Cannot connect start ${hexPosition.currentStoryIndex}:${hexPosition.currentCell.q}:${hexPosition.currentCell.r} to target ${targetStoryIndex}:${hexPosition.targetCell.q}:${hexPosition.targetCell.r}.`
      );
      hexPosition.targetCell = null;
      hexPosition.targetStoryIndex = null;
      pathMovement.resetPathState();
      return;
    }

    const limitedPath = this.limitSegmentsByMovementBudget(path);
    if (limitedPath.length === 0) {
      hexPosition.targetCell = null;
      hexPosition.targetStoryIndex = null;
      pathMovement.resetPathState();
      return;
    }

    pathMovement.pathSegments = limitedPath;
    pathMovement.pathCells = [
      hexPosition.currentCell,
      ...limitedPath.filter((segment) => segment.kind === "walk").map((segment) => segment.cell)
    ];
    pathMovement.nextStepIndex = 1;
    pathMovement.currentSegmentIndex = 0;
    pathMovement.currentStairPointIndex = 0;
    pathMovement.activeTargetCell = hexPosition.targetCell;
    pathMovement.activeTargetStoryIndex = targetStoryIndex;
    pathMovement.isMoving = true;
  }

  private isActivePathForTarget(
    pathMovement: HexPathMovementComponent,
    targetCell: HexPositionComponent["targetCell"],
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
    hexPosition: HexPositionComponent,
    pathMovement: HexPathMovementComponent,
    deltaSeconds: number
  ): void {
    if (!pathMovement.isMoving || !this.runtimeContext) {
      return;
    }

    const segment = pathMovement.pathSegments[pathMovement.currentSegmentIndex];
    if (!segment) {
      this.finishMovement(hexPosition, pathMovement);
      return;
    }

    if (segment.kind === "walk") {
      this.advanceTowardWorldPoint(
        transform,
        pathMovement,
        segment.worldPosition,
        deltaSeconds,
        () => this.completeWalkSegment(entityId, transform, hexPosition, pathMovement, segment)
      );
      return;
    }

    const nextStairPoint = segment.traversalPath[pathMovement.currentStairPointIndex];
    if (!nextStairPoint) {
      this.completeStairSegment(entityId, hexPosition, pathMovement, segment);
      return;
    }

    this.advanceTowardWorldPoint(
      transform,
      pathMovement,
      nextStairPoint,
      deltaSeconds,
      () => this.completeStairPoint(entityId, hexPosition, pathMovement, segment)
    );
  }

  private advanceTowardWorldPoint(
    transform: TransformComponent,
    pathMovement: HexPathMovementComponent,
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

  private completeWalkSegment(
    entityId: string,
    transform: TransformComponent,
    hexPosition: HexPositionComponent,
    pathMovement: HexPathMovementComponent,
    segment: Extract<MovementSegment, { kind: "walk" }>
  ): void {
    const previousCell = hexPosition.currentCell;
    const previousStoryIndex = hexPosition.currentStoryIndex;
    transform.value.copyFrom(segment.worldPosition);
    hexPosition.currentCell = segment.cell;
    hexPosition.currentStoryIndex = segment.storyIndex;
    pathMovement.nextStepIndex += 1;
    pathMovement.currentSegmentIndex += 1;
    this.consumeMovementPoints(entityId, segment.cost, previousCell, segment.cell, previousStoryIndex, segment.storyIndex);

    if (pathMovement.currentSegmentIndex >= pathMovement.pathSegments.length) {
      this.finishMovement(hexPosition, pathMovement);
    }
  }

  private completeStairPoint(
    entityId: string,
    hexPosition: HexPositionComponent,
    pathMovement: HexPathMovementComponent,
    segment: Extract<MovementSegment, { kind: "stair" }>
  ): void {
    pathMovement.currentStairPointIndex += 1;

    if (pathMovement.currentStairPointIndex >= segment.traversalPath.length) {
      this.completeStairSegment(entityId, hexPosition, pathMovement, segment);
    }
  }

  private completeStairSegment(
    entityId: string,
    hexPosition: HexPositionComponent,
    pathMovement: HexPathMovementComponent,
    segment: Extract<MovementSegment, { kind: "stair" }>
  ): void {
    hexPosition.currentCell = segment.toCell;
    hexPosition.currentStoryIndex = segment.toStoryIndex;
    pathMovement.currentStairPointIndex = 0;
    pathMovement.currentSegmentIndex += 1;
    this.consumeMovementPoints(entityId, segment.cost);

    if (pathMovement.currentSegmentIndex >= pathMovement.pathSegments.length) {
      this.finishMovement(hexPosition, pathMovement);
    }
  }

  private finishMovement(hexPosition: HexPositionComponent, pathMovement: HexPathMovementComponent): void {
    hexPosition.targetCell = null;
    hexPosition.targetStoryIndex = null;
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
      hexPosition.targetStoryIndex = null;
      return false;
    }

    const combatEntity = this.entityManager.getEntity(entityId);
    const combatStats = combatEntity?.tryGetComponent(CombatStatsComponent);
    if (!combatStats || combatStats.currentMp <= 0) {
      pathMovement.resetPathState();
      hexPosition.targetCell = null;
      hexPosition.targetStoryIndex = null;
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
    fromCell?: HexPositionComponent["currentCell"],
    toCell?: HexPositionComponent["currentCell"],
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
      ? this.movementCostResolver.getStepCost(fromCell, toCell)
      : cost;
    combatStats.currentMp = Math.max(0, combatStats.currentMp - stepCost);
  }

  private findMovementSegments(
    entityId: string,
    hexPosition: HexPositionComponent,
    targetCell: HexCell,
    targetStoryIndex: number
  ): MovementSegment[] | null {
    if (!this.runtimeContext) {
      return null;
    }

    const grid = this.runtimeContext.hexGridRuntime.getGrid();
    const registry = this.runtimeContext.hexGridRuntime.getBuildingNavigationRegistry();
    const graph = new NavigationGraph(grid, registry.getStairConnectors(), registry.getStoryYByStory());
    const pathfinder = new MultiFloorPathfinder(graph, registry.getShowStairNavigationDebug());
    return pathfinder.findPath({
      fromCell: hexPosition.currentCell,
      fromStoryIndex: hexPosition.currentStoryIndex,
      toCell: targetCell,
      toStoryIndex: targetStoryIndex,
      occupied: (node) => this.isOccupiedByOtherEntity(entityId, hexPosition, node)
    });
  }

  private isOccupiedByOtherEntity(entityId: string, hexPosition: HexPositionComponent, node: NavigationNode): boolean {
    if (node.cell.equals(hexPosition.currentCell) && node.storyIndex === hexPosition.currentStoryIndex) {
      return false;
    }

    if (!this.worldModeController.isTurnBased()) {
      return false;
    }

    const entitiesAtCell = this.spatialIndex.getEntitiesAt(node.cell, node.storyIndex);
    return entitiesAtCell.some((occupantId) => occupantId !== entityId);
  }
}
