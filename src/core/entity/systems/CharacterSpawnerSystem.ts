import { MeshBuilder, Scene as BabylonScene, SceneLoader, TransformNode } from "@babylonjs/core";
import type { Entity } from "../Entity";
import type { EntityManager } from "../EntityManager";
import type { System } from "../System";
import { ModelComponent } from "../components/ModelComponent";
import { SpawnComponent } from "../components/SpawnComponent";
import { TransformComponent } from "../components/TransformComponent";

/**
 * Spawns scene models for entities marked with spawn data.
 */
export class CharacterSpawnerSystem implements System {
  private readonly entityManager: EntityManager;
  private readonly pendingSpawns: Set<string>;
  private scene: BabylonScene | null;

  private static readonly GLTF_LOADER_URL = "https://cdn.jsdelivr.net/npm/@babylonjs/loaders@7.40.0/glTF/index.js";
  private static gltfLoaderPromise: Promise<void> | null = null;

  public constructor(entityManager: EntityManager) {
    this.entityManager = entityManager;
    this.pendingSpawns = new Set<string>();
    this.scene = null;
  }

  /**
   * Sets the active Babylon scene used for spawning.
   *
   * @param scene - Active scene.
   */
  public setScene(scene: BabylonScene | null): void {
    this.scene = scene;
    this.pendingSpawns.clear();
  }

  public update(_deltaSeconds: number): void {
    if (!this.scene) {
      return;
    }

    const entities = this.entityManager.query(TransformComponent, ModelComponent, SpawnComponent);

    if (entities.length === 0) {
      return;
    }

    for (const entity of entities) {
      if (this.pendingSpawns.has(entity.getId())) {
        continue;
      }

      this.pendingSpawns.add(entity.getId());
      void this.spawnEntity(entity, this.scene);
    }
  }

  private async spawnEntity(entity: Entity, scene: BabylonScene): Promise<void> {
    const transform = entity.getComponent(TransformComponent);
    const model = entity.getComponent(ModelComponent);
    const spawn = entity.getComponent(SpawnComponent);

    transform.value.copyFrom(spawn.position);
    transform.rotation.copyFrom(spawn.rotation);

    try {
      const extension = this.getFileExtension(model.assetPath);
      await this.ensureLoaderForExtension(extension);

      const hasLoader = SceneLoader.IsPluginForExtensionAvailable(extension);
      if (!hasLoader) {
        throw new Error(`No Babylon loader plugin found for extension: ${extension}`);
      }

      const { rootUrl, fileName } = this.resolveModelPath(model.assetPath);
      const loaded = await SceneLoader.ImportMeshAsync("", rootUrl, fileName, scene);
      const rootNode = new TransformNode(`entity-${entity.getId()}-root`, scene);

      for (const mesh of loaded.meshes) {
        if (mesh.parent === null) {
          mesh.setParent(rootNode);
        }
      }

      rootNode.position.copyFrom(transform.value);
      rootNode.rotation.copyFrom(transform.rotation);
    } catch (error) {
      console.error(`Failed to spawn entity '${entity.getId()}' from model '${model.assetPath}'.`, error);

      const fallback = MeshBuilder.CreateBox(`entity-${entity.getId()}-fallback`, { size: 1.5 }, scene);
      fallback.position.copyFrom(transform.value);
      fallback.rotation.copyFrom(transform.rotation);
    } finally {
      entity.removeComponent(SpawnComponent);
      this.pendingSpawns.delete(entity.getId());
    }
  }

  private async ensureLoaderForExtension(extension: string): Promise<void> {
    if (extension !== ".glb" && extension !== ".gltf") {
      return;
    }

    if (SceneLoader.IsPluginForExtensionAvailable(extension)) {
      return;
    }

    if (!CharacterSpawnerSystem.gltfLoaderPromise) {
      CharacterSpawnerSystem.gltfLoaderPromise = (async () => {
        await import(/* @vite-ignore */ CharacterSpawnerSystem.GLTF_LOADER_URL);
      })();
    }

    await CharacterSpawnerSystem.gltfLoaderPromise;
  }

  private getFileExtension(filePath: string): string {
    const dotIndex = filePath.lastIndexOf(".");
    if (dotIndex === -1) {
      return "";
    }

    return filePath.slice(dotIndex).toLowerCase();
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
