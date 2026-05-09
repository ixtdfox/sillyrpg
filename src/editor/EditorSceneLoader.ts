import { Scene, TransformNode, Vector3, type AbstractMesh } from "@babylonjs/core";
import type { ShadowMeshBatch } from "../core/lighting/SceneShadowRegistry";
import {
  applyTransform,
  importSceneContent,
  importSceneObjectContent,
  importSceneTerrainContent,
  type ImportedSceneObjectContent,
  type ImportedSceneTerrainContent
} from "../core/world/scene/SceneContentLoader";
import type { SceneDescriptor, SceneObjectDescriptor, SceneTerrainDescriptor } from "../core/world/scene/SceneDescriptor";
import type {
  EditorLoadedSceneContent,
  EditorObjectInstance,
  EditorSceneOption,
  EditorTerrainInstance
} from "./types";

/**
 * Loads and incrementally updates editor scene content while preserving editor-owned camera/UI/helpers.
 */
export class EditorSceneLoader {
  private readonly scene: Scene;
  private currentContent: EditorLoadedSceneContent | null;
  private readonly objectInstances: Map<string, EditorObjectInstance>;
  private terrainInstance: EditorTerrainInstance | null;

  public constructor(scene: Scene) {
    this.scene = scene;
    this.currentContent = null;
    this.objectInstances = new Map();
    this.terrainInstance = null;
  }

  public getCurrentContent(): EditorLoadedSceneContent | null {
    return this.currentContent;
  }

  public getObjectInstance(objectId: string): EditorObjectInstance | null {
    return this.objectInstances.get(objectId) ?? null;
  }

  public getTerrainInstance(): EditorTerrainInstance | null {
    return this.terrainInstance;
  }

  public getRenderableMeshes(): readonly AbstractMesh[] {
    return this.currentContent?.renderableMeshes ?? [];
  }

  public getTerrainRenderableMeshes(): readonly AbstractMesh[] {
    return this.terrainInstance?.renderableMeshes ?? [];
  }

  public getSceneObjectRenderableMeshes(): readonly AbstractMesh[] {
    return Array.from(this.objectInstances.values()).flatMap((instance) => instance.renderableMeshes);
  }

  public getShadowMeshBatches(): readonly ShadowMeshBatch[] {
    const batches: ShadowMeshBatch[] = [];
    if (this.terrainInstance) {
      batches.push({
        ownerId: "editor:terrain",
        source: "terrain",
        meshes: this.terrainInstance.renderableMeshes
      });
    }

    for (const instance of this.objectInstances.values()) {
      batches.push({
        ownerId: `editor:object:${instance.objectId}`,
        source: "sceneObject",
        meshes: instance.renderableMeshes
      });
    }

    return batches;
  }

  public async load(option: EditorSceneOption, descriptor: SceneDescriptor): Promise<EditorLoadedSceneContent> {
    this.disposeCurrentContent();

    const root = new TransformNode(`editor-scene-root:${option.id}`, this.scene);
    const importedContent = await importSceneContent({
      scene: this.scene,
      sceneId: option.sceneId ?? option.id,
      root,
      rootNamePrefix: "editor",
      descriptorPath: option.rawDescriptorPath,
      descriptor
    });

    this.objectInstances.clear();
    for (const importedObject of importedContent.sceneObjects) {
      this.objectInstances.set(importedObject.objectId, this.toEditorObjectInstance(importedObject));
    }

    this.terrainInstance = importedContent.terrainContent
      ? this.toEditorTerrainInstance(importedContent.terrainContent)
      : null;

    const content: EditorLoadedSceneContent = {
      option,
      descriptor,
      root,
      meshes: importedContent.meshes,
      renderableMeshes: importedContent.renderableMeshes,
      helperMeshes: importedContent.helperMeshes,
      transformNodes: importedContent.transformNodes,
      skeletons: importedContent.skeletons,
      animationGroups: importedContent.animationGroups,
      particleSystems: importedContent.particleSystems,
      sceneObjects: [...this.objectInstances.values()],
      terrain: this.terrainInstance,
      summary: {
        descriptorUrl: importedContent.summary.descriptorUrl,
        rawDescriptorPath: importedContent.summary.descriptorPath ?? option.rawDescriptorPath,
        terrainLabel: importedContent.summary.terrainLabel,
        objectCount: importedContent.summary.objectCount
      }
    };

    this.currentContent = content;
    this.refreshWorldMatrices();
    return content;
  }

  public async addObject(objectDescriptor: SceneObjectDescriptor): Promise<EditorObjectInstance> {
    const content = this.requireCurrentContent();
    const importedObject = await importSceneObjectContent(this.scene, objectDescriptor, content.root, "editor");
    const instance = this.toEditorObjectInstance(importedObject);

    this.objectInstances.set(instance.objectId, instance);
    this.currentContent = {
      ...content,
      meshes: [...content.meshes, ...instance.meshes],
      renderableMeshes: [...content.renderableMeshes, ...instance.renderableMeshes],
      helperMeshes: [...content.helperMeshes, ...instance.helperMeshes],
      transformNodes: [...content.transformNodes, instance.root, ...instance.transformNodes],
      skeletons: [...content.skeletons, ...instance.skeletons],
      animationGroups: [...content.animationGroups, ...instance.animationGroups],
      particleSystems: [...content.particleSystems, ...instance.particleSystems],
      sceneObjects: [...this.objectInstances.values()],
      summary: {
        ...content.summary,
        objectCount: content.summary.objectCount + 1
      }
    };
    this.refreshWorldMatrices();
    return instance;
  }

  public async setTerrain(descriptor: SceneTerrainDescriptor): Promise<EditorTerrainInstance> {
    const content = this.requireCurrentContent();
    const previousTerrain = this.terrainInstance;
    const importedTerrain = await importSceneTerrainContent(this.scene, descriptor, content.root, "editor");
    const instance = this.toEditorTerrainInstance(importedTerrain);
    const previousTerrainMeshes = previousTerrain?.meshes ?? [];
    const previousTerrainRenderableMeshes = previousTerrain?.renderableMeshes ?? [];
    const previousTerrainHelperMeshes = previousTerrain?.helperMeshes ?? [];
    const previousTerrainNodes = previousTerrain ? [previousTerrain.root, ...previousTerrain.transformNodes] : [];
    const previousTerrainSkeletons = previousTerrain?.skeletons ?? [];
    const previousTerrainAnimationGroups = previousTerrain?.animationGroups ?? [];
    const previousTerrainParticleSystems = previousTerrain?.particleSystems ?? [];

    if (previousTerrain) {
      this.disposeTerrainInstance(previousTerrain);
    }

    this.terrainInstance = instance;
    this.currentContent = {
      ...content,
      meshes: [...content.meshes.filter((mesh) => !previousTerrainMeshes.includes(mesh)), ...instance.meshes],
      renderableMeshes: [
        ...content.renderableMeshes.filter((mesh) => !previousTerrainRenderableMeshes.includes(mesh)),
        ...instance.renderableMeshes
      ],
      helperMeshes: [
        ...content.helperMeshes.filter((mesh) => !previousTerrainHelperMeshes.includes(mesh)),
        ...instance.helperMeshes
      ],
      transformNodes: [
        ...content.transformNodes.filter((node) => !previousTerrainNodes.includes(node)),
        instance.root,
        ...instance.transformNodes
      ],
      skeletons: [...content.skeletons.filter((node) => !previousTerrainSkeletons.includes(node)), ...instance.skeletons],
      animationGroups: [
        ...content.animationGroups.filter((node) => !previousTerrainAnimationGroups.includes(node)),
        ...instance.animationGroups
      ],
      particleSystems: [
        ...content.particleSystems.filter((node) => !previousTerrainParticleSystems.includes(node)),
        ...instance.particleSystems
      ],
      terrain: instance,
      summary: {
        ...content.summary,
        terrainLabel:
          descriptor.kind === "plane"
            ? `plane ${descriptor.size[0]}x${descriptor.size[1]}`
            : descriptor.kind === "generated"
              ? `generated ${descriptor.generator.preset} ${descriptor.resolution[0]}x${descriptor.resolution[1]}${descriptor.editedHeightMap ? " edited" : ""}`
              : descriptor.model
      }
    };
    this.refreshWorldMatrices();
    return instance;
  }

  public updateObjectTransform(objectId: string, descriptor: SceneObjectDescriptor): void {
    const instance = this.objectInstances.get(objectId);
    if (!instance) {
      return;
    }

    applyTransform(instance.root, descriptor);
  }

  public removeObject(objectId: string): void {
    const content = this.requireCurrentContent();
    const instance = this.objectInstances.get(objectId);
    if (!instance) {
      return;
    }

    this.disposeObjectInstance(instance);
    this.objectInstances.delete(objectId);
    this.currentContent = {
      ...content,
      meshes: content.meshes.filter((mesh) => !instance.meshes.includes(mesh)),
      renderableMeshes: content.renderableMeshes.filter((mesh) => !instance.renderableMeshes.includes(mesh)),
      helperMeshes: content.helperMeshes.filter((mesh) => !instance.helperMeshes.includes(mesh)),
      transformNodes: content.transformNodes.filter(
        (node) => node !== instance.root && !instance.transformNodes.includes(node)
      ),
      skeletons: content.skeletons.filter((node) => !instance.skeletons.includes(node)),
      animationGroups: content.animationGroups.filter((node) => !instance.animationGroups.includes(node)),
      particleSystems: content.particleSystems.filter((node) => !instance.particleSystems.includes(node)),
      sceneObjects: [...this.objectInstances.values()],
      summary: {
        ...content.summary,
        objectCount: Math.max(0, content.summary.objectCount - 1)
      }
    };
  }

  public clear(): void {
    this.disposeCurrentContent();
  }

  public dispose(): void {
    this.disposeCurrentContent();
  }

  private requireCurrentContent(): EditorLoadedSceneContent {
    if (!this.currentContent) {
      throw new Error("Editor scene content is not loaded.");
    }

    return this.currentContent;
  }

  private refreshWorldMatrices(): void {
    const content = this.currentContent;
    if (!content) {
      return;
    }

    content.root.computeWorldMatrix(true);
    for (const mesh of content.meshes) {
      mesh.computeWorldMatrix(true);
      try {
        mesh.refreshBoundingInfo({});
      } catch {
        // Ignore meshes that do not expose refreshBoundingInfo consistently.
      }
    }
  }

  private disposeCurrentContent(): void {
    if (!this.currentContent) {
      return;
    }

    this.disposeNodes(this.currentContent.animationGroups);
    this.disposeNodes(this.currentContent.particleSystems);
    this.disposeNodes(this.currentContent.skeletons);

    if (!this.currentContent.root.isDisposed()) {
      this.currentContent.root.dispose(false);
    }

    for (const transformNode of this.currentContent.transformNodes) {
      if (!transformNode.isDisposed()) {
        transformNode.dispose(false);
      }
    }

    for (const mesh of this.currentContent.meshes) {
      if (!mesh.isDisposed()) {
        mesh.dispose(false, true);
      }
    }

    this.objectInstances.clear();
    this.terrainInstance = null;
    this.currentContent = null;
  }

  private disposeNodes(nodes: readonly { dispose: (doNotRecurse?: boolean) => void }[]): void {
    for (const node of nodes) {
      node.dispose(false);
    }
  }

  private disposeObjectInstance(instance: EditorObjectInstance): void {
    this.disposeNodes(instance.animationGroups);
    this.disposeNodes(instance.particleSystems);
    this.disposeNodes(instance.skeletons);

    if (!instance.root.isDisposed()) {
      instance.root.dispose(false);
    }

    for (const transformNode of instance.transformNodes) {
      if (!transformNode.isDisposed()) {
        transformNode.dispose(false);
      }
    }

    for (const mesh of instance.meshes) {
      if (!mesh.isDisposed()) {
        mesh.dispose(false, true);
      }
    }
  }

  private disposeTerrainInstance(instance: EditorTerrainInstance): void {
    this.disposeNodes(instance.animationGroups);
    this.disposeNodes(instance.particleSystems);
    this.disposeNodes(instance.skeletons);

    if (!instance.root.isDisposed()) {
      instance.root.dispose(false);
    }

    for (const transformNode of instance.transformNodes) {
      if (!transformNode.isDisposed()) {
        transformNode.dispose(false);
      }
    }

    for (const mesh of instance.meshes) {
      if (!mesh.isDisposed()) {
        mesh.dispose(false, true);
      }
    }
  }

  private toEditorObjectInstance(importedObject: ImportedSceneObjectContent): EditorObjectInstance {
    return {
      objectId: importedObject.objectId,
      root: importedObject.root,
      meshes: [...importedObject.meshes],
      renderableMeshes: [...importedObject.renderableMeshes],
      helperMeshes: [...importedObject.helperMeshes],
      transformNodes: [...importedObject.transformNodes],
      skeletons: [...importedObject.skeletons],
      animationGroups: [...importedObject.animationGroups],
      particleSystems: [...importedObject.particleSystems],
      descriptor: importedObject.descriptor
    };
  }

  private toEditorTerrainInstance(importedTerrain: ImportedSceneTerrainContent): EditorTerrainInstance {
    return {
      root: importedTerrain.root,
      meshes: [...importedTerrain.meshes],
      renderableMeshes: [...importedTerrain.renderableMeshes],
      helperMeshes: [...importedTerrain.helperMeshes],
      transformNodes: [...importedTerrain.transformNodes],
      skeletons: [...importedTerrain.skeletons],
      animationGroups: [...importedTerrain.animationGroups],
      particleSystems: [...importedTerrain.particleSystems],
      descriptor: importedTerrain.descriptor
    };
  }
}
