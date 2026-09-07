import { MeshBuilder, NullEngine, Scene, TransformNode } from "@babylonjs/core";
import { ShadowMeshPolicy } from "../../../src/core/lighting/ShadowMeshPolicy";
import { selectSceneObjectShadowMeshes } from "../../../src/core/lighting/BuildingShadowMeshSelector";
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

function testHiddenNavigationMeshesAreExcluded(): void {
  const { engine, scene } = createScene();
  const mesh = MeshBuilder.CreateBox("stair-checkpoint", { size: 1 }, scene);
  const policy = new ShadowMeshPolicy();
  const lighting = createLighting();
  mesh.metadata = {
    gltf: {
      extras: {
        nav_kind: "stair_checkpoint",
        hide_in_game: true,
        game_shadow_role: "caster"
      }
    }
  };

  assert(!policy.canCast(mesh, { lighting, source: "sceneObject" }), "Expected hidden navigation mesh not to cast.");
  assert(!policy.canReceive(mesh, { lighting, source: "sceneObject" }), "Expected hidden navigation mesh not to receive.");
  scene.dispose();
  engine.dispose();
}

function testGltfShadowRoleIsAuthoritative(): void {
  const { engine, scene } = createScene();
  const receiver = MeshBuilder.CreateBox("building-receiver", { size: 1 }, scene);
  const caster = MeshBuilder.CreateBox("building-caster", { size: 1 }, scene);
  const policy = new ShadowMeshPolicy();
  const lighting = createLighting();
  receiver.metadata = { gltf: { extras: { game_shadow_role: "receiver" } } };
  caster.metadata = { gltf: { extras: { game_shadow_role: "caster" } } };

  assert(!policy.canCast(receiver, { lighting, source: "sceneObject" }), "Expected GLTF receiver role not to cast.");
  assert(policy.canReceive(receiver, { lighting, source: "sceneObject" }), "Expected GLTF receiver role to receive.");
  assert(policy.canCast(caster, { lighting, source: "sceneObject" }), "Expected GLTF caster role to cast.");
  assert(!policy.canReceive(caster, { lighting, source: "sceneObject" }), "Expected GLTF caster role not to receive.");
  scene.dispose();
  engine.dispose();
}

function testParentGltfShadowRoleIsInherited(): void {
  const { engine, scene } = createScene();
  const parent = new TransformNode("lod-exterior", scene);
  const child = MeshBuilder.CreateBox("lod-exterior-primitive", { size: 1 }, scene);
  const policy = new ShadowMeshPolicy();
  const lighting = createLighting();
  parent.metadata = { gltf: { extras: { game_shadow_role: "none" } } };
  child.parent = parent;

  assert(!policy.canCast(child, { lighting, source: "sceneObject" }), "Expected child to inherit parent's non-caster role.");
  assert(!policy.canReceive(child, { lighting, source: "sceneObject" }), "Expected child to inherit parent's non-receiver role.");
  scene.dispose();
  engine.dispose();
}

function testChildShadowMetadataOverridesParent(): void {
  const { engine, scene } = createScene();
  const parent = new TransformNode("building", scene);
  const child = MeshBuilder.CreateBox("shadow-proxy", { size: 1 }, scene);
  const policy = new ShadowMeshPolicy();
  const lighting = createLighting();
  parent.metadata = { gltf: { extras: { game_shadow_role: "none" } } };
  child.metadata = { shadowRole: "caster" };
  child.parent = parent;

  assert(policy.canCast(child, { lighting, source: "sceneObject" }), "Expected child shadow role to override parent metadata.");
  assert(!policy.canReceive(child, { lighting, source: "sceneObject" }), "Expected child caster role not to receive shadows.");
  scene.dispose();
  engine.dispose();
}

function testChildCasterBooleanOverridesParentRole(): void {
  const { engine, scene } = createScene();
  const parent = new TransformNode("building", scene);
  const child = MeshBuilder.CreateBox("shadow-proxy", { size: 1 }, scene);
  const policy = new ShadowMeshPolicy();
  const lighting = createLighting();
  parent.metadata = { gltf: { extras: { game_shadow_role: "none" } } };
  child.metadata = { shadowCaster: true };
  child.parent = parent;

  assert(policy.canCast(child, { lighting, source: "sceneObject" }), "Expected child caster boolean to override parent role metadata.");
  assert(!policy.canReceive(child, { lighting, source: "sceneObject" }), "Expected the parent's receiver decision to remain inherited.");
  scene.dispose();
  engine.dispose();
}

function testTechnicalHelperRootDoesNotHideRenderableChild(): void {
  const { engine, scene } = createScene();
  const root = new TransformNode("__root__", scene);
  const child = MeshBuilder.CreateBox("building-caster", { size: 1 }, scene);
  const policy = new ShadowMeshPolicy();
  const lighting = createLighting();
  root.metadata = { gameHelper: true };
  child.metadata = { shadowRole: "caster" };
  child.parent = root;

  assert(policy.canCast(child, { lighting, source: "sceneObject" }), "Expected technical helper root not to classify its renderable child as a helper.");
  scene.dispose();
  engine.dispose();
}

function testBuildingShadowProxySelection(): void {
  const { engine, scene } = createScene();
  const detail = MeshBuilder.CreateBox("building-detail", { size: 1 }, scene);
  const proxy = MeshBuilder.CreateBox("building-shadow-proxy", { size: 1 }, scene);
  const road = MeshBuilder.CreateBox("road", { size: 1 }, scene);
  proxy.metadata = {
    gltf: {
      extras: {
        game_visibility: true,
        game_lod_role: "shadow_proxy"
      }
    }
  };

  const selected = selectSceneObjectShadowMeshes([
    { type: "building", renderableMeshes: [detail, proxy] },
    { type: "connected-object", renderableMeshes: [road] }
  ], true);

  assert(!selected.includes(detail), "Expected detailed building mesh to be excluded when a shadow proxy exists.");
  assert(selected.includes(proxy), "Expected building shadow proxy to be selected.");
  assert(selected.includes(road), "Expected non-building scene object to remain selected.");
  scene.dispose();
  engine.dispose();
}

function testBuildingShadowSelectionFallsBackToDetails(): void {
  const { engine, scene } = createScene();
  const detail = MeshBuilder.CreateBox("building-without-proxy", { size: 1 }, scene);
  const selected = selectSceneObjectShadowMeshes([
    { type: "building", renderableMeshes: [detail] }
  ], true);

  assert(selected.includes(detail), "Expected detailed building mesh fallback when no proxy exists.");
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
  testHiddenNavigationMeshesAreExcluded();
  testGltfShadowRoleIsAuthoritative();
  testParentGltfShadowRoleIsInherited();
  testChildShadowMetadataOverridesParent();
  testChildCasterBooleanOverridesParentRole();
  testTechnicalHelperRootDoesNotHideRenderableChild();
  testBuildingShadowProxySelection();
  testBuildingShadowSelectionFallsBackToDetails();
  testReceiverModeAllAllowsCharactersToReceive();
}

run();
console.log("ShadowMeshPolicy tests passed");
