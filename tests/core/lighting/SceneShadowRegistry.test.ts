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

function testDiagnosticsReportsBatchCasterAndReceiverCounts(): void {
  const engine = new NullEngine();
  const scene = new Scene(engine);
  const lightingController = new SceneLightingController(scene);
  const registry = new SceneShadowRegistry(lightingController);
  const terrain = MeshBuilder.CreateGround("terrain", { width: 4, height: 4 }, scene);
  const character = MeshBuilder.CreateBox("character", { size: 1 }, scene);
  const helper = MeshBuilder.CreateBox("debug-helper", { size: 1 }, scene);
  helper.metadata = { gameHelper: true };

  registry.setLighting(createLighting(true));
  registry.registerBatches([
    { ownerId: "terrain", source: "terrain", meshes: [terrain] },
    { ownerId: "character", source: "character", meshes: [character, helper] }
  ]);

  const diagnostics = registry.getDiagnostics();
  const terrainBatch = diagnostics.batches.find((batch) => batch.ownerId === "terrain");
  const characterBatch = diagnostics.batches.find((batch) => batch.ownerId === "character");

  assert(diagnostics.enabled === true, "Expected diagnostics to report shadows enabled.");
  assert(diagnostics.hasGenerator === true, "Expected diagnostics to report a shadow generator.");
  assert(diagnostics.casterCount === 1, "Expected one caster mesh in diagnostics.");
  assert(diagnostics.receiverCount === 1, "Expected one receiver mesh in diagnostics.");
  assert(terrainBatch?.receiverMeshes === 1, "Expected terrain batch to report one receiver.");
  assert(terrainBatch?.casterMeshes === 0, "Expected terrain batch to report zero default casters.");
  assert(characterBatch?.casterMeshes === 1, "Expected character batch to report one caster.");
  assert(characterBatch?.skippedMeshes === 1, "Expected helper mesh to be reported as skipped.");

  registry.dispose();
  scene.dispose();
  engine.dispose();
}

function run(): void {
  testRegistryRegistersCastersAndReceiversByPolicy();
  testRegistryClearsReceiversWhenShadowsDisabled();
  testDiagnosticsReportsBatchCasterAndReceiverCounts();
}

run();
console.log("SceneShadowRegistry tests passed");
