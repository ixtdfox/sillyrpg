import { MeshBuilder, NullEngine, Scene } from "@babylonjs/core";
import { RuntimePerformanceSampler } from "../../../src/core/scene/in-game/performance/RuntimePerformanceSampler";

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

function testSamplerSplitsRenderedAllocatedAndHiddenTerrainGeometry(): void {
  const engine = new NullEngine();
  const scene = new Scene(engine);
  const visibleMesh = MeshBuilder.CreateBox("visible-box", { size: 1 }, scene);
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

  const sampler = new RuntimePerformanceSampler({
    engine,
    scene,
    locationManager: createLocationManagerStub(),
    gridRuntime: createGridRuntimeStub(),
    shadowRegistry: createShadowRegistryStub()
  });
  const snapshot = sampler.sample(0);
  const visibleVertices = visibleMesh.getTotalVertices();
  const visibleTriangles = Math.floor(visibleMesh.getTotalIndices() / 3);
  const hiddenVertices = hiddenTerrain.getTotalVertices();
  const hiddenTriangles = Math.floor(hiddenTerrain.getTotalIndices() / 3);

  assert(snapshot.geometry.renderedVertexCount === visibleVertices, "Rendered vertices should exclude hidden pick-only terrain.");
  assert(snapshot.geometry.renderedTriangleCount === visibleTriangles, "Rendered triangles should exclude hidden pick-only terrain.");
  assert(snapshot.geometry.vertexCount === snapshot.geometry.renderedVertexCount, "Legacy geometry vertex count should report rendered vertices.");
  assert(snapshot.geometry.triangleCount === snapshot.geometry.renderedTriangleCount, "Legacy geometry triangle count should report rendered triangles.");
  assert(snapshot.geometry.allocatedVertexCount === visibleVertices + hiddenVertices, "Allocated vertices should include hidden terrain geometry.");
  assert(snapshot.geometry.allocatedTriangleCount === visibleTriangles + hiddenTriangles, "Allocated triangles should include hidden terrain geometry.");
  assert(snapshot.geometry.hiddenPickOnlyTerrainVertexCount === hiddenVertices, "Hidden terrain vertices should be reported separately.");
  assert(snapshot.geometry.hiddenPickOnlyTerrainTriangleCount === hiddenTriangles, "Hidden terrain triangles should be reported separately.");

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
      cachedPatchMeshCount: 0,
      inactiveCachedPatchMeshCount: 0,
      activePatchVertices: 0,
      activePatchTriangles: 0,
      cachedPatchVertices: 0,
      cachedPatchTriangles: 0,
      activeDebugLineMeshCount: 0,
      approxVisibleTriangles: 0,
      sourceResolutionXMax: null,
      sourceResolutionZMax: null,
      sourceQuadCount: 0,
      canonicalMeshMode: "OFF",
      canonicalMeshVertexCount: 0,
      canonicalMeshTriangleCount: 0,
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
      batches: []
    })
  } as unknown as ConstructorParameters<typeof RuntimePerformanceSampler>[0]["shadowRegistry"];
}

function run(): void {
  testSamplerSplitsRenderedAllocatedAndHiddenTerrainGeometry();
}

run();
console.log("RuntimePerformanceSampler tests passed");
