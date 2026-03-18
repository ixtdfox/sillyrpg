import { AnimationGroup, Scene as BabylonScene, SceneLoader, TransformNode } from "@babylonjs/core";
import "@babylonjs/loaders/glTF";
import type { ModelDefinition } from "../ModelDefinition";
import { normalizeModel } from "../normalization";

export interface InstantiatedModel {
  rootNode: TransformNode;
  animationGroupsByName: ReadonlyMap<string, AnimationGroup>;
}

/**
 * Loads Babylon models and applies optional visual preparation steps.
 */
export class ModelInstantiator {
  /**
   * Imports, roots, and optionally normalizes a model instance.
   *
   * @param scene - Babylon scene where meshes are created.
   * @param definition - Visual model specification.
   * @param rootName - Name used for the generated root node.
   * @returns Prepared model with root node and indexed animation groups.
   */
  public async instantiate(scene: BabylonScene, definition: ModelDefinition, rootName: string): Promise<InstantiatedModel> {
    const { rootUrl, fileName } = this.resolveModelPath(definition.assetPath);
    const loaded = await SceneLoader.ImportMeshAsync("", rootUrl, fileName, scene);
    const rootNode = new TransformNode(rootName, scene);
    const animationGroupsByName = new Map<string, AnimationGroup>();

    for (const mesh of loaded.meshes) {
      if (mesh.parent === null) {
        mesh.setParent(rootNode);
      }
    }

    for (const animationGroup of loaded.animationGroups) {
      animationGroupsByName.set(animationGroup.name, animationGroup);
    }

    if (definition.normalization) {
      normalizeModel(rootNode, definition.normalization);
    }

    return {
      rootNode,
      animationGroupsByName
    };
  }

  private resolveModelPath(modelPath: string): { rootUrl: string; fileName: string } {
    const normalizedPath = modelPath.startsWith("/") ? modelPath : `/${modelPath}`;
    const lastSlashIndex = normalizedPath.lastIndexOf("/");

    return {
      rootUrl: normalizedPath.slice(0, lastSlashIndex + 1),
      fileName: normalizedPath.slice(lastSlashIndex + 1)
    };
  }
}
