import { ArcRotateCamera, Scene as BabylonScene } from "@babylonjs/core";
import type { Entity } from "../Entity";
import type { EntityManager } from "../EntityManager";
import type { System } from "../System";
import { LocalPlayerComponent } from "../components/LocalPlayerComponent";
import { TransformComponent } from "../components/TransformComponent";

/**
 * Keeps active camera focused on the local player entity.
 */
export class LocalPlayerSystem implements System {
  private readonly entityManager: EntityManager;
  private scene: BabylonScene | null;
  private localPlayerEntity: Entity | null;

  public constructor(entityManager: EntityManager) {
    this.entityManager = entityManager;
    this.scene = null;
    this.localPlayerEntity = null;
  }

  public setScene(scene: BabylonScene | null): void {
    this.scene = scene;
    this.localPlayerEntity = null;

    if (!scene) {
      return;
    }

    this.localPlayerEntity = this.resolveLocalPlayerEntity();
  }

  public update(_deltaSeconds: number): void {
    if (!this.scene || !this.localPlayerEntity) {
      return;
    }

    const transform = this.localPlayerEntity.getComponent(TransformComponent);
    const camera = this.scene.activeCamera;

    if (!camera) {
      return;
    }

    if (camera instanceof ArcRotateCamera) {
      camera.target.copyFrom(transform.value);
      return;
    }

    const targetableCamera = camera as { setTarget?: (target: typeof transform.value) => void };

    if (typeof targetableCamera.setTarget === "function") {
      targetableCamera.setTarget(transform.value);
    }
  }

  private resolveLocalPlayerEntity(): Entity | null {
    const localPlayerEntities = this.entityManager.query(LocalPlayerComponent, TransformComponent);

    if (localPlayerEntities.length === 0) {
      console.warn(
        "LocalPlayerSystem could not find an entity with LocalPlayerComponent and TransformComponent. Camera follow is disabled."
      );
      return null;
    }

    if (localPlayerEntities.length > 1) {
      throw new Error(
        `LocalPlayerSystem requires exactly one local player entity, but found ${localPlayerEntities.length}.`
      );
    }

    return localPlayerEntities[0];
  }
}
