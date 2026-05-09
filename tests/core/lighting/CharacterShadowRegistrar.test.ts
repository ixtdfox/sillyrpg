import { Mesh, MeshBuilder, NullEngine, Scene, TransformNode } from "@babylonjs/core";
import { SceneLightingController } from "../../../src/core/lighting/SceneLightingController";
import { SceneShadowRegistry } from "../../../src/core/lighting/SceneShadowRegistry";
import type { SceneLightingDescriptor } from "../../../src/core/lighting/LightingTypes";
import { CharacterShadowRegistrar } from "../../../src/core/entity/systems/CharacterShadowRegistrar";
import { RenderableMeshResolver } from "../../../src/core/rendering/RenderableMeshResolver";

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

function createLighting(): SceneLightingDescriptor {
  return {
    ambient: { enabled: true },
    sun: { enabled: true },
    shadows: {
      enabled: true,
      generator: "standard",
      mapSize: 512,
      casterMode: "all",
      receiverMode: "terrainOnly",
      includeCharacters: true,
      includeSceneObjects: true,
      includeTerrain: false
    }
  };
}

function testResolverSkipsContainerAndMetadataMeshes(): void {
  const engine = new NullEngine();
  const scene = new Scene(engine);
  const root = new TransformNode("character-root", scene);
  const container = new Mesh("character-container", scene);
  container.parent = root;
  const renderMesh = MeshBuilder.CreateBox("character-body", { size: 1 }, scene);
  renderMesh.parent = container;
  const metadataMesh = MeshBuilder.CreateBox("NavigationMetadata", { size: 1 }, scene);
  metadataMesh.parent = root;

  const meshes = new RenderableMeshResolver().resolve(root);

  assert(meshes.length === 1, `Expected one resolved render mesh, received ${meshes.length}.`);
  assert(meshes[0] === renderMesh, "Expected resolver to include only the child render mesh.");
  scene.dispose();
  engine.dispose();
}

function testRegistrarAddsCharacterCasterBatch(): void {
  const engine = new NullEngine();
  const scene = new Scene(engine);
  const lightingController = new SceneLightingController(scene);
  const registry = new SceneShadowRegistry(lightingController);
  const root = new TransformNode("character-root", scene);
  const renderMesh = MeshBuilder.CreateBox("character-body", { size: 1 }, scene);
  renderMesh.parent = root;

  registry.setLighting(createLighting());
  new CharacterShadowRegistrar().register("npc-1", root, registry);

  const renderList = lightingController.getRig()?.getShadowGenerator()?.getShadowMap()?.renderList ?? [];
  const diagnostics = registry.getDiagnostics();
  const batch = diagnostics.batches.find((candidate) => candidate.ownerId === "entity:npc-1");

  assert(renderList.includes(renderMesh), "Expected character render mesh in shadow caster render list.");
  assert(batch?.casterMeshes === 1, "Expected diagnostics to report one character caster mesh.");
  assert(batch?.receiverMeshes === 0, "Expected character batch not to receive by terrain-only default.");

  registry.dispose();
  scene.dispose();
  engine.dispose();
}

function testRegistrarIncludesFallbackBoxRoot(): void {
  const engine = new NullEngine();
  const scene = new Scene(engine);
  const lightingController = new SceneLightingController(scene);
  const registry = new SceneShadowRegistry(lightingController);
  const fallback = MeshBuilder.CreateBox("entity-player-fallback", { size: 1.5 }, scene);

  registry.setLighting(createLighting());
  new CharacterShadowRegistrar().register("player", fallback, registry);

  const renderList = lightingController.getRig()?.getShadowGenerator()?.getShadowMap()?.renderList ?? [];
  assert(renderList.includes(fallback), "Expected fallback box root mesh to cast shadows.");

  registry.dispose();
  scene.dispose();
  engine.dispose();
}

function testRegistrarRecordsEmptyBatchWhenNoRenderableMeshesResolve(): void {
  const engine = new NullEngine();
  const scene = new Scene(engine);
  const lightingController = new SceneLightingController(scene);
  const registry = new SceneShadowRegistry(lightingController);
  const root = new TransformNode("empty-character-root", scene);

  registry.setLighting(createLighting());
  new CharacterShadowRegistrar().register("empty", root, registry);

  const batch = registry.getDiagnostics().batches.find((candidate) => candidate.ownerId === "entity:empty");
  assert(batch?.totalMeshes === 0, "Expected empty character batch to be visible in diagnostics.");

  registry.dispose();
  scene.dispose();
  engine.dispose();
}

function run(): void {
  testResolverSkipsContainerAndMetadataMeshes();
  testRegistrarAddsCharacterCasterBatch();
  testRegistrarIncludesFallbackBoxRoot();
  testRegistrarRecordsEmptyBatchWhenNoRenderableMeshesResolve();
}

run();
console.log("CharacterShadowRegistrar tests passed");
