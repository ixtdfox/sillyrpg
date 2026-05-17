import { TransformNode, type Scene } from "@babylonjs/core";
import { importSceneContent, type ImportedSceneContent } from "../../core/world/scene/SceneContentLoader";
import type { SceneDescriptor } from "../../core/world/scene/SceneDescriptor";
import type { EdisonSceneOption } from "./SceneDescriptorAdapter";

export class ModelInstantiationAdapter {
  public async importScene(
    scene: Scene,
    option: EdisonSceneOption,
    descriptor: SceneDescriptor
  ): Promise<ImportedSceneContent> {
    const root = new TransformNode(`edison-scene-root:${option.id}`, scene);
    return importSceneContent({
      scene,
      sceneId: option.sceneId ?? option.id,
      root,
      rootNamePrefix: "edison",
      descriptorPath: option.rawDescriptorPath,
      descriptor,
      // Edison is an editor viewport, so generated terrain should match the
      // legacy editor preview exactly instead of using runtime LOD patches.
      generatedTerrainLodEnabled: false
    });
  }
}
