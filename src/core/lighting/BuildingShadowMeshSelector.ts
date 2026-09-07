import type { AbstractMesh } from "@babylonjs/core";
import { parseBuildingVisibilityMesh } from "../scene/visibility/BuildingVisibilityMetadata";

export interface SceneObjectShadowSource {
  readonly type: string;
  readonly renderableMeshes: readonly AbstractMesh[];
}

/** Replaces detailed building casters with an authored proxy when one is available. */
export function selectSceneObjectShadowMeshes(
  sceneObjects: readonly SceneObjectShadowSource[],
  preferBuildingShadowProxies: boolean
): AbstractMesh[] {
  const selected: AbstractMesh[] = [];

  for (const sceneObject of sceneObjects) {
    if (!preferBuildingShadowProxies || sceneObject.type !== "building") {
      selected.push(...sceneObject.renderableMeshes);
      continue;
    }

    const shadowProxies = sceneObject.renderableMeshes.filter((mesh) =>
      parseBuildingVisibilityMesh(mesh)?.lodRole === "shadow_proxy"
    );
    selected.push(...(shadowProxies.length > 0 ? shadowProxies : sceneObject.renderableMeshes));
  }

  return selected;
}
