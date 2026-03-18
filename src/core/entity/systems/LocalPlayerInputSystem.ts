import { PointerEventTypes, Scene as BabylonScene } from "@babylonjs/core";
import type { Nullable, Observer, PointerInfo } from "@babylonjs/core";
import type { Entity } from "../Entity";
import type { EntityManager } from "../EntityManager";
import type { System } from "../System";
import { HexPositionComponent } from "../components/HexPositionComponent";
import { LocalPlayerComponent } from "../components/LocalPlayerComponent";
import { getInGameSceneRuntimeContext, type InGameSceneRuntimeContext } from "../../scene/in-game/InGameSceneRuntimeContext";

/**
 * Handles local-player click-to-move intent on the ground hex grid.
 */
export class LocalPlayerInputSystem implements System {
  private readonly entityManager: EntityManager;
  private scene: BabylonScene | null;
  private runtimeContext: InGameSceneRuntimeContext | null;
  private localPlayerEntity: Entity | null;
  private pointerObserver: Nullable<Observer<PointerInfo>>;

  public constructor(entityManager: EntityManager) {
    this.entityManager = entityManager;
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

    if (this.runtimeContext && this.localPlayerEntity) {
      this.pointerObserver = scene.onPointerObservable.add(this.onPointerEvent);
    }
  }

  public update(_deltaSeconds: number): void {
    if (!this.scene || !this.localPlayerEntity || !this.localPlayerEntity.hasComponent(HexPositionComponent)) {
      this.localPlayerEntity = this.resolveLocalPlayerEntity();
    }
  }

  private readonly onPointerEvent = (pointerInfo: PointerInfo): void => {
    if (pointerInfo.type !== PointerEventTypes.POINTERDOWN || pointerInfo.event.button !== 0) {
      return;
    }

    if (!this.runtimeContext || !this.localPlayerEntity || !this.localPlayerEntity.hasComponent(HexPositionComponent)) {
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

    if (!this.runtimeContext.hexGridRuntime.getGrid().contains(clickedCell)) {
      return;
    }

    hexPosition.targetCell = clickedCell;
  };

  private resolveLocalPlayerEntity(): Entity | null {
    const localPlayerEntities = this.entityManager.query(LocalPlayerComponent, HexPositionComponent);

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
}
