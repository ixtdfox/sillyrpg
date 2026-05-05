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

    if (stairTarget.resolvedByNearest) {
      console.debug(
        `[LocalPlayerInputSystem] Stair click resolved by nearest connector stairId='${stairTarget.connector.stairId}' distance=${stairTarget.distance?.toFixed(2) ?? "unknown"}`
      );
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
