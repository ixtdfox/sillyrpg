import type { Component, ComponentCtor } from "./Component";
import { Entity } from "./Entity";

/**
 * Minimal entity registry for ECS-style querying.
 */
export class EntityManager {
  private readonly entitiesById: Map<string, Entity>;

  public constructor() {
    this.entitiesById = new Map<string, Entity>();
  }

  public addEntity(entity: Entity): void {
    this.entitiesById.set(entity.getId(), entity);
  }

  public removeEntity(entityId: string): void {
    this.entitiesById.delete(entityId);
  }

  public getEntity(entityId: string): Entity | null {
    return this.entitiesById.get(entityId) ?? null;
  }

  public getEntities(): Entity[] {
    return Array.from(this.entitiesById.values());
  }

  public query(...ctors: Array<ComponentCtor<Component>>): Entity[] {
    if (ctors.length === 0) {
      return this.getEntities();
    }

    return this.getEntities().filter((entity) => {
      return ctors.every((ctor) => entity.hasComponent(ctor));
    });
  }
}
