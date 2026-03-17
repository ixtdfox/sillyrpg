import type { Component } from "../../../src/core/entity/Component";
import { Entity } from "../../../src/core/entity/Entity";
import { EntityManager } from "../../../src/core/entity/EntityManager";

class PositionComponent implements Component {
  public constructor(
    public readonly x: number,
    public readonly y: number,
  ) {}
}

class HealthComponent implements Component {
  public constructor(public readonly hp: number) {}
}

class TagComponent implements Component {
  public constructor(public readonly tag: string) {}
}

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

function testAddGetAndRemoveEntity(): void {
  const manager = new EntityManager();
  const entity = new Entity("hero");

  manager.addEntity(entity);

  assert(manager.getEntity("hero") === entity, "Expected to retrieve previously added entity");

  manager.removeEntity("hero");

  assert(manager.getEntity("hero") === null, "Expected removed entity to be absent");
}

function testGetEntitiesReturnsAllRegisteredEntities(): void {
  const manager = new EntityManager();
  const hero = new Entity("hero");
  const npc = new Entity("npc");

  manager.addEntity(hero);
  manager.addEntity(npc);

  const all = manager.getEntities();

  assert(all.length === 2, "Expected all entities to be returned");
  assert(all.includes(hero), "Expected hero entity in result set");
  assert(all.includes(npc), "Expected npc entity in result set");
}

function testQueryReturnsEntitiesMatchingAllRequiredComponents(): void {
  const manager = new EntityManager();

  const hero = new Entity("hero");
  hero.addComponent(PositionComponent, new PositionComponent(10, 20));
  hero.addComponent(HealthComponent, new HealthComponent(100));

  const npc = new Entity("npc");
  npc.addComponent(PositionComponent, new PositionComponent(5, 6));

  const marker = new Entity("marker");
  marker.addComponent(TagComponent, new TagComponent("poi"));

  manager.addEntity(hero);
  manager.addEntity(npc);
  manager.addEntity(marker);

  const positionAndHealth = manager.query(PositionComponent, HealthComponent);
  const positionOnly = manager.query(PositionComponent);
  const noComponents = manager.query();

  assert(positionAndHealth.length === 1, "Expected only one entity with position and health");
  assert(positionAndHealth[0] === hero, "Expected hero to match position+health query");

  assert(positionOnly.length === 2, "Expected hero and npc to match position query");
  assert(positionOnly.includes(hero), "Expected hero in position query");
  assert(positionOnly.includes(npc), "Expected npc in position query");

  assert(noComponents.length === 3, "Expected empty query to return all entities");
}

function testAddingDuplicateIdReplacesEntity(): void {
  const manager = new EntityManager();
  const first = new Entity("shared-id");
  const replacement = new Entity("shared-id");

  manager.addEntity(first);
  manager.addEntity(replacement);

  const all = manager.getEntities();

  assert(all.length === 1, "Expected replacement to keep a single entity per id");
  assert(manager.getEntity("shared-id") === replacement, "Expected latest entity to be registered");
}

function run(): void {
  testAddGetAndRemoveEntity();
  testGetEntitiesReturnsAllRegisteredEntities();
  testQueryReturnsEntitiesMatchingAllRequiredComponents();
  testAddingDuplicateIdReplacesEntity();
}

run();
console.log("EntityManager tests passed");
