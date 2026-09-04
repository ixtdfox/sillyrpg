import { Mesh, TransformNode, type AbstractMesh } from "@babylonjs/core";
import { applyTransform, type ImportedSceneContent, type ImportedSceneObjectContent, type ImportedSceneTerrainContent } from "../../core/world/scene/SceneContentLoader";
import type { SceneObjectDescriptor } from "../../core/world/scene/SceneDescriptor";

export interface EdisonSceneObjectRecord {
  readonly objectId: string;
  readonly type: string;
  readonly descriptor: SceneObjectDescriptor;
  readonly root: TransformNode;
  readonly renderableMeshes: readonly AbstractMesh[];
}

export class EdisonObjectRegistry {
  private readonly objects = new Map<string, ImportedSceneObjectContent>();
  private terrain: ImportedSceneTerrainContent | null = null;
  private readonly terrainSurfaceMeshes = new Set<AbstractMesh>();
  private content: ImportedSceneContent | null = null;

  public setContent(content: ImportedSceneContent): void {
    this.objects.clear();
    this.terrainSurfaceMeshes.clear();
    this.content = content;
    this.terrain = content.terrainContent ?? null;

    for (const terrainMesh of content.terrainMeshes) {
      this.terrainSurfaceMeshes.add(terrainMesh);
    }

    for (const object of content.sceneObjects) {
      this.objects.set(object.objectId, object);
    }
  }

  public getContent(): ImportedSceneContent | null {
    return this.content;
  }

  public getTerrain(): ImportedSceneTerrainContent | null {
    return this.terrain;
  }

  public getObjects(): readonly EdisonSceneObjectRecord[] {
    return [...this.objects.values()].map((object) => ({
      objectId: object.objectId,
      type: object.type,
      descriptor: object.descriptor,
      root: object.root,
      renderableMeshes: object.renderableMeshes
    }));
  }

  public getObject(objectId: string): EdisonSceneObjectRecord | null {
    const object = this.objects.get(objectId);
    if (!object) {
      return null;
    }

    return {
      objectId: object.objectId,
      type: object.type,
      descriptor: object.descriptor,
      root: object.root,
      renderableMeshes: object.renderableMeshes
    };
  }

  public updateObjectTransform(descriptor: SceneObjectDescriptor): void {
    const object = this.objects.get(descriptor.id);
    if (!object) {
      return;
    }

    applyTransform(object.root, descriptor);
    object.root.computeWorldMatrix(true);
    for (const mesh of object.renderableMeshes) {
      mesh.computeWorldMatrix(true);
      if (mesh instanceof Mesh) {
        try {
          mesh.refreshBoundingInfo({});
        } catch {
          // Some imported helper nodes do not expose stable bounding refreshes.
        }
      }
    }
  }

  public removeObject(objectId: string): boolean {
    const object = this.objects.get(objectId);
    if (!object) {
      return false;
    }

    this.disposeImportedObject(object);
    this.objects.delete(objectId);
    if (this.content) {
      this.content = {
        ...this.content,
        meshes: removeImportedNodes(this.content.meshes, object.meshes),
        renderableMeshes: removeImportedNodes(this.content.renderableMeshes, object.renderableMeshes),
        helperMeshes: removeImportedNodes(this.content.helperMeshes, object.helperMeshes),
        transformNodes: removeImportedNodes(this.content.transformNodes, object.transformNodes),
        skeletons: removeImportedNodes(this.content.skeletons, object.skeletons),
        animationGroups: removeImportedNodes(this.content.animationGroups, object.animationGroups),
        particleSystems: removeImportedNodes(this.content.particleSystems, object.particleSystems),
        sceneObjects: this.content.sceneObjects.filter((candidate) => candidate.objectId !== objectId),
        summary: {
          ...this.content.summary,
          objectCount: Math.max(0, this.content.summary.objectCount - 1)
        }
      };
    }
    return true;
  }

  public resolveObjectIdFromMesh(mesh: AbstractMesh): string | null {
    let current: { metadata?: unknown; parent?: unknown } | null = mesh;
    while (current) {
      const metadata = (current.metadata ?? null) as Record<string, unknown> | null;
      const objectId = typeof metadata?.sceneObjectId === "string" ? metadata.sceneObjectId : null;
      if (objectId && this.objects.has(objectId)) {
        return objectId;
      }

      current = (current.parent as { metadata?: unknown; parent?: unknown } | null) ?? null;
    }

    return null;
  }

  public isTerrainMesh(mesh: AbstractMesh): boolean {
    return this.terrainSurfaceMeshes.has(mesh);
  }

  public getRenderableMeshes(): readonly AbstractMesh[] {
    return [
      ...this.terrainSurfaceMeshes,
      ...[...this.objects.values()].flatMap((object) => object.renderableMeshes)
    ];
  }

  public clear(): void {
    this.objects.clear();
    this.terrainSurfaceMeshes.clear();
    this.terrain = null;
    this.content = null;
  }

  private disposeImportedObject(object: ImportedSceneObjectContent): void {
    for (const animationGroup of object.animationGroups) {
      animationGroup.dispose();
    }

    for (const particleSystem of object.particleSystems) {
      particleSystem.dispose();
    }

    for (const skeleton of object.skeletons) {
      skeleton.dispose();
    }

    if (!object.root.isDisposed()) {
      object.root.dispose(false);
    }

    for (const transformNode of object.transformNodes) {
      if (!transformNode.isDisposed()) {
        transformNode.dispose(false);
      }
    }

    for (const mesh of object.meshes) {
      if (!mesh.isDisposed()) {
        mesh.dispose(false, true);
      }
    }
  }
}

function removeImportedNodes<T>(allNodes: readonly T[], removedNodes: readonly T[]): readonly T[] {
  const removed = new Set(removedNodes);
  return allNodes.filter((node) => !removed.has(node));
}
