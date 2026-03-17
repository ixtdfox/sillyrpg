import { MeshBuilder, Scene as BabylonScene } from "@babylonjs/core";
import type { Entity } from "../Entity";
import type { EntityManager } from "../EntityManager";
import type { System } from "../System";
import { ModelComponent } from "../components/ModelComponent";
import { SpawnComponent } from "../components/SpawnComponent";
import { TransformComponent } from "../components/TransformComponent";
import { ModelInstantiator } from "../../model/instantiation/ModelInstantiator";

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

      const fallback = MeshBuilder.CreateBox(`entity-${entity.getId()}-fallback`, { size: 1.5 }, scene);
      fallback.position.copyFrom(transform.value);
      fallback.rotation.copyFrom(transform.rotation);
    } finally {
      entity.removeComponent(SpawnComponent);
      this.pendingSpawns.delete(entity.getId());
    }
  }
}
