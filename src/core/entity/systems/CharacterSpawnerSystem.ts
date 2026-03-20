import { AnimationGroup, MeshBuilder, Scene as BabylonScene } from "@babylonjs/core";
import type { Entity } from "../Entity";
import type { EntityManager } from "../EntityManager";
import type { System } from "../System";
import { AnimationComponent, type AnimationState } from "../components/AnimationComponent";
import { ModelComponent } from "../components/ModelComponent";
import { HexPositionComponent } from "../components/HexPositionComponent";
import { RenderableComponent } from "../components/RenderableComponent";
import { SpawnComponent } from "../components/SpawnComponent";
import { TransformComponent } from "../components/TransformComponent";
import { ModelInstantiator } from "../../model/instantiation/ModelInstantiator";
import { getInGameSceneRuntimeContext } from "../../scene/in-game/InGameSceneRuntimeContext";

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
    this.initializeHexPosition(entity);

    try {
      const instantiatedModel = await this.modelInstantiator.instantiate(
        scene,
        model.definition,
        `entity-${entity.getId()}-root`
      );

      const { rootNode, animationGroupsByName } = instantiatedModel;
      rootNode.position.copyFrom(transform.value);
      rootNode.rotation.copyFrom(transform.rotation);
      entity.addComponent(RenderableComponent, new RenderableComponent(rootNode));
      this.initializeAnimationComponents(entity, animationGroupsByName);
    } catch (error) {
      console.error(
        `Failed to spawn entity '${entity.getId()}' from model '${model.definition.assetPath}'.`,
        error
      );

      const fallback = MeshBuilder.CreateBox(`entity-${entity.getId()}-fallback`, { size: 1.5 }, scene);
      fallback.position.copyFrom(transform.value);
      fallback.rotation.copyFrom(transform.rotation);
      entity.addComponent(RenderableComponent, new RenderableComponent(fallback));
    } finally {
      entity.removeComponent(SpawnComponent);
      this.pendingSpawns.delete(entity.getId());
    }
  }

  private initializeHexPosition(entity: Entity): void {
    if (!this.scene || entity.hasComponent(HexPositionComponent)) {
      return;
    }

    const runtimeContext = getInGameSceneRuntimeContext(this.scene);
    if (!runtimeContext) {
      return;
    }

    const transform = entity.getComponent(TransformComponent);
    const grid = runtimeContext.hexGridRuntime.getGrid();
    const startCell = grid.worldToCell(transform.value);

    if (!grid.contains(startCell)) {
      return;
    }

    entity.addComponent(HexPositionComponent, new HexPositionComponent(startCell));
    const alignedPosition = grid.cellToWorld(startCell, transform.value.y);
    transform.value.copyFrom(alignedPosition);
  }

  private initializeAnimationComponents(
    entity: Entity,
    animationGroupsByName: ReadonlyMap<string, AnimationGroup>
  ): void {
    if (animationGroupsByName.size === 0) {
      return;
    }

    for (const animationGroup of animationGroupsByName.values()) {
      animationGroup.stop();
    }

    const mapping: Partial<Record<AnimationState, string>> = {
      idle: this.findFirstAnimationGroupName(animationGroupsByName, "idle"),
      walk: this.findFirstAnimationGroupName(animationGroupsByName, "walk"),
      attack: this.findFirstAnimationGroupName(animationGroupsByName, "attack")
    };

    entity.addComponent(AnimationComponent, new AnimationComponent(mapping, animationGroupsByName));
  }

  private findFirstAnimationGroupName(
    animationGroupsByName: ReadonlyMap<string, AnimationGroup>,
    token: string
  ): string | undefined {
    const normalizedToken = token.toLowerCase();

    for (const animationGroupName of animationGroupsByName.keys()) {
      if (animationGroupName.toLowerCase().includes(normalizedToken)) {
        return animationGroupName;
      }
    }

    return undefined;
  }
}
