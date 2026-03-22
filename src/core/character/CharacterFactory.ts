import { Vector3 } from "@babylonjs/core";
import { Entity } from "../entity/Entity";
import { EntityPrefabFactory } from "../entity/EntityPrefabFactory";

/**
 * Thin convenience wrapper for frequently used character prefabs.
 */
export class CharacterFactory {
  private readonly prefabFactory: EntityPrefabFactory;

  public constructor(prefabFactory: EntityPrefabFactory) {
    this.prefabFactory = prefabFactory;
  }

  public async createPlayer(position?: Vector3, rotation?: Vector3): Promise<Entity> {
    return this.prefabFactory.instantiate("playerHuman", { position, rotation });
  }

  public async createGolem(position?: Vector3, rotation?: Vector3): Promise<Entity> {
    return this.prefabFactory.instantiate("golemEnemy", { position, rotation });
  }

  public async createHumanNpc(position: Vector3, rotation?: Vector3): Promise<Entity> {
    return this.prefabFactory.instantiate("human", { position, rotation });
  }
}
