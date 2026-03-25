import { Scene as BabylonScene } from "@babylonjs/core";
import type { Entity } from "../../../entity/Entity";
import type { EntityManager } from "../../../entity/EntityManager";
import { LocalPlayerComponent } from "../../../entity/components/LocalPlayerComponent";
import { TransformComponent } from "../../../entity/components/TransformComponent";
import type { LocationManager } from "../../../world/location/LocationManager";
import { collectSceneTriggers, type SceneTriggerDescriptor } from "../../../world/location/trigger/SceneTriggerMetadata";

/**
 * Checks authored trigger meshes against local-player position and dispatches actions.
 */
export class SceneTriggerSystem {
  private readonly scene: BabylonScene;
  private readonly entityManager: EntityManager;
  private readonly locationManager: LocationManager;
  private triggerDescriptors: SceneTriggerDescriptor[];
  private isTransitioning: boolean;

  public constructor(scene: BabylonScene, entityManager: EntityManager, locationManager: LocationManager) {
    this.scene = scene;
    this.entityManager = entityManager;
    this.locationManager = locationManager;
    this.triggerDescriptors = [];
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

    const transform = localPlayer.getComponent(TransformComponent);
    const playerPosition = transform.value;

    for (const trigger of this.triggerDescriptors) {
      if (!trigger.mesh.intersectsPoint(playerPosition)) {
        continue;
      }

      void this.handleTriggerActivation(trigger, localPlayer);
      break;
    }
  }

  private refreshTriggers(): void {
    const districtMeshes = this.locationManager.getActiveDistrictMeshes();
    this.triggerDescriptors = collectSceneTriggers(districtMeshes);

    for (const trigger of this.triggerDescriptors) {
      trigger.mesh.isVisible = false;
      trigger.mesh.visibility = 0;
      trigger.mesh.isPickable = false;
      console.debug(
        `[SceneTriggerSystem] Trigger discovered kind='${trigger.metadata.kind}' type='${trigger.metadata.triggerType}' target='${trigger.metadata.targetScene}'.`
      );
    }
  }

  private async handleTriggerActivation(trigger: SceneTriggerDescriptor, localPlayer: Entity): Promise<void> {
    const key = `${trigger.metadata.kind}:${trigger.metadata.triggerType}`;
    console.debug(`[SceneTriggerSystem] Trigger activated key='${key}' location='${trigger.metadata.locationId}'.`);

    switch (key) {
      case "location_trigger:enter":
        await this.handleLocationEnterTrigger(trigger, localPlayer);
        break;
      default:
        console.debug(`[SceneTriggerSystem] Unsupported trigger key='${key}'.`);
        break;
    }
  }

  private async handleLocationEnterTrigger(trigger: SceneTriggerDescriptor, localPlayer: Entity): Promise<void> {
    this.isTransitioning = true;
    console.debug(`[SceneTriggerSystem] Scene transition started target='${trigger.metadata.targetScene}'.`);

    try {
      const center = await this.locationManager.transitionToDistrictModel(this.scene, trigger.metadata.targetScene);
      const transform = localPlayer.getComponent(TransformComponent);
      const spawnPosition = center.clone();

      if (!Number.isFinite(spawnPosition.y)) {
        spawnPosition.y = 0;
      }

      transform.value.copyFrom(spawnPosition);
      this.refreshTriggers();
      console.debug(`[SceneTriggerSystem] Scene transition completed target='${trigger.metadata.targetScene}'.`);
    } catch (error) {
      console.error("[SceneTriggerSystem] Scene transition failed.", error);
    } finally {
      this.isTransitioning = false;
    }
  }

  private resolveLocalPlayerEntity(): Entity | null {
    const candidates = this.entityManager.query(LocalPlayerComponent, TransformComponent);

    if (candidates.length === 0) {
      return null;
    }

    if (candidates.length > 1) {
      throw new Error(`SceneTriggerSystem requires exactly one local player, found ${candidates.length}.`);
    }

    return candidates[0];
  }
}
