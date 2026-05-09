import { AbstractMesh, type Mesh, type TransformNode } from "@babylonjs/core";
import type { RenderTransformBinding } from "../entity/components/RenderableComponent";

export interface RenderableMeshResolverOptions {
  readonly includeInvisible?: boolean;
  readonly requireVertices?: boolean;
  readonly skipHelperMeshes?: boolean;
}

export class RenderableMeshResolver {
  public resolve(root: RenderTransformBinding, options: RenderableMeshResolverOptions = {}): readonly AbstractMesh[] {
    const meshes: AbstractMesh[] = [];
    const seenIds = new Set<number>();
    const maybeMesh = root as unknown;

    if (maybeMesh instanceof AbstractMesh && this.isRenderableMesh(maybeMesh, options)) {
      meshes.push(maybeMesh);
      seenIds.add(maybeMesh.uniqueId);
    }

    const node = root as TransformNode | Mesh | { getChildMeshes?: (directDescendantsOnly?: boolean) => AbstractMesh[] };
    if (typeof node.getChildMeshes === "function") {
      for (const childMesh of node.getChildMeshes(false)) {
        if (seenIds.has(childMesh.uniqueId)) {
          continue;
        }

        if (this.isRenderableMesh(childMesh, options)) {
          meshes.push(childMesh);
          seenIds.add(childMesh.uniqueId);
        }
      }
    }

    return meshes;
  }

  private isRenderableMesh(mesh: AbstractMesh, options: RenderableMeshResolverOptions): boolean {
    if (mesh.isDisposed() || !mesh.isEnabled()) {
      return false;
    }

    if (options.includeInvisible !== true && !mesh.isVisible) {
      return false;
    }

    if (options.requireVertices !== false && mesh.getTotalVertices() <= 0) {
      return false;
    }

    if (options.skipHelperMeshes !== false && this.isHelperOrMetadataMesh(mesh)) {
      return false;
    }

    return true;
  }

  private isHelperOrMetadataMesh(mesh: AbstractMesh): boolean {
    const name = mesh.name.toLowerCase();
    const id = mesh.id.toLowerCase();
    const metadata = asRecord(mesh.metadata);
    const rawMetadata = asRecord(metadata.rawMetadata);

    if (name.includes("metadata") || id.includes("metadata")) {
      return true;
    }

    if (name.includes("navigationmetadata") || id.includes("navigationmetadata")) {
      return true;
    }

    return (
      metadata.editorHelper === true ||
      metadata.gameHelper === true ||
      metadata.isMetadata === true ||
      metadata.editorTerrainBrushPreview === true ||
      rawMetadata.editor_helper === true ||
      rawMetadata.game_helper === true ||
      rawMetadata.metadata_carrier === true ||
      rawMetadata.navigation_metadata === true
    );
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}
