import { MeshBuilder, NullEngine, Scene, TransformNode, Vector3 } from "@babylonjs/core";
import { adoptImportedSceneNodes, importSceneTerrainContent } from "../../../src/core/world/scene/SceneContentLoader";
import { TerrainGeneratorPresetCatalog } from "../../../src/core/world/terrain/TerrainGeneratorPresets";
const terrainPresetCatalog = new TerrainGeneratorPresetCatalog();

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

function assertVectorClose(actual: Vector3, expected: Vector3, message: string): void {
  const epsilon = 1e-6;
  assert(Math.abs(actual.x - expected.x) < epsilon, `${message} (x) expected ${expected.x} got ${actual.x}`);
  assert(Math.abs(actual.y - expected.y) < epsilon, `${message} (y) expected ${expected.y} got ${actual.y}`);
  assert(Math.abs(actual.z - expected.z) < epsilon, `${message} (z) expected ${expected.z} got ${actual.z}`);
}

function testAdoptImportedSceneNodesPreservesLocalImportedTransforms(): void {
  const engine = new NullEngine();
  const scene = new Scene(engine);

  const objectRoot = new TransformNode("object-root", scene);
  objectRoot.position = new Vector3(19, 0, -30);
  objectRoot.rotation = new Vector3(0, Math.PI / 2, 0);

  const importedRoot = new TransformNode("imported-root", scene);
  importedRoot.position = Vector3.Zero();

  const childMesh = MeshBuilder.CreateBox("imported-mesh", { size: 1 }, scene);
  childMesh.parent = importedRoot;
  childMesh.position = new Vector3(2, 0, 0);

  adoptImportedSceneNodes(objectRoot, [importedRoot], [childMesh]);

  objectRoot.computeWorldMatrix(true);
  importedRoot.computeWorldMatrix(true);
  childMesh.computeWorldMatrix(true);

  assert(importedRoot.parent === objectRoot, "Expected imported root to be parented under object root");
  assertVectorClose(importedRoot.position, Vector3.Zero(), "Imported root local position should stay local to object root");
  assertVectorClose(importedRoot.getAbsolutePosition(), objectRoot.getAbsolutePosition(), "Imported root world position should follow object root");
  assertVectorClose(
    childMesh.getAbsolutePosition(),
    new Vector3(19, 0, -32),
    "Child mesh world position should inherit object root transform instead of collapsing back to import origin"
  );

  scene.dispose();
  engine.dispose();
}

async function run(): Promise<void> {
  testAdoptImportedSceneNodesPreservesLocalImportedTransforms();
  await testGeneratedTerrainContentCreatesPickableMesh();
  await testGeneratedTerrainRuntimeDefaultCreatesLodController();
  await testGeneratedTerrainRuntimeLodKeepsCanonicalSurfaceSeparate();
  await testGeneratedTerrainRuntimeLodDisabledUsesOnlyCanonicalSurface();
  await testGeneratedTerrainContentUsesEditedHeightMap();
}

async function testGeneratedTerrainContentCreatesPickableMesh(): Promise<void> {
  const engine = new NullEngine();
  const scene = new Scene(engine);
  const parent = new TransformNode("parent", scene);
  const descriptor = terrainPresetCatalog.createDescriptor({ presetId: "urban-pad", seed: 55 });
  const result = await importSceneTerrainContent(scene, descriptor, parent, "test");
  assert(result.renderableMeshes.length === 1, "Generated terrain should create one renderable mesh.");
  const mesh = result.renderableMeshes[0];
  assert(mesh?.isPickable === true, "Generated terrain mesh should be pickable.");
  assert(mesh?.metadata?.editorTerrain === true, "Generated terrain mesh should carry editorTerrain metadata.");
  assert(result.terrainLodControllers.length === 0, "Editor/default generated terrain import should not create LOD controllers.");
  scene.dispose();
  engine.dispose();
}

async function testGeneratedTerrainRuntimeDefaultCreatesLodController(): Promise<void> {
  const engine = new NullEngine();
  const scene = new Scene(engine);
  const parent = new TransformNode("parent", scene);
  const descriptor = terrainPresetCatalog.createDescriptor({ presetId: "urban-pad", seed: 55, resolution: [65, 65] });
  const result = await importSceneTerrainContent(scene, descriptor, parent, "test", {
    generatedTerrainVisualMode: "runtime"
  });

  assert(result.renderableMeshes.length === 1, "Runtime default generated terrain should still expose canonical renderable mesh before update.");
  assert(result.terrainSurfaceMeshes.length === 1, "Runtime default terrain surfaces should contain only canonical mesh.");
  assert(result.terrainLodControllers.length === 1, "Runtime default generated terrain should create a terrain LOD controller.");

  scene.dispose();
  engine.dispose();
}

async function testGeneratedTerrainRuntimeLodKeepsCanonicalSurfaceSeparate(): Promise<void> {
  const engine = new NullEngine();
  const scene = new Scene(engine);
  const parent = new TransformNode("parent", scene);
  const descriptor = {
    ...terrainPresetCatalog.createDescriptor({ presetId: "urban-pad", seed: 55, resolution: [65, 65] }),
    lod: {
      enabled: true,
      strategy: "quadtree" as const,
      maxDepth: 2,
      targetPatchQuads: 16,
      nearFullResolutionRadius: 20,
      lodRings: [
        { distance: 20, maxSampleStep: 1 },
        { distance: 40, maxSampleStep: 2 }
      ],
      updateIntervalSeconds: 0.05,
      skirtDepth: 1
    }
  };
  const result = await importSceneTerrainContent(scene, descriptor, parent, "test", {
    generatedTerrainVisualMode: "runtime"
  });

  assert(result.renderableMeshes.length === 1, "Runtime LOD import should initially expose only the canonical mesh.");
  assert(result.terrainSurfaceMeshes.length === 1, "Runtime LOD terrain surfaces should contain the canonical mesh.");
  assert(result.terrainLodControllers.length === 1, "Runtime LOD import should create a terrain LOD controller.");

  const canonicalMesh = result.terrainSurfaceMeshes[0];
  assert(canonicalMesh?.isPickable === true, "Canonical generated terrain should remain pickable.");
  assert(canonicalMesh?.metadata?.terrainSurfaceCanonical === true, "Canonical terrain should be explicitly marked.");

  result.terrainLodControllers[0]?.update(1, {
    position: new Vector3(0, 0, 0),
    source: "player"
  });

  const visualMeshes = scene.meshes.filter((mesh) => mesh.metadata?.terrainVisualOnly === true);
  assert(visualMeshes.length > 0, "Runtime LOD update should create visual-only patch meshes.");
  assert(visualMeshes.every((mesh) => mesh.isPickable === false), "Visual LOD patch meshes must not be pickable.");
  assert(
    visualMeshes.every((mesh) => mesh.metadata?.generatedTerrainHeightField === undefined),
    "Visual LOD patch meshes must not carry terrain surface heightfield metadata."
  );

  scene.dispose();
  engine.dispose();
}

async function testGeneratedTerrainRuntimeLodDisabledUsesOnlyCanonicalSurface(): Promise<void> {
  const engine = new NullEngine();
  const scene = new Scene(engine);
  const parent = new TransformNode("parent", scene);
  const descriptor = {
    ...terrainPresetCatalog.createDescriptor({ presetId: "urban-pad", seed: 55, resolution: [65, 65] }),
    lod: {
      enabled: false
    }
  };
  const result = await importSceneTerrainContent(scene, descriptor, parent, "test", {
    generatedTerrainVisualMode: "runtime"
  });

  assert(result.renderableMeshes.length === 1, "Runtime LOD-disabled generated terrain should create one renderable mesh.");
  assert(result.terrainSurfaceMeshes.length === 1, "LOD-disabled terrain surfaces should contain the canonical mesh.");
  assert(result.terrainLodControllers.length === 0, "LOD-disabled generated terrain should not create a controller.");

  scene.dispose();
  engine.dispose();
}

async function testGeneratedTerrainContentUsesEditedHeightMap(): Promise<void> {
  const engine = new NullEngine();
  const scene = new Scene(engine);
  const parent = new TransformNode("parent", scene);
  const descriptor = {
    ...terrainPresetCatalog.createDescriptor({ presetId: "urban-pad", seed: 55, size: [8, 8], resolution: [9, 9] }),
    editedHeightMap: {
      encoding: "array" as const,
      resolution: [9, 9] as const,
      heights: Array.from({ length: 81 }, (_, index) => (index === 40 ? 5 : 0))
    }
  };
  const result = await importSceneTerrainContent(scene, descriptor, parent, "test");
  const mesh = result.renderableMeshes[0];
  const bounds = mesh?.getBoundingInfo().boundingBox;
  assert((bounds?.maximumWorld.y ?? 0) >= 5, "Edited heightmap should affect generated terrain mesh height.");
  scene.dispose();
  engine.dispose();
}

Promise.resolve(run()).then(() => {
  console.log("SceneContentLoader tests passed");
});
