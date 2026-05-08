import { PointerEventTypes, Scene as BabylonScene } from "@babylonjs/core";
import type { Nullable, Observer, PointerInfo } from "@babylonjs/core";
import type { Entity } from "../Entity";
import type { EntityManager } from "../EntityManager";
import type { System } from "../System";
import { GridPathMovementComponent } from "../components/GridPathMovementComponent";
import { GridPositionComponent } from "../components/GridPositionComponent";
import { LocalPlayerComponent } from "../components/LocalPlayerComponent";
import { RelationsComponent } from "../components/RelationsComponent";
import { CombatStatsComponent } from "../components/CombatStatsComponent";
import { getInGameSceneRuntimeContext, type InGameSceneRuntimeContext } from "../../scene/in-game/InGameSceneRuntimeContext";
import { WorldModeController } from "../../game/WorldModeController";
import { TurnBasedCombatState } from "../../game/TurnBasedCombatState";
import { CombatInputController } from "../../game/CombatInputController";
import { CombatInputMode } from "../../game/CombatInputMode";
import { GridSpatialIndex } from "./grid/GridSpatialIndex";
import { CombatAttackTargetingService } from "./combat/CombatAttackTargetingService";
import type { PickedNavigationTarget } from "../../grid/RectGroundPickerController";
import { GridCell } from "../../grid/GridCell";
import { GridNavigationPathService } from "../../navigation/GridNavigationPathService";
import type { MovementSegment, NavigationNode } from "../../navigation/NavigationGraph";

/**
 * Handles local-player click-to-move intent on the ground grid grid.
 */
export class LocalPlayerInputSystem implements System {
  private readonly entityManager: EntityManager;
  private readonly worldModeController: WorldModeController;
  private readonly combatState: TurnBasedCombatState;
  private readonly combatInputController: CombatInputController;
  private readonly spatialIndex: GridSpatialIndex;
  private readonly attackTargetingService: CombatAttackTargetingService;
  private scene: BabylonScene | null;
  private runtimeContext: InGameSceneRuntimeContext | null;
  private localPlayerEntity: Entity | null;
  private pointerObserver: Nullable<Observer<PointerInfo>>;

  public constructor(
    entityManager: EntityManager,
    worldModeController: WorldModeController,
    combatState: TurnBasedCombatState,
    combatInputController: CombatInputController,
    spatialIndex: GridSpatialIndex,
    attackTargetingService: CombatAttackTargetingService
  ) {
    this.entityManager = entityManager;
    this.worldModeController = worldModeController;
    this.combatState = combatState;
    this.combatInputController = combatInputController;
    this.spatialIndex = spatialIndex;
    this.attackTargetingService = attackTargetingService;
    this.scene = null;
    this.runtimeContext = null;
    this.localPlayerEntity = null;
    this.pointerObserver = null;
  }

  public setScene(scene: BabylonScene | null): void {
    this.detachPointerObserver();

    this.scene = scene;
    this.runtimeContext = null;
    this.localPlayerEntity = null;

    if (!scene) {
      return;
    }

    this.runtimeContext = getInGameSceneRuntimeContext(scene);
    this.localPlayerEntity = this.resolveLocalPlayerEntity();
    this.tryAttachPointerObserver();
  }

  public update(_deltaSeconds: number): void {
    if (!this.scene || !this.localPlayerEntity || !this.localPlayerEntity.hasComponent(GridPositionComponent)) {
      this.localPlayerEntity = this.resolveLocalPlayerEntity();
    }

    const gridPosition = this.localPlayerEntity?.tryGetComponent(GridPositionComponent);
    if (gridPosition && this.runtimeContext) {
      this.runtimeContext.gridRuntime.setNavigationFallbackStoryIndex(gridPosition.currentStoryIndex);
      this.runtimeContext.gridRuntime.updateStairHoverAffordance(
        this.runtimeContext.gridRuntime.getHoveredNavigationTarget(gridPosition.currentStoryIndex),
        gridPosition.currentStoryIndex
      );
    }

    this.tryAttachPointerObserver();
  }

  private readonly onPointerEvent = (pointerInfo: PointerInfo): void => {
    if (pointerInfo.type !== PointerEventTypes.POINTERDOWN || pointerInfo.event.button !== 0) {
      return;
    }

    if (!this.runtimeContext || !this.localPlayerEntity || !this.localPlayerEntity.hasComponent(GridPositionComponent)) {
      return;
    }
    const inputMode = this.resolveCurrentInputMode();
    if (this.worldModeController.isTurnBased() && inputMode === CombatInputMode.NONE) {
      return;
    }

    const gridPosition = this.localPlayerEntity.getComponent(GridPositionComponent);
    const pickedTarget = this.runtimeContext.gridRuntime.getHoveredNavigationTarget(gridPosition.currentStoryIndex);
    if (!pickedTarget) {
      return;
    }

    if (this.worldModeController.isTurnBased() && inputMode === CombatInputMode.ATTACK) {
      if (pickedTarget.kind === "cell") {
        this.tryHandleAttackClick(pickedTarget.cell);
      }
      return;
    }

    if (!this.isMovementInputAllowed(inputMode)) {
      return;
    }

    if (pickedTarget.kind === "stair") {
      this.tryHandleStairClick(gridPosition, pickedTarget, this.localPlayerEntity.tryGetComponent(GridPathMovementComponent) ?? null);
      return;
    }

    const clickedCell = pickedTarget.cell;
    const clickedStoryIndex = pickedTarget.storyIndex;
    const isWalkable = this.runtimeContext.gridRuntime.isWalkableCell(clickedCell, clickedStoryIndex);
    const blockerRegistry = this.runtimeContext.gridRuntime.getNavigationBlockerRegistry();
    const isNeighborClick = gridPosition.currentStoryIndex === clickedStoryIndex &&
      gridPosition.currentCell.distance(clickedCell) === 1;
    const moveDebugInfo = blockerRegistry.getDebugInfoForMove(
      gridPosition.currentCell,
      clickedCell,
      clickedStoryIndex
    );
    if (isNeighborClick) {
      console.debug(
        `[GridNavigationMoveCheck] fromStory=${gridPosition.currentStoryIndex} from=${gridPosition.currentCell.x}:${gridPosition.currentCell.z} toStory=${clickedStoryIndex} to=${clickedCell.x}:${clickedCell.z} walkable=${isWalkable} edgeBlocked=${moveDebugInfo.edgeBlocked} openedByDoor=${moveDebugInfo.edgeOpenedByDoor} blockedEdgeCount=${moveDebugInfo.blockedEdgeCount}`
      );
    }
    console.debug(
      `[LocalPlayerInputSystem] Cell click mesh='${pickedTarget.pickedMeshName ?? "unknown"}' currentStory=${gridPosition.currentStoryIndex} fromCell=${gridPosition.currentCell.x}:${gridPosition.currentCell.z} targetStory=${clickedStoryIndex} cell=${clickedCell.x}:${clickedCell.z} walkable=${isWalkable} neighbor=${isNeighborClick} edgeBlocked=${isNeighborClick ? moveDebugInfo.edgeBlocked : "n/a"} edgeOpenedByDoor=${isNeighborClick ? moveDebugInfo.edgeOpenedByDoor : "n/a"} blockersForClickedCell=${moveDebugInfo.blockersForTargetCell.join(",") || "none"} blockedEdgeCount=${moveDebugInfo.blockedEdgeCount}`
    );
    if (!isWalkable) {
      console.debug(
        `[LocalPlayerInputSystem] Ignored non-walkable target mesh='${pickedTarget.pickedMeshName ?? "unknown"}' story=${clickedStoryIndex} cell=${clickedCell.x}:${clickedCell.z} blockedBy=${moveDebugInfo.blockersForTargetCell.join(",") || "none"}`
      );
      return;
    }

    if (gridPosition.currentCell.equals(clickedCell) && gridPosition.currentStoryIndex === clickedStoryIndex) {
      return;
    }

    if (
      gridPosition.targetCell &&
      gridPosition.targetCell.equals(clickedCell) &&
      (gridPosition.targetStoryIndex ?? gridPosition.currentStoryIndex) === clickedStoryIndex
    ) {
      return;
    }

    if (!this.runtimeContext.gridRuntime.getGrid().contains(clickedCell)) {
      return;
    }

    const pathMovement = this.localPlayerEntity.hasComponent(GridPathMovementComponent)
      ? this.localPlayerEntity.getComponent(GridPathMovementComponent)
      : null;

    if (
      this.worldModeController.isTurnBased() &&
      !this.canMoveToTargetInCombat(this.localPlayerEntity.getId(), gridPosition, clickedCell, clickedStoryIndex)
    ) {
      return;
    }

    gridPosition.targetCell = clickedCell;
    gridPosition.targetStoryIndex = clickedStoryIndex;
    pathMovement?.resetPathState();
  };

  private tryHandleStairClick(
    gridPosition: GridPositionComponent,
    pickedTarget: Extract<PickedNavigationTarget, { kind: "stair" }>,
    pathMovement: GridPathMovementComponent | null
  ): void {
    if (!this.runtimeContext) {
      return;
    }

    const registry = this.runtimeContext.gridRuntime.getBuildingNavigationRegistry();
    const stairTarget = registry.resolveStairInteractionTarget({
      stairId: pickedTarget.stairId,
      fromStory: pickedTarget.fromStory,
      toStory: pickedTarget.toStory,
      pickedPoint: pickedTarget.pickedPoint,
      currentStoryIndex: gridPosition.currentStoryIndex
    });

    if (!stairTarget) {
      console.warn(
        `[LocalPlayerInputSystem] Stair click unresolved point=(${pickedTarget.pickedPoint.x.toFixed(2)},${pickedTarget.pickedPoint.y.toFixed(2)},${pickedTarget.pickedPoint.z.toFixed(2)}) currentStory=${gridPosition.currentStoryIndex}`
      );
      return;
    }

    console.debug(
      `[LocalPlayerInputSystem] Stair click mesh='${pickedTarget.pickedMeshName ?? "unknown"}' stairId='${stairTarget.connector.stairId}' currentStory=${gridPosition.currentStoryIndex} targetStory=${stairTarget.targetStoryIndex} targetCell=${stairTarget.targetCell.x}:${stairTarget.targetCell.z} direction=${stairTarget.direction}`
    );
    console.info(
      `[StairNav] click stair=${stairTarget.connector.stairId} currentStory=${gridPosition.currentStoryIndex} ` +
      `targetStory=${stairTarget.targetStoryIndex} fromCell=${stairTarget.connector.fromCell.x}:${stairTarget.connector.fromCell.z} ` +
      `toCell=${stairTarget.connector.toCell.x}:${stairTarget.connector.toCell.z} ` +
      `pathPoints=${stairTarget.connector.traversalPathWorld.length} ` +
      `pathBounds=${formatStairPathBounds(stairTarget.connector.traversalPathWorld)} ` +
      `synthetic=${stairTarget.connector.isSynthetic === true}`
    );
    if (stairTarget.connector.kind === "external" && stairTarget.connector.traversalPathWorld.length <= 3) {
      console.warn(
        `[StairNav] external stair=${stairTarget.connector.stairId} has pathPoints=${stairTarget.connector.traversalPathWorld.length}; expected detailed switchback traversal_path_world.`
      );
    }

    if (stairTarget.resolvedByNearest) {
      console.debug(
        `[LocalPlayerInputSystem] Stair click resolved by nearest connector stairId='${stairTarget.connector.stairId}' distance=${stairTarget.distance?.toFixed(2) ?? "unknown"}`
      );
    }

    const stairEndpointWalkable = this.runtimeContext.gridRuntime.isWalkableCell(
      stairTarget.targetCell,
      stairTarget.targetStoryIndex
    );
    if (!stairEndpointWalkable) {
      if (this.worldModeController.isTurnBased()) {
        this.logCombatStairMoveRejection({
          stairId: stairTarget.connector.stairId,
          reason: "endpoint_not_walkable",
          mp: this.localPlayerEntity?.tryGetComponent(CombatStatsComponent)?.currentMp ?? 0,
          fromStoryIndex: gridPosition.currentStoryIndex,
          fromCell: gridPosition.currentCell,
          toStoryIndex: stairTarget.targetStoryIndex,
          toCell: stairTarget.targetCell
        });
      }
      console.warn(
        `[LocalPlayerInputSystem] Stair '${stairTarget.connector.stairId}' target endpoint is not walkable: story=${stairTarget.targetStoryIndex} cell=${stairTarget.targetCell.x}:${stairTarget.targetCell.z}`
      );
      return;
    }

    if (
      this.worldModeController.isTurnBased() &&
      this.localPlayerEntity &&
      !this.canMoveToTargetInCombat(
        this.localPlayerEntity.getId(),
        gridPosition,
        stairTarget.targetCell,
        stairTarget.targetStoryIndex,
        stairTarget.connector.stairId
      )
    ) {
      return;
    }

    gridPosition.targetCell = stairTarget.targetCell;
    gridPosition.targetStoryIndex = stairTarget.targetStoryIndex;
    pathMovement?.resetPathState();
  }

  private resolveCurrentInputMode(): CombatInputMode {
    if (!this.worldModeController.isTurnBased()) {
      return CombatInputMode.MOVE;
    }

    return this.combatInputController.getMode();
  }

  private isMovementInputAllowed(inputMode: CombatInputMode): boolean {
    if (!this.localPlayerEntity) {
      return false;
    }

    if (!this.worldModeController.isTurnBased()) {
      return true;
    }
    if (inputMode !== CombatInputMode.MOVE) {
      return false;
    }

    if (!this.combatState.isActiveEntity(this.localPlayerEntity.getId())) {
      return false;
    }

    const combatStats = this.localPlayerEntity.tryGetComponent(CombatStatsComponent);
    return Boolean(combatStats && combatStats.currentMp > 0);
  }

  private canMoveToTargetInCombat(
    entityId: string,
    gridPosition: GridPositionComponent,
    targetCell: GridCell,
    targetStoryIndex: number,
    stairId?: string
  ): boolean {
    if (!this.runtimeContext || !this.localPlayerEntity) {
      return false;
    }

    const combatStats = this.localPlayerEntity.tryGetComponent(CombatStatsComponent);
    if (!combatStats || combatStats.currentMp <= 0) {
      if (stairId) {
        this.logCombatStairMoveRejection({
          stairId,
          reason: "insufficient_mp",
          mp: combatStats?.currentMp ?? 0,
          fromStoryIndex: gridPosition.currentStoryIndex,
          fromCell: gridPosition.currentCell,
          toStoryIndex: targetStoryIndex,
          toCell: targetCell
        });
      }
      return false;
    }

    if (!this.runtimeContext.gridRuntime.isWalkableCell(targetCell, targetStoryIndex)) {
      if (stairId) {
        this.logCombatStairMoveRejection({
          stairId,
          reason: "endpoint_not_walkable",
          mp: combatStats.currentMp,
          fromStoryIndex: gridPosition.currentStoryIndex,
          fromCell: gridPosition.currentCell,
          toStoryIndex: targetStoryIndex,
          toCell: targetCell
        });
      }
      return false;
    }

    if (
      stairId &&
      this.isOccupiedByOtherEntity(entityId, gridPosition, {
        cell: targetCell,
        storyIndex: targetStoryIndex
      })
    ) {
      this.logCombatStairMoveRejection({
        stairId,
        reason: "occupied",
        mp: combatStats.currentMp,
        fromStoryIndex: gridPosition.currentStoryIndex,
        fromCell: gridPosition.currentCell,
        toStoryIndex: targetStoryIndex,
        toCell: targetCell
      });
      return false;
    }

    const navigationPathService = GridNavigationPathService.fromGridRuntime(this.runtimeContext.gridRuntime);
    const path = navigationPathService.findPath({
      fromCell: gridPosition.currentCell,
      fromStoryIndex: gridPosition.currentStoryIndex,
      toCell: targetCell,
      toStoryIndex: targetStoryIndex,
      activeEntityId: entityId,
      movementPoints: combatStats.currentMp,
      occupied: (node) => this.isOccupiedByOtherEntity(entityId, gridPosition, node)
    });

    if (!path || path.length === 0) {
      if (stairId) {
        this.logCombatStairMoveRejection({
          stairId,
          reason: "no_path",
          mp: combatStats.currentMp,
          fromStoryIndex: gridPosition.currentStoryIndex,
          fromCell: gridPosition.currentCell,
          toStoryIndex: targetStoryIndex,
          toCell: targetCell
        });
      }
      console.debug(
        `[LocalPlayerInputSystem] Combat move rejected: no path entity=${entityId} ` +
        `from=${gridPosition.currentStoryIndex}:${gridPosition.currentCell.x}:${gridPosition.currentCell.z} ` +
        `to=${targetStoryIndex}:${targetCell.x}:${targetCell.z}${stairId ? ` stair=${stairId}` : ""}`
      );
      return false;
    }

    const pathCost = this.getPathCost(path);
    if (pathCost > combatStats.currentMp) {
      if (stairId) {
        this.logCombatStairMoveRejection({
          stairId,
          reason: "insufficient_mp",
          mp: combatStats.currentMp,
          cost: pathCost,
          fromStoryIndex: gridPosition.currentStoryIndex,
          fromCell: gridPosition.currentCell,
          toStoryIndex: targetStoryIndex,
          toCell: targetCell,
          path
        });
      }
      console.debug(
        `[LocalPlayerInputSystem] Combat move rejected: insufficient MP entity=${entityId} mp=${combatStats.currentMp} cost=${pathCost} ` +
        `to=${targetStoryIndex}:${targetCell.x}:${targetCell.z}${stairId ? ` stair=${stairId}` : ""}`
      );
      return false;
    }

    return true;
  }

  private getPathCost(path: readonly MovementSegment[]): number {
    return path.reduce((total, segment) => total + segment.cost, 0);
  }

  private logCombatStairMoveRejection(input: {
    readonly stairId: string;
    readonly reason: "no_path" | "insufficient_mp" | "endpoint_not_walkable" | "occupied";
    readonly mp: number;
    readonly cost?: number;
    readonly fromStoryIndex: number;
    readonly fromCell: GridCell;
    readonly toStoryIndex: number;
    readonly toCell: GridCell;
    readonly path?: readonly MovementSegment[];
  }): void {
    console.warn(
      `[CombatStairMove] rejected stair=${input.stairId} reason=${input.reason} mp=${input.mp} ` +
      `cost=${input.cost ?? "n/a"} from=${input.fromStoryIndex}:${input.fromCell.x}:${input.fromCell.z} ` +
      `to=${input.toStoryIndex}:${input.toCell.x}:${input.toCell.z} ` +
      `segments=${input.path ? formatCombatStairMoveSegments(input.path) : "none"}`
    );
  }

  private isOccupiedByOtherEntity(
    entityId: string,
    gridPosition: GridPositionComponent,
    node: Pick<NavigationNode, "cell" | "storyIndex">
  ): boolean {
    if (node.cell.equals(gridPosition.currentCell) && node.storyIndex === gridPosition.currentStoryIndex) {
      return false;
    }

    const entitiesAtCell = this.spatialIndex.getEntitiesAt(node.cell, node.storyIndex);
    return entitiesAtCell.some((occupantId) => occupantId !== entityId);
  }

  private tryHandleAttackClick(clickedCell: GridPositionComponent["currentCell"]): void {
    if (!this.localPlayerEntity || !this.localPlayerEntity.hasComponent(RelationsComponent)) {
      return;
    }
    if (!this.combatState.isActiveEntity(this.localPlayerEntity.getId())) {
      return;
    }

    const localPlayerId = this.localPlayerEntity.getId();
    const localPlayerRelations = this.localPlayerEntity.getComponent(RelationsComponent);
    const attackerStoryIndex = this.localPlayerEntity.getComponent(GridPositionComponent).currentStoryIndex;
    const entitiesAtCell = this.spatialIndex.getEntitiesAt(clickedCell, attackerStoryIndex);

    for (const targetEntityId of entitiesAtCell) {
      if (targetEntityId === localPlayerId) {
        continue;
      }

      if (!localPlayerRelations.isHostileTowards(targetEntityId)) {
        continue;
      }

      const attackResult = this.attackTargetingService.tryPerformMeleeAttack(localPlayerId, targetEntityId);
      if (!attackResult.success) {
        console.log(`[Combat] Attack failed: ${attackResult.reason}`);
      }
      return;
    }
  }

  private resolveLocalPlayerEntity(): Entity | null {
    const localPlayerEntities = this.entityManager.query(LocalPlayerComponent);

    if (localPlayerEntities.length === 0) {
      return null;
    }

    if (localPlayerEntities.length > 1) {
      throw new Error(
        `LocalPlayerInputSystem requires exactly one local player entity, but found ${localPlayerEntities.length}.`
      );
    }

    return localPlayerEntities[0];
  }

  private detachPointerObserver(): void {
    if (!this.scene || !this.pointerObserver) {
      return;
    }

    this.scene.onPointerObservable.remove(this.pointerObserver);
    this.pointerObserver = null;
  }

  private tryAttachPointerObserver(): void {
    if (!this.scene || !this.runtimeContext || !this.localPlayerEntity || this.pointerObserver) {
      return;
    }

    this.pointerObserver = this.scene.onPointerObservable.add(this.onPointerEvent);
  }
}

function formatStairPathBounds(path: readonly { readonly x: number; readonly y: number; readonly z: number }[]): string {
  if (path.length === 0) {
    return "n/a";
  }
  let minX = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  let minZ = Number.POSITIVE_INFINITY;
  let maxZ = Number.NEGATIVE_INFINITY;
  for (const point of path) {
    minX = Math.min(minX, point.x);
    maxX = Math.max(maxX, point.x);
    minY = Math.min(minY, point.y);
    maxY = Math.max(maxY, point.y);
    minZ = Math.min(minZ, point.z);
    maxZ = Math.max(maxZ, point.z);
  }
  return `x=[${minX.toFixed(2)},${maxX.toFixed(2)}] y=[${minY.toFixed(2)},${maxY.toFixed(2)}] z=[${minZ.toFixed(2)},${maxZ.toFixed(2)}]`;
}

function formatCombatStairMoveSegments(path: readonly MovementSegment[]): string {
  return path.map((segment) =>
    `${segment.kind}:${segment.fromStoryIndex}:${segment.fromCell.x}:${segment.fromCell.z}->${segment.toStoryIndex}:${segment.toCell.x}:${segment.toCell.z}:cost=${segment.cost}:points=${segment.points.length}:stair=${segment.metadata?.stairId ?? "n/a"}`
  ).join("|");
}
