import { MeshBuilder, NullEngine, Scene } from "@babylonjs/core";
import { ShadowMeshPolicy } from "../../../src/core/lighting/ShadowMeshPolicy";
import type { SceneLightingDescriptor } from "../../../src/core/lighting/LightingTypes";

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

function createScene(): { engine: NullEngine; scene: Scene } {
  const engine = new NullEngine();
  const scene = new Scene(engine);
  return { engine, scene };
}

function createLighting(): SceneLightingDescriptor {
  return {
    shadows: {
      enabled: true,
      casterMode: "all",
      receiverMode: "terrainOnly",
      includeCharacters: true,
      includeSceneObjects: true,
      includeTerrain: false
    }
  };
}

function testDefaultTerrainReceivesButDoesNotCast(): void {
  const { engine, scene } = createScene();
  const mesh = MeshBuilder.CreateGround("terrain", { width: 2, height: 2 }, scene);
  const policy = new ShadowMeshPolicy();
  const lighting = createLighting();

  assert(policy.canReceive(mesh, { lighting, source: "terrain" }), "Expected terrain to receive shadows by default.");
  assert(!policy.canCast(mesh, { lighting, source: "terrain" }), "Expected terrain not to cast by default.");
  scene.dispose();
  engine.dispose();
}

function testDefaultSceneObjectCastsButDoesNotReceive(): void {
  const { engine, scene } = createScene();
  const mesh = MeshBuilder.CreateBox("building", { size: 1 }, scene);
  const policy = new ShadowMeshPolicy();
  const lighting = createLighting();

  assert(policy.canCast(mesh, { lighting, source: "sceneObject" }), "Expected scene object to cast shadows by default.");
  assert(!policy.canReceive(mesh, { lighting, source: "sceneObject" }), "Expected scene object not to receive by default.");
  scene.dispose();
  engine.dispose();
}

function testCharactersCastWhenIncluded(): void {
  const { engine, scene } = createScene();
  const mesh = MeshBuilder.CreateBox("character", { size: 1 }, scene);
  const policy = new ShadowMeshPolicy();
  const lighting = createLighting();

  assert(policy.canCast(mesh, { lighting, source: "character" }), "Expected character to cast shadows when included.");
  scene.dispose();
  engine.dispose();
}

function testCharactersDoNotCastWhenExcluded(): void {
  const { engine, scene } = createScene();
  const mesh = MeshBuilder.CreateBox("character", { size: 1 }, scene);
  const policy = new ShadowMeshPolicy();
  const lighting: SceneLightingDescriptor = {
    shadows: {
      ...createLighting().shadows,
      includeCharacters: false
    }
  };

  assert(!policy.canCast(mesh, { lighting, source: "character" }), "Expected character not to cast when includeCharacters=false.");
  scene.dispose();
  engine.dispose();
}

function testMetadataOverridesPolicy(): void {
  const { engine, scene } = createScene();
  const mesh = MeshBuilder.CreateBox("building-shadow-override", { size: 1 }, scene);
  const policy = new ShadowMeshPolicy();
  const lighting = createLighting();
  mesh.metadata = {
    shadowCaster: false,
    shadowReceiver: true
  };

  assert(!policy.canCast(mesh, { lighting, source: "sceneObject" }), "Expected explicit shadowCaster=false to win.");
  assert(policy.canReceive(mesh, { lighting, source: "sceneObject" }), "Expected explicit shadowReceiver=true to win.");
  scene.dispose();
  engine.dispose();
}

function testHelperMeshesAreExcluded(): void {
  const { engine, scene } = createScene();
  const mesh = MeshBuilder.CreateBox("debug-helper", { size: 1 }, scene);
  const policy = new ShadowMeshPolicy();
  const lighting = createLighting();
  mesh.metadata = { gameHelper: true, shadowCaster: true, shadowReceiver: true };

  assert(!policy.canCast(mesh, { lighting, source: "sceneObject" }), "Expected helper mesh not to cast.");
  assert(!policy.canReceive(mesh, { lighting, source: "sceneObject" }), "Expected helper mesh not to receive.");
  scene.dispose();
  engine.dispose();
}

function testMetadataMeshesAreExcluded(): void {
  const { engine, scene } = createScene();
  const mesh = MeshBuilder.CreateBox("NavigationMetadata", { size: 1 }, scene);
  const policy = new ShadowMeshPolicy();
  const lighting = createLighting();

  assert(!policy.canCast(mesh, { lighting, source: "sceneObject" }), "Expected metadata mesh not to cast.");
  assert(!policy.canReceive(mesh, { lighting, source: "sceneObject" }), "Expected metadata mesh not to receive.");
  scene.dispose();
  engine.dispose();
}

function testReceiverModeAllAllowsCharactersToReceive(): void {
  const { engine, scene } = createScene();
  const mesh = MeshBuilder.CreateBox("character", { size: 1 }, scene);
  const policy = new ShadowMeshPolicy();
  const lighting: SceneLightingDescriptor = {
    shadows: {
      ...createLighting().shadows,
      receiverMode: "all"
    }
  };

  assert(policy.canCast(mesh, { lighting, source: "character" }), "Expected character to cast by default.");
  assert(policy.canReceive(mesh, { lighting, source: "character" }), "Expected character to receive when receiverMode=all.");
  scene.dispose();
  engine.dispose();
}

function run(): void {
  testDefaultTerrainReceivesButDoesNotCast();
  testDefaultSceneObjectCastsButDoesNotReceive();
  testCharactersCastWhenIncluded();
  testCharactersDoNotCastWhenExcluded();
  testMetadataOverridesPolicy();
  testHelperMeshesAreExcluded();
  testMetadataMeshesAreExcluded();
  testReceiverModeAllAllowsCharactersToReceive();
}

run();
console.log("ShadowMeshPolicy tests passed");
