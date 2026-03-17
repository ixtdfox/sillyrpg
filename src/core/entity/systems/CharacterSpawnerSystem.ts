import { MeshBuilder, Scene as BabylonScene, SceneLoader, TransformNode } from "@babylonjs/core";
import "@babylonjs/loaders/glTF"; // или "@babylonjs/loaders/glTF/index.js"
import type { Entity } from "../Entity";
import type { EntityManager } from "../EntityManager";
import type { System } from "../System";
import { ModelComponent } from "../components/ModelComponent";
import { SpawnComponent } from "../components/SpawnComponent";
import { TransformComponent } from "../components/TransformComponent";
import { normalizeModel } from "../../model/normalization";

export class CharacterSpawnerSystem implements System {
  private readonly entityManager: EntityManager;
  private readonly pendingSpawns: Set<string>;
  private scene: BabylonScene | null;

  public constructor(entityManager: EntityManager) {
    this.entityManager = entityManager;
    this.pendingSpawns = new Set<string>();
    this.scene = null;
  }

  public setScene(scene: BabylonScene | null): void {
    this.scene = scene;
    this.pendingSpawns.clear();
  }

  public update(_deltaSeconds: number): void {
    if (!this.scene) {
      return;
    }

    const entities = this.entityManager.query(TransformComponent, ModelComponent, SpawnComponent);

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
      const { rootUrl, fileName } = this.resolveModelPath(model.assetPath);

      const loaded = await SceneLoader.ImportMeshAsync("", rootUrl, fileName, scene);
      const rootNode = new TransformNode(`entity-${entity.getId()}-root`, scene);

      for (const mesh of loaded.meshes) {
        if (mesh.parent === null) {
          mesh.setParent(rootNode);
        }
      }

      // Apply optional uniform model-size normalization before final placement.
      if (model.normalization) {
        normalizeModel(rootNode, model.normalization);
      }

      rootNode.position.copyFrom(transform.value);
      rootNode.rotation.copyFrom(transform.rotation);
    } catch (error) {
      console.error(
          `Failed to spawn entity '${entity.getId()}' from model '${model.assetPath}'.`,
          error
      );

      const fallback = MeshBuilder.CreateBox(
          `entity-${entity.getId()}-fallback`,
          { size: 1.5 },
          scene
      );
      fallback.position.copyFrom(transform.value);
      fallback.rotation.copyFrom(transform.rotation);
    } finally {
      entity.removeComponent(SpawnComponent);
      this.pendingSpawns.delete(entity.getId());
    }
  }

  private resolveModelPath(modelPath: string): { rootUrl: string; fileName: string } {
    const normalizedPath = modelPath.startsWith("/") ? modelPath : `/${modelPath}`;
    const lastSlashIndex = normalizedPath.lastIndexOf("/");

    return {
      rootUrl: normalizedPath.slice(0, lastSlashIndex + 1),
      fileName: normalizedPath.slice(lastSlashIndex + 1),
    };
  }
}
