import type { Node } from "@babylonjs/core";
import { collectSceneTriggers, type SceneTriggerDescriptor } from "./TriggerMetadata";

/**
 * Stores and prepares active scene triggers for runtime overlap checks.
 */
export class TriggerRegistry {
  private triggerDescriptors: SceneTriggerDescriptor[];

  public constructor() {
    this.triggerDescriptors = [];
  }

  public registerFromNodes(nodes: readonly Node[]): void {
    this.triggerDescriptors = collectSceneTriggers(nodes);
    console.debug(`[LocationTriggerSystem] Triggers discovered total=${this.triggerDescriptors.length}.`);

    for (const trigger of this.triggerDescriptors) {
      trigger.mesh.isVisible = false;
      trigger.mesh.visibility = 0;
      trigger.mesh.isPickable = false;
      console.debug(
        `[LocationTriggerSystem] Trigger discovered mesh='${trigger.mesh.name}' id='${trigger.mesh.id}' kind='${trigger.metadata.kind}' type='${trigger.metadata.triggerType}' locationId='${trigger.metadata.locationId}' target='${trigger.metadata.targetScene}'.`
      );
    }
  }

  public getTriggers(): readonly SceneTriggerDescriptor[] {
    return this.triggerDescriptors;
  }

  public clear(): void {
    this.triggerDescriptors = [];
  }
}
