import { PointerEventTypes, Scene as BabylonScene } from "@babylonjs/core";
import type { Nullable, Observer, PointerInfo } from "@babylonjs/core";
import type { Entity } from "../Entity";
import type { EntityManager } from "../EntityManager";
import type { System } from "../System";
import { HexPathMovementComponent } from "../components/HexPathMovementComponent";
import { HexPositionComponent } from "../components/HexPositionComponent";
import { LocalPlayerComponent } from "../components/LocalPlayerComponent";
import { CombatStatsComponent } from "../components/CombatStatsComponent";
import { getInGameSceneRuntimeContext, type InGameSceneRuntimeContext } from "../../scene/in-game/InGameSceneRuntimeContext";
import { WorldModeController } from "../../game/WorldModeController";
import { TurnBasedCombatState } from "../../game/TurnBasedCombatState";

/**
 * Handles local-player click-to-move intent on the ground hex grid.
 */
export class LocalPlayerInputSystem implements System {
  private readonly entityManager: EntityManager;
  private readonly worldModeController: WorldModeController;
  private readonly combatState: TurnBasedCombatState;
  private scene: BabylonScene | null;
  private runtimeContext: InGameSceneRuntimeContext | null;
  private localPlayerEntity: Entity | null;
  private pointerObserver: Nullable<Observer<PointerInfo>>;

  public constructor(entityManager: EntityManager, worldModeController: WorldModeController, combatState: TurnBasedCombatState) {
    this.entityManager = entityManager;
    this.worldModeController = worldModeController;
    this.combatState = combatState;
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

    this.tryAttachPointerObserver();
  }

  private readonly onPointerEvent = (pointerInfo: PointerInfo): void => {
    if (pointerInfo.type !== PointerEventTypes.POINTERDOWN || pointerInfo.event.button !== 0) {
      return;
    }

    if (!this.runtimeContext || !this.localPlayerEntity || !this.localPlayerEntity.hasComponent(HexPositionComponent)) {
      return;
    }
    if (!this.isMovementInputAllowed()) {
      return;
    }

    const clickedCell = this.runtimeContext.hexGridRuntime.getHoveredCell();
    if (!clickedCell) {
      return;
    }

    const hexPosition = this.localPlayerEntity.getComponent(HexPositionComponent);
    if (hexPosition.currentCell.equals(clickedCell)) {
      return;
    }

    if (hexPosition.targetCell && hexPosition.targetCell.equals(clickedCell)) {
      return;
    }

    if (!this.runtimeContext.hexGridRuntime.getGrid().contains(clickedCell)) {
      return;
    }

    const pathMovement = this.localPlayerEntity.hasComponent(HexPathMovementComponent)
      ? this.localPlayerEntity.getComponent(HexPathMovementComponent)
      : null;

    hexPosition.targetCell = clickedCell;
    pathMovement?.resetPathState();
  };

  private isMovementInputAllowed(): boolean {
    if (!this.localPlayerEntity) {
      return false;
    }

    if (!this.worldModeController.isTurnBased()) {
      return true;
    }

    if (!this.combatState.isActiveEntity(this.localPlayerEntity.getId())) {
      return false;
    }

    const combatStats = this.localPlayerEntity.tryGetComponent(CombatStatsComponent);
    return Boolean(combatStats && combatStats.currentMp > 0);
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
