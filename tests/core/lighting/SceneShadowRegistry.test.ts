import { MeshBuilder, NullEngine, Scene } from "@babylonjs/core";
import { SceneLightingController } from "../../../src/core/lighting/SceneLightingController";
import { SceneShadowRegistry } from "../../../src/core/lighting/SceneShadowRegistry";
import type { SceneLightingDescriptor } from "../../../src/core/lighting/LightingTypes";

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

function createLighting(enabled: boolean): SceneLightingDescriptor {
  return {
    ambient: { enabled: true },
    sun: { enabled: true },
    shadows: {
      enabled,
      generator: "standard",
      mapSize: 512,
      casterMode: "all",
      receiverMode: "terrainOnly",
      includeSceneObjects: true,
      includeTerrain: false
    }
  };
}

function testRegistryRegistersCastersAndReceiversByPolicy(): void {
  const engine = new NullEngine();
  const scene = new Scene(engine);
  const lightingController = new SceneLightingController(scene);
  const registry = new SceneShadowRegistry(lightingController);
  const terrain = MeshBuilder.CreateGround("terrain", { width: 4, height: 4 }, scene);
  const building = MeshBuilder.CreateBox("building", { size: 1 }, scene);

  registry.setLighting(createLighting(true));
  registry.registerBatches([
    { ownerId: "terrain", source: "terrain", meshes: [terrain] },
    { ownerId: "building", source: "sceneObject", meshes: [building] }
  ]);

  const renderList = lightingController.getRig()?.getShadowGenerator()?.getShadowMap()?.renderList ?? [];
  assert(renderList.includes(building), "Expected building in shadow caster render list.");
  assert(!renderList.includes(terrain), "Expected terrain not to cast by default.");
  assert(terrain.receiveShadows === true, "Expected terrain to receive shadows.");
  assert(building.receiveShadows === false, "Expected building not to receive shadows by default.");

  registry.dispose();
  scene.dispose();
  engine.dispose();
}

function testRegistryClearsReceiversWhenShadowsDisabled(): void {
  const engine = new NullEngine();
  const scene = new Scene(engine);
  const lightingController = new SceneLightingController(scene);
  const registry = new SceneShadowRegistry(lightingController);
  const terrain = MeshBuilder.CreateGround("terrain", { width: 4, height: 4 }, scene);
  const building = MeshBuilder.CreateBox("building", { size: 1 }, scene);

  registry.setLighting(createLighting(true));
  registry.registerBatches([
    { ownerId: "terrain", source: "terrain", meshes: [terrain] },
    { ownerId: "building", source: "sceneObject", meshes: [building] }
  ]);
  registry.setLighting(createLighting(false));

  assert(terrain.receiveShadows === false, "Expected terrain receiveShadows to clear when shadows disabled.");
  assert(lightingController.getRig()?.getShadowGenerator() === null, "Expected no shadow generator when disabled.");

  registry.dispose();
  scene.dispose();
  engine.dispose();
}

function run(): void {
  testRegistryRegistersCastersAndReceiversByPolicy();
  testRegistryClearsReceiversWhenShadowsDisabled();
}

run();
console.log("SceneShadowRegistry tests passed");
