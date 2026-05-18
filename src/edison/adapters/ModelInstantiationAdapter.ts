import { TransformNode, type Scene } from "@babylonjs/core";
import {
  importSceneContent,
  importSceneObjectContent,
  type ImportedSceneContent,
  type ImportedSceneObjectContent
} from "../../core/world/scene/SceneContentLoader";
import type { SceneDescriptor, SceneObjectDescriptor } from "../../core/world/scene/SceneDescriptor";
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

  public async importObject(
    scene: Scene,
    descriptor: SceneObjectDescriptor,
    parent: TransformNode
  ): Promise<ImportedSceneObjectContent> {
    return importSceneObjectContent(scene, descriptor, parent, "edison");
  }
}
