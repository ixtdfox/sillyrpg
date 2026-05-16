import type { AbstractMesh, Scene } from "@babylonjs/core";
import { SceneLightingController } from "../../core/lighting/SceneLightingController";
import { SceneShadowRegistry, type ShadowMeshBatch } from "../../core/lighting/SceneShadowRegistry";
import { LightingPresetCatalog } from "../../core/lighting/LightingPreset";
import type { SceneLightingDescriptor } from "../../core/lighting/LightingTypes";

export class LightingCoreAdapter {
  private readonly controller: SceneLightingController;
  private readonly shadowRegistry: SceneShadowRegistry;

  public constructor(scene: Scene) {
    this.controller = new SceneLightingController(scene);
    this.shadowRegistry = new SceneShadowRegistry(this.controller);
  }

  public apply(descriptor: SceneLightingDescriptor | null | undefined, batches: readonly ShadowMeshBatch[]): void {
    this.shadowRegistry.setLighting(descriptor ?? LightingPresetCatalog.getShared().createDefault());
    this.shadowRegistry.replaceBatches(batches);
  }

  public synchronizeSceneMeshes(sceneObjects: readonly AbstractMesh[], terrain: readonly AbstractMesh[]): void {
    this.shadowRegistry.replaceBatches([
      {
        ownerId: "edison:scene-objects",
        source: "sceneObject",
        meshes: sceneObjects
      },
      {
        ownerId: "edison:terrain",
        source: "terrain",
        meshes: terrain
      }
    ]);
  }

  public dispose(): void {
    this.shadowRegistry.dispose();
    this.controller.dispose();
  }
}
