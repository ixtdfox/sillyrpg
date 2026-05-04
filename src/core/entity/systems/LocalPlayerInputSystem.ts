import { PointerEventTypes, Scene as BabylonScene } from "@babylonjs/core";
import type { Nullable, Observer, PointerInfo } from "@babylonjs/core";
import type { Entity } from "../Entity";
import type { EntityManager } from "../EntityManager";
import type { System } from "../System";
import { HexPathMovementComponent } from "../components/HexPathMovementComponent";
import { HexPositionComponent } from "../components/HexPositionComponent";
import { LocalPlayerComponent } from "../components/LocalPlayerComponent";
import { RelationsComponent } from "../components/RelationsComponent";
import { CombatStatsComponent } from "../components/CombatStatsComponent";
import { getInGameSceneRuntimeContext, type InGameSceneRuntimeContext } from "../../scene/in-game/InGameSceneRuntimeContext";
import { WorldModeController } from "../../game/WorldModeController";
import { TurnBasedCombatState } from "../../game/TurnBasedCombatState";
import { CombatInputController } from "../../game/CombatInputController";
import { CombatInputMode } from "../../game/CombatInputMode";
import { HexSpatialIndex } from "./hex/HexSpatialIndex";
import { CombatAttackTargetingService } from "./combat/CombatAttackTargetingService";
import type { PickedNavigationTarget } from "../../hex/HexGroundPickerController";

/**
 * Handles local-player click-to-move intent on the ground hex grid.
 */
export class LocalPlayerInputSystem implements System {
  private readonly entityManager: EntityManager;
  private readonly worldModeController: WorldModeController;
  private readonly combatState: TurnBasedCombatState;
  private readonly combatInputController: CombatInputController;
  private readonly spatialIndex: HexSpatialIndex;
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
    spatialIndex: HexSpatialIndex,
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
    if (!this.scene || !this.localPlayerEntity || !this.localPlayerEntity.hasComponent(HexPositionComponent)) {
      this.localPlayerEntity = this.resolveLocalPlayerEntity();
    }

    const hexPosition = this.localPlayerEntity?.tryGetComponent(HexPositionComponent);
    if (hexPosition && this.runtimeContext) {
      this.runtimeContext.hexGridRuntime.setNavigationFallbackStoryIndex(hexPosition.currentStoryIndex);
      this.runtimeContext.hexGridRuntime.updateStairHoverAffordance(
        this.runtimeContext.hexGridRuntime.getHoveredNavigationTarget(hexPosition.currentStoryIndex),
        hexPosition.currentStoryIndex
      );
    }

    this.tryAttachPointerObserver();
  }

  private readonly onPointerEvent = (pointerInfo: PointerInfo): void => {
    if (pointerInfo.type !== PointerEventTypes.POINTERDOWN || pointerInfo.event.button !== 0) {
      return;
    }

    if (!this.runtimeContext || !this.localPlayerEntity || !this.localPlayerEntity.hasComponent(HexPositionComponent)) {
      return;
    }
    const inputMode = this.resolveCurrentInputMode();
    if (this.worldModeController.isTurnBased() && inputMode === CombatInputMode.NONE) {
      return;
    }

    const hexPosition = this.localPlayerEntity.getComponent(HexPositionComponent);
    const pickedTarget = this.runtimeContext.hexGridRuntime.getHoveredNavigationTarget(hexPosition.currentStoryIndex);
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
      this.tryHandleStairClick(hexPosition, pickedTarget, this.localPlayerEntity.tryGetComponent(HexPathMovementComponent) ?? null);
      return;
    }

    const clickedCell = pickedTarget.cell;
    const clickedStoryIndex = pickedTarget.storyIndex;
    const isWalkable = this.runtimeContext.hexGridRuntime.isWalkableCell(clickedCell, clickedStoryIndex);
    console.debug(
      `[LocalPlayerInputSystem] Cell click mesh='${pickedTarget.pickedMeshName ?? "unknown"}' currentStory=${hexPosition.currentStoryIndex} targetStory=${clickedStoryIndex} cell=${clickedCell.q}:${clickedCell.r} walkable=${isWalkable}`
    );
    if (!isWalkable) {
      const blockedBy = this.runtimeContext.hexGridRuntime
        .getNavigationBlockerRegistry()
        .getBlockersForCell(clickedCell, clickedStoryIndex)
        .map((blocker) => blocker.meshName);
      console.debug(
        `[LocalPlayerInputSystem] Ignored non-walkable target mesh='${pickedTarget.pickedMeshName ?? "unknown"}' story=${clickedStoryIndex} cell=${clickedCell.q}:${clickedCell.r} blockedBy=${blockedBy.join(",") || "none"}`
      );
      return;
    }

    if (hexPosition.currentCell.equals(clickedCell) && hexPosition.currentStoryIndex === clickedStoryIndex) {
      return;
    }

    if (
      hexPosition.targetCell &&
      hexPosition.targetCell.equals(clickedCell) &&
      (hexPosition.targetStoryIndex ?? hexPosition.currentStoryIndex) === clickedStoryIndex
    ) {
      return;
    }

    if (!this.runtimeContext.hexGridRuntime.getGrid().contains(clickedCell)) {
      return;
    }

    const pathMovement = this.localPlayerEntity.hasComponent(HexPathMovementComponent)
      ? this.localPlayerEntity.getComponent(HexPathMovementComponent)
      : null;

    hexPosition.targetCell = clickedCell;
    hexPosition.targetStoryIndex = clickedStoryIndex;
    pathMovement?.resetPathState();
  };

  private tryHandleStairClick(
    hexPosition: HexPositionComponent,
    pickedTarget: Extract<PickedNavigationTarget, { kind: "stair" }>,
    pathMovement: HexPathMovementComponent | null
  ): void {
    if (!this.runtimeContext) {
      return;
    }

    const registry = this.runtimeContext.hexGridRuntime.getBuildingNavigationRegistry();
    const stairTarget = registry.resolveStairInteractionTarget({
      stairId: pickedTarget.stairId,
      pickedPoint: pickedTarget.pickedPoint,
      currentStoryIndex: hexPosition.currentStoryIndex
    });

    if (!stairTarget) {
      console.warn(
        `[LocalPlayerInputSystem] Stair click unresolved point=(${pickedTarget.pickedPoint.x.toFixed(2)},${pickedTarget.pickedPoint.y.toFixed(2)},${pickedTarget.pickedPoint.z.toFixed(2)}) currentStory=${hexPosition.currentStoryIndex}`
      );
      return;
    }

    console.debug(
      `[LocalPlayerInputSystem] Stair click mesh='${pickedTarget.pickedMeshName ?? "unknown"}' stairId='${stairTarget.connector.stairId}' currentStory=${hexPosition.currentStoryIndex} targetStory=${stairTarget.targetStoryIndex} targetCell=${stairTarget.targetCell.q}:${stairTarget.targetCell.r} direction=${stairTarget.direction}`
    );

    if (stairTarget.resolvedByNearest) {
      console.debug(
        `[LocalPlayerInputSystem] Stair click resolved by nearest connector stairId='${stairTarget.connector.stairId}' distance=${stairTarget.distance?.toFixed(2) ?? "unknown"}`
      );
    }

    hexPosition.targetCell = stairTarget.targetCell;
    hexPosition.targetStoryIndex = stairTarget.targetStoryIndex;
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

  private tryHandleAttackClick(clickedCell: HexPositionComponent["currentCell"]): void {
    if (!this.localPlayerEntity || !this.localPlayerEntity.hasComponent(RelationsComponent)) {
      return;
    }
    if (!this.combatState.isActiveEntity(this.localPlayerEntity.getId())) {
      return;
    }

    const localPlayerId = this.localPlayerEntity.getId();
    const localPlayerRelations = this.localPlayerEntity.getComponent(RelationsComponent);
    const attackerStoryIndex = this.localPlayerEntity.getComponent(HexPositionComponent).currentStoryIndex;
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
