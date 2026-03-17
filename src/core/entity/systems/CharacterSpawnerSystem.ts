import { MeshBuilder, Scene as BabylonScene } from "@babylonjs/core";
import type { Entity } from "../Entity";
import type { EntityManager } from "../EntityManager";
import type { System } from "../System";
import { ModelComponent } from "../components/ModelComponent";
import { SpawnComponent } from "../components/SpawnComponent";
import { TransformComponent } from "../components/TransformComponent";
import { ModelInstantiator } from "../../model/instantiation/ModelInstantiator";
import { LoaderBootstrap } from "../../model/instantiation/LoaderBootstrap";

export class CharacterSpawnerSystem implements System {
  private readonly entityManager: EntityManager;
  private readonly modelInstantiator: ModelInstantiator;
  private readonly pendingSpawns: Set<string>;
  private scene: BabylonScene | null;

  public constructor(entityManager: EntityManager, modelInstantiator: ModelInstantiator = new ModelInstantiator()) {
    this.entityManager = entityManager;
    this.modelInstantiator = modelInstantiator;
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
      if (!(await this.canInstantiateModel(model.definition.assetPath))) {
        console.warn(
          `Skipping model load for entity '${entity.getId()}': no loader available for '${model.definition.assetPath}'. Using fallback mesh.`
        );
        this.spawnFallback(entity, scene, transform);
        return;
      }

      const rootNode = await this.modelInstantiator.instantiate(
        scene,
        model.definition,
        `entity-${entity.getId()}-root`
      );

      rootNode.position.copyFrom(transform.value);
      rootNode.rotation.copyFrom(transform.rotation);
    } catch (error) {
      console.error(
        `Failed to spawn entity '${entity.getId()}' from model '${model.definition.assetPath}'.`,
        error
      );

      this.spawnFallback(entity, scene, transform);
    } finally {
      entity.removeComponent(SpawnComponent);
      this.pendingSpawns.delete(entity.getId());
    }
  }

  private spawnFallback(entity: Entity, scene: BabylonScene, transform: TransformComponent): void {
    const fallback = MeshBuilder.CreateBox(`entity-${entity.getId()}-fallback`, { size: 1.5 }, scene);
    fallback.position.copyFrom(transform.value);
    fallback.rotation.copyFrom(transform.rotation);
  }

  private async canInstantiateModel(assetPath: string): Promise<boolean> {
    const extension = this.getFileExtension(assetPath);
    return LoaderBootstrap.ensureLoaderForExtension(extension);
  }

  private getFileExtension(assetPath: string): string {
    const dotIndex = assetPath.lastIndexOf(".");
    if (dotIndex === -1) {
      return "";
    }

    return assetPath.slice(dotIndex).toLowerCase();
  }
}
