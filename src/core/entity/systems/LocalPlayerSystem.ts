import type { Camera, Scene as BabylonScene, TargetCamera } from "@babylonjs/core";
import type { Entity } from "../Entity";
import type { EntityManager } from "../EntityManager";
import type { System } from "../System";
import { LocalPlayerComponent } from "../components/LocalPlayerComponent";
import { TransformComponent } from "../components/TransformComponent";

/**
 * Keeps the active camera focused on the local-player entity.
 */
export class LocalPlayerSystem implements System {
  private readonly entityManager: EntityManager;
  private readonly getScene: () => BabylonScene | null;
  private localPlayer: Entity;

  public constructor(entityManager: EntityManager, getScene: () => BabylonScene | null) {
    this.entityManager = entityManager;
    this.getScene = getScene;
    this.localPlayer = this.resolveLocalPlayer();
  }

  public update(_deltaSeconds: number): void {
    const scene = this.getScene();
    if (!scene?.activeCamera) {
      return;
    }

    const activeCamera = scene.activeCamera as Camera;
    if (!this.isTargetCamera(activeCamera)) {
      console.warn(
        `LocalPlayerSystem: Active camera '${activeCamera.name}' cannot follow local player because it has no target.`
      );
      return;
    }

    const transform = this.localPlayer.getComponent(TransformComponent);
    activeCamera.setTarget(transform.value);
  }

  private resolveLocalPlayer(): Entity {
    const localPlayerEntities = this.entityManager.query(LocalPlayerComponent, TransformComponent);

    if (localPlayerEntities.length === 0) {
      throw new Error(
        "LocalPlayerSystem initialization failed: no entity found with LocalPlayerComponent and TransformComponent."
      );
    }

    if (localPlayerEntities.length > 1) {
      throw new Error(
        `LocalPlayerSystem initialization failed: expected one local player entity, found ${localPlayerEntities.length}.`
      );
    }

    return localPlayerEntities[0];
  }

  private isTargetCamera(camera: Camera): camera is TargetCamera {
    return typeof (camera as TargetCamera).setTarget === "function";
  }
}
