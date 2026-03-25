import type { Scene as BabylonScene } from "@babylonjs/core";
import type { Entity } from "../../entity/Entity";
import type { EntityManager } from "../../entity/EntityManager";
import { LocalPlayerComponent } from "../../entity/components/LocalPlayerComponent";
import { TransformComponent } from "../../entity/components/TransformComponent";
import type { LocationManager } from "../../world/location/LocationManager";
import { TriggerDispatcher } from "./TriggerDispatcher";
import { TriggerRegistry } from "./TriggerRegistry";

/**
 * Runtime gameplay system for trigger discovery, overlap checks and dispatch.
 */
export class LocationTriggerSystem {
  private readonly scene: BabylonScene;
  private readonly entityManager: EntityManager;
  private readonly locationManager: LocationManager;
  private readonly triggerRegistry: TriggerRegistry;
  private readonly triggerDispatcher: TriggerDispatcher;
  private isTransitioning: boolean;

  public constructor(scene: BabylonScene, entityManager: EntityManager, locationManager: LocationManager) {
    this.scene = scene;
    this.entityManager = entityManager;
    this.locationManager = locationManager;
    this.triggerRegistry = new TriggerRegistry();
    this.triggerDispatcher = new TriggerDispatcher();
    this.isTransitioning = false;
  }

  public initialize(): void {
    this.refreshTriggers();
  }

  public update(): void {
    if (this.isTransitioning) {
      return;
    }

    const localPlayer = this.resolveLocalPlayerEntity();
    if (!localPlayer) {
      return;
    }

    const playerPosition = localPlayer.getComponent(TransformComponent).value;

    for (const trigger of this.triggerRegistry.getTriggers()) {
      if (!trigger.mesh.intersectsPoint(playerPosition)) {
        continue;
      }

      this.isTransitioning = true;
      void this.triggerDispatcher
        .dispatch(trigger, {
          scene: this.scene,
          localPlayer,
          locationManager: this.locationManager,
          refreshTriggers: () => this.refreshTriggers()
        })
        .catch((error: unknown) => {
          console.error("[LocationTriggerSystem] Scene transition failed.", error);
        })
        .finally(() => {
          this.isTransitioning = false;
        });
      break;
    }
  }

  public dispose(): void {
    this.triggerRegistry.clear();
  }

  private refreshTriggers(): void {
    this.triggerRegistry.registerFromMeshes(this.locationManager.getActiveDistrictMeshes());
  }

  private resolveLocalPlayerEntity(): Entity | null {
    const candidates = this.entityManager.query(LocalPlayerComponent, TransformComponent);

    if (candidates.length === 0) {
      return null;
    }

    if (candidates.length > 1) {
      throw new Error(`LocationTriggerSystem requires exactly one local player, found ${candidates.length}.`);
    }

    return candidates[0];
  }
}
