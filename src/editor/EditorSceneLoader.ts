import {
  BoundingInfo,
  Scene,
  SceneLoader,
  TransformNode,
  type AbstractMesh,
  type AnimationGroup,
  type IParticleSystem,
  type Skeleton
} from "@babylonjs/core";
import "@babylonjs/loaders/glTF";
import { resolveSceneAssetPath } from "../core/model/SceneAssetPath";
import type { EditorLoadedSceneContent, EditorSceneOption } from "./types";

/**
 * Loads and unloads editor scene content while preserving editor-owned camera/UI/helpers.
 */
export class EditorSceneLoader {
  private readonly scene: Scene;
  private currentContent: EditorLoadedSceneContent | null;

  public constructor(scene: Scene) {
    this.scene = scene;
    this.currentContent = null;
  }

  public getCurrentContent(): EditorLoadedSceneContent | null {
    return this.currentContent;
  }

  public async load(option: EditorSceneOption): Promise<EditorLoadedSceneContent> {
    this.disposeCurrentContent();

    const root = new TransformNode(`editor-scene-root:${option.id}`, this.scene);
    const { rootUrl, fileName } = resolveSceneAssetPath(option.assetUrl);
    const importResult = await SceneLoader.ImportMeshAsync(undefined, rootUrl, fileName, this.scene);

    for (const transformNode of importResult.transformNodes) {
      if (transformNode === root || transformNode.parent) {
        continue;
      }

      transformNode.setParent(root, true);
    }

    for (const mesh of importResult.meshes) {
      if (mesh.parent) {
        continue;
      }

      mesh.setParent(root, true);
    }

    root.computeWorldMatrix(true);
    for (const mesh of importResult.meshes) {
      mesh.computeWorldMatrix(true);
      if ("refreshBoundingInfo" in mesh && typeof mesh.refreshBoundingInfo === "function") {
        mesh.refreshBoundingInfo({});
      }
    }

    const renderableMeshes = importResult.meshes.filter((mesh) => this.isEditorRenderableMesh(mesh));
    const renderableMeshSet = new Set(renderableMeshes);
    const helperMeshes = importResult.meshes.filter((mesh) => !renderableMeshSet.has(mesh));

    for (const helperMesh of helperMeshes) {
      helperMesh.isVisible = false;
      helperMesh.isPickable = false;
    }

    for (const mesh of renderableMeshes) {
      // TODO: Re-enable pickability when scene-object selection is implemented.
      mesh.isPickable = false;
    }

    const content: EditorLoadedSceneContent = {
      option,
      root,
      meshes: importResult.meshes,
      renderableMeshes,
      helperMeshes,
      transformNodes: importResult.transformNodes,
      skeletons: importResult.skeletons,
      animationGroups: importResult.animationGroups,
      particleSystems: importResult.particleSystems
    };
    this.currentContent = content;
    return content;
  }

  public clear(): void {
    this.disposeCurrentContent();
  }

  public dispose(): void {
    this.disposeCurrentContent();
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

    this.currentContent = null;
  }

  private disposeNodes(nodes: readonly { dispose: (doNotRecurse?: boolean) => void }[]): void {
    for (const node of nodes) {
      node.dispose(false);
    }
  }

  private isEditorRenderableMesh(mesh: AbstractMesh): boolean {
    const name = mesh.name.toLowerCase();
    const id = mesh.id.toLowerCase();
    const metadata = (mesh.metadata ?? {}) as Record<string, unknown>;
    const rawMetadata = (metadata.rawMetadata ?? {}) as Record<string, unknown>;

    if (name.includes("metadata") || id.includes("metadata")) {
      return false;
    }

    if (name.includes("navigationmetadata") || id.includes("navigationmetadata")) {
      return false;
    }

    if (metadata.editorHelper === true || metadata.gameHelper === true || metadata.isMetadata === true) {
      return false;
    }

    if (
      rawMetadata.editor_helper === true ||
      rawMetadata.game_helper === true ||
      rawMetadata.metadata_carrier === true
    ) {
      return false;
    }

    if (mesh.getTotalVertices() <= 0) {
      return false;
    }

    const bounds = this.tryGetBoundingInfo(mesh);
    if (!bounds) {
      return false;
    }

    const min = bounds.boundingBox.minimumWorld;
    const max = bounds.boundingBox.maximumWorld;
    if (![min.x, min.y, min.z, max.x, max.y, max.z].every(Number.isFinite)) {
      return false;
    }

    if (max.y < -100 || min.y < -100) {
      return false;
    }

    return true;
  }

  private tryGetBoundingInfo(mesh: AbstractMesh): BoundingInfo | null {
    try {
      return mesh.getBoundingInfo();
    } catch {
      return null;
    }
  }
}
