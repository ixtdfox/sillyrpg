import { CascadedShadowGenerator, MeshBuilder, NullEngine, Scene } from "@babylonjs/core";
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

function testSynchronizationFollowsEnabledLodCaster(): void {
  const engine = new NullEngine();
  const scene = new Scene(engine);
  const lightingController = new SceneLightingController(scene);
  const registry = new SceneShadowRegistry(lightingController);
  const lod0 = MeshBuilder.CreateBox("LOD0_Full", { size: 1 }, scene);
  const lod1 = MeshBuilder.CreateBox("LOD1_Exterior", { size: 1 }, scene);
  const alwaysEnabled = MeshBuilder.CreateBox("AlwaysEnabled", { size: 1 }, scene);
  lod0.metadata = { shadowRole: "caster" };
  lod1.metadata = { shadowRole: "caster" };
  alwaysEnabled.metadata = { shadowRole: "caster" };
  lod0.setEnabled(false);

  registry.setLighting(createLighting(true));
  registry.registerBatch({ ownerId: "building", source: "sceneObject", meshes: [lod0, lod1, alwaysEnabled] });

  let renderList = lightingController.getRig()?.getShadowGenerator()?.getShadowMap()?.renderList ?? [];
  assert(!renderList.includes(lod0), "Expected disabled LOD0 not to cast shadows.");
  assert(renderList.includes(lod1), "Expected enabled LOD1 to cast shadows.");
  assert(renderList.includes(alwaysEnabled), "Expected the additional enabled mesh to cast shadows.");

  lod0.setEnabled(true);
  lod1.setEnabled(false);
  registry.synchronize();
  renderList = lightingController.getRig()?.getShadowGenerator()?.getShadowMap()?.renderList ?? [];
  assert(renderList.includes(lod0), "Expected enabled LOD0 to cast shadows after synchronization.");
  assert(!renderList.includes(lod1), "Expected disabled LOD1 not to cast shadows after synchronization.");
  assert(
    renderList.filter((mesh) => mesh === alwaysEnabled).length === 1,
    "Expected synchronization to retain exactly one entry for every continuously enabled caster."
  );

  registry.dispose();
  scene.dispose();
  engine.dispose();
}

function testSharedInstanceReceiverStateUsesAnyEligibleInstance(): void {
  const engine = new NullEngine();
  const scene = new Scene(engine);
  const lightingController = new SceneLightingController(scene);
  const registry = new SceneShadowRegistry(lightingController);
  const source = MeshBuilder.CreateBox("shared-building-source", { size: 1 }, scene);
  const visibleInstance = source.createInstance("visible-building-instance");
  const culledInstance = source.createInstance("culled-building-instance");
  culledInstance.setEnabled(false);
  const lighting = createLighting(true);

  registry.setLighting({
    ...lighting,
    shadows: { ...lighting.shadows!, receiverMode: "all" }
  });
  registry.registerBatch({
    ownerId: "shared-buildings",
    source: "sceneObject",
    meshes: [visibleInstance, culledInstance]
  });

  assert(source.receiveShadows === true, "Expected an eligible instance to enable receiving on its shared source mesh.");
  assert(visibleInstance.receiveShadows === true, "Expected the visible instance to observe shared receiver state.");
  assert(registry.getDiagnostics().receiverCount === 1, "Expected diagnostics to count only the eligible receiver instance.");

  registry.dispose();
  scene.dispose();
  engine.dispose();
}

function testDiagnosticsGroupsActualBuildingCastersByLodRole(): void {
  const engine = new NullEngine();
  const scene = new Scene(engine);
  const lightingController = new SceneLightingController(scene);
  const registry = new SceneShadowRegistry(lightingController);
  const proxy = MeshBuilder.CreateBox("Shadow_Proxy", { size: 1 }, scene);
  proxy.metadata = {
    sceneObjectType: "building",
    buildingVisibilityInstanceId: "villa-a",
    game_visibility: true,
    game_visibility_role: "ignore",
    game_lod_level: 2,
    game_lod_role: "shadow_proxy"
  };

  registry.setLighting(createLighting(true));
  registry.registerBatch({ ownerId: "building", source: "sceneObject", meshes: [proxy] });

  const role = registry.getDiagnostics().buildingRoles[0];
  assert(role?.buildingId === "villa-a", "Expected building id in shadow role diagnostics.");
  assert(role?.lodRole === "shadow_proxy", "Expected shadow proxy role in diagnostics.");
  assert(role?.casterMeshes === 1, "Expected diagnostics to count the synchronized proxy caster.");

  registry.dispose();
  scene.dispose();
  engine.dispose();
}

function testSynchronizationRefreshesFrozenCsmCasterBounds(): void {
  if (!CascadedShadowGenerator.IsSupported) {
    return;
  }

  const engine = new NullEngine();
  const scene = new Scene(engine);
  const lightingController = new SceneLightingController(scene);
  const registry = new SceneShadowRegistry(lightingController);
  const caster = MeshBuilder.CreateBox("frozen-bounds-caster", { size: 2 }, scene);
  caster.position.x = 12;
  caster.computeWorldMatrix(true);

  registry.setLighting({
    ...createLighting(true),
    shadows: {
      ...createLighting(true).shadows!,
      generator: "cascaded",
      freezeShadowCastersBoundingInfo: true
    }
  });
  registry.registerBatch({ ownerId: "caster", source: "sceneObject", meshes: [caster] });

  const generator = lightingController.getRig()?.getShadowGenerator();
  if (!(generator instanceof CascadedShadowGenerator)) {
    throw new Error("Expected cascaded shadow generator.");
  }
  assert(
    generator.shadowCastersBoundingInfo.boundingBox.minimumWorld.x <= 11 &&
      generator.shadowCastersBoundingInfo.boundingBox.maximumWorld.x >= 13,
    "Expected frozen CSM bounds to include casters registered after lighting setup."
  );

  registry.dispose();
  scene.dispose();
  engine.dispose();
}

function run(): void {
  testRegistryRegistersCastersAndReceiversByPolicy();
  testRegistryClearsReceiversWhenShadowsDisabled();
  testDiagnosticsReportsBatchCasterAndReceiverCounts();
  testSynchronizationFollowsEnabledLodCaster();
  testSharedInstanceReceiverStateUsesAnyEligibleInstance();
  testDiagnosticsGroupsActualBuildingCastersByLodRole();
  testSynchronizationRefreshesFrozenCsmCasterBounds();
}

run();
console.log("SceneShadowRegistry tests passed");
