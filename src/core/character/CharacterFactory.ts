import { EntityLoader } from "../entity/EntityLoader";
import { Entity } from "../entity/Entity";

/**
 * Thin convenience wrapper for character entity definitions.
 */
export class CharacterFactory {
  private readonly entityLoader: EntityLoader;

  public constructor(entityLoader: EntityLoader) {
    this.entityLoader = entityLoader;
  }

  public async createPlayer(): Promise<Entity> {
    return this.entityLoader.createEntity("human-player");
  }

  public async createGolem(): Promise<Entity> {
    return this.entityLoader.createEntity("golem-enemy");
  }
}
