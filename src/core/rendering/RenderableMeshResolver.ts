import { AbstractMesh, type Mesh, type TransformNode } from "@babylonjs/core";
import type { RenderTransformBinding } from "../entity/components/RenderableComponent";

export class RenderableMeshResolver {
  public resolve(root: RenderTransformBinding): readonly AbstractMesh[] {
    const meshes: AbstractMesh[] = [];
    const seenIds = new Set<number>();
    const maybeMesh = root as unknown;

    if (maybeMesh instanceof AbstractMesh) {
      meshes.push(maybeMesh);
      seenIds.add(maybeMesh.uniqueId);
    }

    const node = root as TransformNode | Mesh | { getChildMeshes?: (directDescendantsOnly?: boolean) => AbstractMesh[] };
    if (typeof node.getChildMeshes === "function") {
      for (const childMesh of node.getChildMeshes(false)) {
        if (seenIds.has(childMesh.uniqueId)) {
          continue;
        }

        meshes.push(childMesh);
        seenIds.add(childMesh.uniqueId);
      }
    }

    return meshes;
  }
}
