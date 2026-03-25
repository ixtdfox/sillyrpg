import type { AbstractMesh } from "@babylonjs/core";
import { collectSceneTriggers, type SceneTriggerDescriptor } from "./TriggerMetadata";

/**
 * Stores and prepares active scene triggers for runtime overlap checks.
 */
export class TriggerRegistry {
  private triggerDescriptors: SceneTriggerDescriptor[];

  public constructor() {
    this.triggerDescriptors = [];
  }

  public registerFromMeshes(meshes: readonly AbstractMesh[]): void {
    this.triggerDescriptors = collectSceneTriggers(meshes);

    for (const trigger of this.triggerDescriptors) {
      trigger.mesh.isVisible = false;
      trigger.mesh.visibility = 0;
      trigger.mesh.isPickable = false;
      console.debug(
        `[LocationTriggerSystem] Trigger discovered kind='${trigger.metadata.kind}' type='${trigger.metadata.triggerType}' target='${trigger.metadata.targetScene}'.`
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
