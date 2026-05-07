import type { Scene as BabylonScene, Vector3 } from "@babylonjs/core";
import type { Entity } from "../../entity/Entity";
import type { LocationManager } from "../../world/location/LocationManager";
import type { SceneTriggerDescriptor } from "./TriggerMetadata";

interface TriggerDispatchContext {
  readonly scene: BabylonScene;
  readonly localPlayer: Entity;
  readonly locationManager: LocationManager;
  readonly handlePostTransition: (spawnPosition: Vector3, localPlayer: Entity) => Promise<void> | void;
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
    throw new Error(
      `Legacy trigger-based district model transitions are no longer supported for '${trigger.metadata.targetScene}'. Use descriptor-based district scene transitions instead.`
    );
  }
}
