import type { Scene as BabylonScene } from "@babylonjs/core";
import type { Entity } from "../../entity/Entity";
import { TransformComponent } from "../../entity/components/TransformComponent";
import type { LocationManager } from "../../world/location/LocationManager";
import type { SceneTriggerDescriptor } from "./TriggerMetadata";

interface TriggerDispatchContext {
  readonly scene: BabylonScene;
  readonly localPlayer: Entity;
  readonly locationManager: LocationManager;
  readonly refreshTriggers: () => void;
}

/**
 * Dispatches trigger activations by trigger kind and type.
 */
export class TriggerDispatcher {
  public async dispatch(trigger: SceneTriggerDescriptor, context: TriggerDispatchContext): Promise<void> {
    const key = `${trigger.metadata.kind}:${trigger.metadata.triggerType}`;
    console.debug(`[LocationTriggerSystem] Trigger activated key='${key}' location='${trigger.metadata.locationId}'.`);

    switch (key) {
      case "location_trigger:enter":
        await this.handleLocationEnterTrigger(trigger, context);
        break;
      default:
        console.debug(`[LocationTriggerSystem] Unsupported trigger key='${key}'.`);
        break;
    }
  }

  private async handleLocationEnterTrigger(
    trigger: SceneTriggerDescriptor,
    context: TriggerDispatchContext
  ): Promise<void> {
    console.debug(`[LocationTriggerSystem] Scene transition started target='${trigger.metadata.targetScene}'.`);

    const center = await context.locationManager.transitionToDistrictModel(context.scene, trigger.metadata.targetScene);
    const transform = context.localPlayer.getComponent(TransformComponent);
    const spawnPosition = center.clone();

    if (!Number.isFinite(spawnPosition.y)) {
      spawnPosition.y = 0;
    }

    transform.value.copyFrom(spawnPosition);
    context.refreshTriggers();
    console.debug(`[LocationTriggerSystem] Scene transition completed target='${trigger.metadata.targetScene}'.`);
  }
}
