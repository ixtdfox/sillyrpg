import { MeshBuilder, NullEngine, Scene, StandardMaterial, type AbstractMesh } from "@babylonjs/core";
import { RuntimePerformanceSampler } from "../../../src/core/scene/in-game/performance/RuntimePerformanceSampler";

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

function testSamplerSplitsRenderedAllocatedAndHiddenTerrainGeometry(): void {
  const engine = new NullEngine();
  const scene = new Scene(engine);
  const activeVisibleMesh = MeshBuilder.CreateBox("active-visible-box", { size: 1 }, scene);
  const outsideActiveVisibleMesh = MeshBuilder.CreateBox("outside-active-visible-box", { size: 1 }, scene);
  const hiddenTerrain = MeshBuilder.CreateGround("terrain:generated:heightfield-surface", {
    width: 8,
    height: 8,
    subdivisions: 1
  }, scene);
  hiddenTerrain.visibility = 0;
  hiddenTerrain.isVisible = true;
  hiddenTerrain.isPickable = true;
  hiddenTerrain.metadata = {
    generatedTerrainDescriptor: { id: "generated", kind: "generated" },
    terrainSurfaceCanonical: true,
    terrainCanonicalMeshMode: "PICK_ONLY"
  };
  installActiveMeshes(scene, [activeVisibleMesh]);

  const sampler = new RuntimePerformanceSampler({
    engine,
    scene,
    locationManager: createLocationManagerStub(),
    gridRuntime: createGridRuntimeStub(),
    shadowRegistry: createShadowRegistryStub()
  });
  const snapshot = sampler.sample(0);
  const activeVisibleVertices = activeVisibleMesh.getTotalVertices();
  const activeVisibleTriangles = Math.floor(activeVisibleMesh.getTotalIndices() / 3);
  const outsideActiveVisibleVertices = outsideActiveVisibleMesh.getTotalVertices();
  const outsideActiveVisibleTriangles = Math.floor(outsideActiveVisibleMesh.getTotalIndices() / 3);
  const hiddenVertices = hiddenTerrain.getTotalVertices();
  const hiddenTriangles = Math.floor(hiddenTerrain.getTotalIndices() / 3);

  assert(snapshot.geometry.renderedVertexCount === activeVisibleVertices, "Rendered vertices should include active visible mesh only.");
  assert(snapshot.geometry.renderedTriangleCount === activeVisibleTriangles, "Rendered triangles should include active visible mesh only.");
  assert(snapshot.geometry.vertexCount === snapshot.geometry.renderedVertexCount, "Legacy geometry vertex count should report rendered vertices.");
  assert(snapshot.geometry.triangleCount === snapshot.geometry.renderedTriangleCount, "Legacy geometry triangle count should report rendered triangles.");
  assert(
    snapshot.geometry.allocatedVertexCount === activeVisibleVertices + outsideActiveVisibleVertices + hiddenVertices,
    "Allocated vertices should include active, inactive-by-frustum, and hidden terrain geometry."
  );
  assert(
    snapshot.geometry.allocatedTriangleCount === activeVisibleTriangles + outsideActiveVisibleTriangles + hiddenTriangles,
    "Allocated triangles should include active, inactive-by-frustum, and hidden terrain geometry."
  );
  assert(snapshot.geometry.hiddenPickOnlyTerrainVertexCount === hiddenVertices, "Hidden terrain vertices should be reported separately.");
  assert(snapshot.geometry.hiddenPickOnlyTerrainTriangleCount === hiddenTriangles, "Hidden terrain triangles should be reported separately.");
  assert(
    snapshot.geometry.buckets.some((bucket) =>
      bucket.bucket === "terrain_canonical_pick" &&
      bucket.allocatedTriangleCount === hiddenTriangles &&
      bucket.renderedTriangleCount === 0
    ),
    "Geometry buckets should attribute hidden pick-only terrain allocation."
  );

  scene.dispose();
  engine.dispose();
}

function installActiveMeshes(scene: Scene, meshes: readonly AbstractMesh[]): void {
  const sceneWithControlledActiveMeshes = scene as unknown as {
    getActiveMeshes: () => { readonly length: number; readonly data: readonly AbstractMesh[] };
  };
  sceneWithControlledActiveMeshes.getActiveMeshes = () => ({
    length: meshes.length,
    data: meshes
  });
}

function testSamplerClassifiesBucketsAndSkipsDisposedMeshes(): void {
  const engine = new NullEngine();
  const scene = new Scene(engine);
  const terrainPatch = MeshBuilder.CreateGround("terrain:demo:lod:node:0", { width: 4, height: 4 }, scene);
  terrainPatch.metadata = {
    terrainKind: "generated-lod-visual",
    terrainSurfaceCanonical: false
  };
  const building = MeshBuilder.CreateBox("building-shell", { size: 1 }, scene);
  building.metadata = {
    buildingVisibilityInstanceId: "building-a"
  };
  const disposed = MeshBuilder.CreateBox("disposed-box", { size: 1 }, scene);
  disposed.dispose(false, false);

  const sampler = new RuntimePerformanceSampler({
    engine,
    scene,
    locationManager: createLocationManagerStub(),
    gridRuntime: createGridRuntimeStub(),
    shadowRegistry: createShadowRegistryStub()
  });
  const snapshot = sampler.sample(0);
  const patchBucket = snapshot.geometry.buckets.find((bucket) => bucket.bucket === "terrain_lod_patch");
  const buildingBucket = snapshot.geometry.buckets.find((bucket) => bucket.bucket === "building");

  assert(patchBucket !== undefined, "Expected terrain LOD patch bucket.");
  assert(buildingBucket !== undefined, "Expected building bucket.");
  assert(
    snapshot.geometry.allocatedTriangleCount ===
      Math.floor(terrainPatch.getTotalIndices() / 3) + Math.floor(building.getTotalIndices() / 3),
    "Allocated triangles should not include disposed meshes."
  );

  scene.dispose();
  engine.dispose();
}

function testSamplerReportsDrawGroupsMaterialsPickabilityAndBuildingLod(): void {
  const engine = new NullEngine();
  const scene = new Scene(engine);
  const material = new StandardMaterial("shared-building-material", scene);
  const lod0 = MeshBuilder.CreateBox("LOD0_Full", { size: 1 }, scene);
  const lod0Instance = lod0.createInstance("LOD0_Full:instance");
  for (const mesh of [lod0, lod0Instance]) {
    mesh.material = material;
    mesh.metadata = {
      sceneObjectType: "building",
      buildingVisibilityInstanceId: "building-a",
      game_visibility: true,
      game_visibility_role: "wall_halo",
      game_lod_level: 0,
      game_lod_role: "full"
    };
  }
  installActiveMeshes(scene, [lod0, lod0Instance]);

  const sampler = new RuntimePerformanceSampler({
    engine,
    scene,
    locationManager: createLocationManagerStub(),
    gridRuntime: createGridRuntimeStub(),
    shadowRegistry: createShadowRegistryStub()
  });
  const snapshot = sampler.sample(0);

  assert(snapshot.scene.renderableMeshCount === 2, "Expected both geometry-bearing meshes to be renderable meshes.");
  assert(snapshot.scene.pickableMeshCount === 2, "Expected both enabled pickable meshes in diagnostics.");
  assert(snapshot.scene.thinInstanceBatchMeshCount === 0, "Expected ordinary instances not to count as thin-instance batches.");
  assert(snapshot.scene.thinInstanceCount === 0, "Expected no thin instances in the ordinary-instance test.");
  assert(snapshot.scene.uniqueEnabledRenderMaterialCount === 1, "Expected one shared enabled render material.");
  assert(snapshot.scene.buildingLod.lod0.total === 2, "Expected two LOD0 building meshes.");
  assert(snapshot.scene.buildingLod.lod0.active === 2, "Expected two active LOD0 building meshes.");
  assert(snapshot.geometry.approximateDrawGroupCount === 1, "Expected instances sharing geometry and material in one draw group.");
  assert(snapshot.geometry.drawGroups[0]?.instanceCount === 2, "Expected draw group to report two instances.");

  scene.dispose();
  engine.dispose();
}

function createLocationManagerStub() {
  return {
    getTerrainLodDiagnostics: () => ({
      controllerCount: 0,
      visibleLeafCount: 0,
      patchMeshEstimate: 0,
      activePatchMeshCount: 0,
      inactivePatchMeshCount: 0,
      totalPatchMeshCount: 0,
      cachedPatchMeshCount: 0,
      inactiveCachedPatchMeshCount: 0,
      activePatchVertices: 0,
      activePatchTriangles: 0,
      inactivePatchVertices: 0,
      inactivePatchTriangles: 0,
      totalPatchVertices: 0,
      totalPatchTriangles: 0,
      cachedPatchVertices: 0,
      cachedPatchTriangles: 0,
      patchesBuiltLastUpdate: 0,
      patchesReusedLastUpdate: 0,
      patchesDisabledLastUpdate: 0,
      patchesDisposedLastUpdate: 0,
      patchCacheEnabled: false,
      activeDebugLineMeshCount: 0,
      approxVisibleTriangles: 0,
      sourceResolutionXMax: null,
      sourceResolutionZMax: null,
      sourceQuadCount: 0,
      canonicalMeshMode: "OFF",
      canonicalMeshVertexCount: 0,
      canonicalMeshTriangleCount: 0,
      hiddenPickOnlyTerrainVertexCount: 0,
      hiddenPickOnlyTerrainTriangleCount: 0,
      frustumCullingEnabled: false,
      frustumTestedNodeCount: 0,
      frustumRejectedNodeCount: 0,
      frustumAcceptedNodeCount: 0,
      frustumKeptByNearAnchorCount: 0,
      maxDepth: 0,
      anchorSource: null,
      depthCounts: new Map<number, number>(),
      sampleStepCounts: new Map<number, number>(),
      buildSampleStepCounts: new Map<number, number>(),
      approxTrianglesBySampleStep: new Map<number, number>(),
      approxTrianglesByBuildSampleStep: new Map<number, number>(),
      seamAdjustedPatchCount: 0,
      maxNeighborSampleStepRatio: null,
      minLeafWorldSize: null,
      maxLeafWorldSize: null,
      minNearLeafWorldSize: null,
      maxNearLeafWorldSize: null,
      minDistanceToAnchor: null,
      maxDistanceToAnchor: null,
      sourceQuadSizeMin: null,
      sourceQuadSizeMax: null,
      desiredNearPatchWorldSizeMin: null,
      desiredNearPatchWorldSizeMax: null,
      debugMode: "off"
    }),
    getDistrictRuntimeDiagnostics: () => ({
      loadedChunkCount: 0,
      activeMeshCount: 0,
      activeRenderableMeshCount: 0,
      activeTerrainMeshCount: 0,
      activeSceneObjectMeshCount: 0,
      terrainLodControllerCount: 0,
      skeletonCount: 0,
      animationGroupCount: 0,
      particleSystemCount: 0
    }),
    getTerrainLodDebugEnabled: () => false
  } as unknown as ConstructorParameters<typeof RuntimePerformanceSampler>[0]["locationManager"];
}

function createGridRuntimeStub() {
  return {
    getIsDebugEnabled: () => false
  } as ConstructorParameters<typeof RuntimePerformanceSampler>[0]["gridRuntime"];
}

function createShadowRegistryStub() {
  return {
    getDiagnostics: () => ({
      enabled: false,
      generatorKind: "none",
      hasGenerator: false,
      casterCount: 0,
      receiverCount: 0,
      buildingRoles: [],
      batches: []
    })
  } as unknown as ConstructorParameters<typeof RuntimePerformanceSampler>[0]["shadowRegistry"];
}

function run(): void {
  testSamplerSplitsRenderedAllocatedAndHiddenTerrainGeometry();
  testSamplerClassifiesBucketsAndSkipsDisposedMeshes();
  testSamplerReportsDrawGroupsMaterialsPickabilityAndBuildingLod();
}

run();
console.log("RuntimePerformanceSampler tests passed");
