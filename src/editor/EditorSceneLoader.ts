import { Scene, TransformNode, Vector3, type AbstractMesh } from "@babylonjs/core";
import type { ShadowMeshBatch } from "../core/lighting/SceneShadowRegistry";
import { normalizeAssetPath } from "../core/model/SceneAssetPath";
import {
  applyTransform,
  importSceneObjectContent,
  type ImportedSceneObjectContent,
  type ImportedSceneTerrainContent
} from "../core/world/scene/SceneContentLoader";
import type { SceneDescriptor, SceneObjectDescriptor, SceneTerrainDescriptor } from "../core/world/scene/SceneDescriptor";
import { EditorTerrainContentImporter } from "./terrain/generation/EditorTerrainContentImporter";
import type {
  EditorLoadedSceneContent,
  EditorObjectInstance,
  EditorSceneOption,
  EditorTerrainInstance
} from "./types";

/**
 * Декоратор editor metadata поверх core scene import result.
 *
 * Core loader больше не знает про editor-selectable/editor-helper флаги; эти
 * признаки нужны только редактору для picking, selection и helper filtering.
 */
class EditorSceneMetadataDecorator {
  /**
   * Маркирует terrain как editor-owned, но не selectable как обычный object.
   */
  public decorateTerrain(terrain: ImportedSceneTerrainContent): void {
    this.mergeMetadata(terrain.root, {
      editorTerrain: true,
      editorSelectable: false
    });

    for (const mesh of terrain.renderableMeshes) {
      this.mergeMetadata(mesh, {
        editorTerrain: true,
        editorSelectable: false
      });
    }

    this.decorateHelpers(terrain.helperMeshes);
  }

  /**
   * Маркирует scene object nodes как selectable в editor.
   */
  public decorateObject(object: ImportedSceneObjectContent): void {
    this.mergeMetadata(object.root, {
      editorSelectable: true
    });

    for (const node of object.transformNodes) {
      this.mergeMetadata(node, {
        editorSelectable: true
      });
    }

    for (const mesh of object.renderableMeshes) {
      this.mergeMetadata(mesh, {
        editorSelectable: true
      });
    }

    this.decorateHelpers(object.helperMeshes);
  }

  private decorateHelpers(meshes: readonly AbstractMesh[]): void {
    for (const mesh of meshes) {
      this.mergeMetadata(mesh, {
        editorHelper: true,
        gameHelper: true,
        editorSelectable: false
      });
    }
  }

  private mergeMetadata(node: AbstractMesh | TransformNode, metadata: Record<string, unknown>): void {
    node.metadata = {
      ...(node.metadata as Record<string, unknown> | undefined),
      ...metadata
    };
  }
}

/**
 * Загружает и инкрементально обновляет editor scene content.
 *
 * Класс держит orchestration редактора отдельно от core loader: core отвечает
 * за импорт runtime-контента, а здесь сохраняются camera/UI/helpers и
 * накладывается editor metadata через EditorSceneMetadataDecorator.
 */
export class EditorSceneLoader {
  private readonly scene: Scene;
  private readonly metadataDecorator: EditorSceneMetadataDecorator;
  private readonly terrainImporter: EditorTerrainContentImporter;
  private currentContent: EditorLoadedSceneContent | null;
  private readonly objectInstances: Map<string, EditorObjectInstance>;
  private terrainInstance: EditorTerrainInstance | null;

  public constructor(scene: Scene) {
    this.scene = scene;
    this.metadataDecorator = new EditorSceneMetadataDecorator();
    this.terrainImporter = new EditorTerrainContentImporter();
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
    const terrainContent = descriptor.terrain
      ? await this.terrainImporter.import(this.scene, descriptor.terrain, root, "editor")
      : null;
    if (terrainContent) {
      this.metadataDecorator.decorateTerrain(terrainContent);
    }

    this.objectInstances.clear();
    const importedObjects: ImportedSceneObjectContent[] = [];
    for (const objectDescriptor of descriptor.objects) {
      const importedObject = await importSceneObjectContent(this.scene, objectDescriptor, root, "editor");
      this.metadataDecorator.decorateObject(importedObject);
      importedObjects.push(importedObject);
      this.objectInstances.set(importedObject.objectId, this.toEditorObjectInstance(importedObject));
    }

    this.terrainInstance = terrainContent
      ? this.toEditorTerrainInstance(terrainContent)
      : null;

    const aggregate = this.createAggregate(terrainContent, importedObjects);

    const content: EditorLoadedSceneContent = {
      option,
      descriptor,
      root,
      meshes: aggregate.meshes,
      renderableMeshes: aggregate.renderableMeshes,
      helperMeshes: aggregate.helperMeshes,
      transformNodes: aggregate.transformNodes,
      skeletons: aggregate.skeletons,
      animationGroups: aggregate.animationGroups,
      particleSystems: aggregate.particleSystems,
      sceneObjects: [...this.objectInstances.values()],
      terrain: this.terrainInstance,
      summary: {
        descriptorUrl: normalizeAssetPath(option.rawDescriptorPath),
        rawDescriptorPath: option.rawDescriptorPath,
        terrainLabel: describeTerrain(descriptor.terrain),
        objectCount: descriptor.objects.length
      }
    };

    this.currentContent = content;
    this.refreshWorldMatrices();
    return content;
  }

  public async addObject(objectDescriptor: SceneObjectDescriptor): Promise<EditorObjectInstance> {
    const content = this.requireCurrentContent();
    const importedObject = await importSceneObjectContent(this.scene, objectDescriptor, content.root, "editor");
    this.metadataDecorator.decorateObject(importedObject);
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
    const importedTerrain = await this.terrainImporter.import(this.scene, descriptor, content.root, "editor");
    this.metadataDecorator.decorateTerrain(importedTerrain);
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

  /**
   * Собирает общий snapshot imported nodes для editor scene content.
   */
  private createAggregate(
    terrain: ImportedSceneTerrainContent | null,
    objects: readonly ImportedSceneObjectContent[]
  ): {
    readonly meshes: readonly AbstractMesh[];
    readonly renderableMeshes: readonly AbstractMesh[];
    readonly helperMeshes: readonly AbstractMesh[];
    readonly transformNodes: readonly TransformNode[];
    readonly skeletons: ImportedSceneTerrainContent["skeletons"];
    readonly animationGroups: ImportedSceneTerrainContent["animationGroups"];
    readonly particleSystems: ImportedSceneTerrainContent["particleSystems"];
  } {
    const nodes = terrain ? [terrain, ...objects] : [...objects];
    return {
      meshes: nodes.flatMap((node) => node.meshes),
      renderableMeshes: nodes.flatMap((node) => node.renderableMeshes),
      helperMeshes: nodes.flatMap((node) => node.helperMeshes),
      transformNodes: nodes.flatMap((node) => node.transformNodes),
      skeletons: nodes.flatMap((node) => node.skeletons),
      animationGroups: nodes.flatMap((node) => node.animationGroups),
      particleSystems: nodes.flatMap((node) => node.particleSystems)
    };
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
        // Некоторые Babylon helper meshes не имеют стабильного refreshBoundingInfo,
        // поэтому editor loader пропускает их без падения всей операции обновления.
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

function describeTerrain(terrain: SceneTerrainDescriptor | null | undefined): string {
  if (!terrain) {
    return "none";
  }

  if (terrain.kind === "plane") {
    return `plane ${terrain.size[0]}x${terrain.size[1]}`;
  }

  if (terrain.kind === "generated") {
    return `generated ${terrain.generator.preset} ${terrain.resolution[0]}x${terrain.resolution[1]}${terrain.editedHeightMap ? " edited" : ""}`;
  }

  return terrain.model;
}
