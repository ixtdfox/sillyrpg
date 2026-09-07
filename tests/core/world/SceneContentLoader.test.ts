import {
  AssetContainer,
  MeshBuilder,
  NullEngine,
  PBRMaterial,
  Scene,
  TransformNode,
  Vector3
} from "@babylonjs/core";
import {
  adoptImportedSceneNodes,
  disposeImportedSceneMesh,
  importSceneContent,
  importSceneTerrainContent,
  instantiateCachedSceneAsset
} from "../../../src/core/world/scene/SceneContentLoader";
import { RuntimeSceneObjectPreparer } from "../../../src/core/world/scene/RuntimeSceneObjectPreparer";
import {
  parseSceneDescriptor,
  type SceneDescriptor,
  type SceneObjectDescriptor
} from "../../../src/core/world/scene/SceneDescriptor";

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

function testCachedInstancesDoNotDisposeSharedMaterials(): void {
  const engine = new NullEngine();
  const scene = new Scene(engine);
  const container = new AssetContainer(scene);
  const source = MeshBuilder.CreateBox("cached-source", { size: 1 }, scene);
  const material = new PBRMaterial("cached-material", scene);
  source.material = material;
  container.meshes.push(source);
  container.materials.push(material);
  container.removeAllFromScene();

  const first = instantiateCachedSceneAsset(container, new TransformNode("first-parent", scene));
  const second = instantiateCachedSceneAsset(container, new TransformNode("second-parent", scene));
  const firstMesh = first.meshes[0];
  const secondMesh = second.meshes[0];

  assert(firstMesh !== undefined && secondMesh !== undefined, "Expected two cached mesh instances.");
  assert(firstMesh.material === material && secondMesh.material === material, "Expected cached instances to share their source material.");
  disposeImportedSceneMesh(firstMesh);
  assert(scene.materials.includes(material), "Disposing one cached instance must preserve its container-owned material.");
  assert(secondMesh.material === material, "The surviving cached instance must retain the shared material.");

  scene.dispose();
  engine.dispose();
}

function testUncachedMeshesDisposeOwnedMaterials(): void {
  const engine = new NullEngine();
  const scene = new Scene(engine);
  const mesh = MeshBuilder.CreateBox("uncached-mesh", { size: 1 }, scene);
  const material = new PBRMaterial("uncached-material", scene);
  mesh.material = material;

  disposeImportedSceneMesh(mesh);

  assert(!scene.materials.includes(material), "Disposing an uncached mesh must release its owned material.");

  scene.dispose();
  engine.dispose();
}

function testSceneDescriptorPreservesInteriorBuildingOwnership(): void {
  const descriptor = parseSceneDescriptor({
    schemaVersion: 2,
    id: "owned-interior-scene",
    objects: [{
      id: "interior-chair-001",
      type: "interior",
      asset: "assets/models/interior/Chair/Chair_1.glb",
      interiorBuildingId: "building-villa-001",
      position: [1, 0, 1],
      rotation: [0, 0, 0],
      scale: [0.5, 0.5, 0.5]
    }]
  }, "Owned interior scene");

  assert(
    descriptor.objects[0]?.interiorBuildingId === "building-villa-001",
    "Expected parsed interior descriptor to preserve its building owner."
  );
}

function testRuntimeBuildingPreparationKeepsNavigationPickableAndFreezesStaticTransforms(): void {
  const engine = new NullEngine();
  const scene = new Scene(engine);
  const root = new TransformNode("building-root", scene);
  root.position.x = 5;
  const floor = MeshBuilder.CreateBox("Story0_Floor", { size: 1 }, scene);
  const stair = MeshBuilder.CreateBox("Stair_Story0_to_Story1", { size: 1 }, scene);
  const wall = MeshBuilder.CreateBox("Story0_OuterWall", { size: 1 }, scene);
  const railing = MeshBuilder.CreateBox("Story0_Terrace_Railing", { size: 1 }, scene);
  for (const mesh of [floor, stair, wall, railing]) {
    mesh.parent = root;
    mesh.isPickable = true;
    mesh.metadata = {
      sceneObjectType: "building",
      buildingVisibilityInstanceId: "building-a"
    };
  }
  stair.metadata = {
    ...(stair.metadata as Record<string, unknown>),
    game_part: "stair",
    stair_kind: "internal"
  };
  railing.metadata = {
    ...(railing.metadata as Record<string, unknown>),
    part: "floor"
  };

  const descriptor: SceneObjectDescriptor = {
    id: "building-a",
    type: "building",
    asset: "/assets/models/buildings/test.glb",
    position: [0, 0, 0],
    rotation: [0, 0, 0],
    scale: [1, 1, 1]
  };
  const content = {
    objectId: descriptor.id,
    type: descriptor.type,
    root,
    descriptor,
    cullingBounds: null,
    meshes: [floor, stair, wall, railing],
    renderableMeshes: [floor, stair, wall, railing],
    helperMeshes: [],
    transformNodes: [],
    skeletons: [],
    animationGroups: [],
    particleSystems: []
  };

  const result = new RuntimeSceneObjectPreparer().prepare(content);

  assert(result.prepared, "Expected building content to be prepared for runtime.");
  assert(floor.isPickable, "Expected floor navigation surface to remain pickable.");
  assert(stair.isPickable, "Expected stair navigation surface to remain pickable.");
  assert(!wall.isPickable, "Expected non-navigation wall geometry not to remain pickable.");
  assert(!railing.isPickable, "Expected terrace railings not to remain pickable through legacy story metadata.");
  assert(root.isWorldMatrixFrozen, "Expected static building root world matrix to be frozen.");
  assert(floor.isWorldMatrixFrozen && stair.isWorldMatrixFrozen && wall.isWorldMatrixFrozen && railing.isWorldMatrixFrozen, "Expected static building meshes to be frozen.");

  scene.dispose();
  engine.dispose();
}

function testRuntimePreparationDoesNotChangeEditorStyleNonBuildingContent(): void {
  const engine = new NullEngine();
  const scene = new Scene(engine);
  const root = new TransformNode("connected-root", scene);
  const mesh = MeshBuilder.CreateBox("connected-mesh", { size: 1 }, scene);
  mesh.parent = root;
  mesh.isPickable = true;
  const descriptor: SceneObjectDescriptor = {
    id: "connected-a",
    type: "connected-object",
    asset: "/assets/models/roads/road_straight.glb",
    position: [0, 0, 0],
    rotation: [0, 0, 0],
    scale: [1, 1, 1]
  };
  const content = {
    objectId: descriptor.id,
    type: descriptor.type,
    root,
    descriptor,
    cullingBounds: null,
    meshes: [mesh],
    renderableMeshes: [mesh],
    helperMeshes: [],
    transformNodes: [],
    skeletons: [],
    animationGroups: [],
    particleSystems: []
  };

  const result = new RuntimeSceneObjectPreparer().prepare(content);

  assert(!result.prepared, "Expected non-building content to stay on its existing import path.");
  assert(mesh.isPickable, "Expected non-building pickability to remain unchanged.");
  assert(!mesh.isWorldMatrixFrozen, "Expected non-building transforms not to be frozen by building preparation.");

  scene.dispose();
  engine.dispose();
}

function testRuntimePreparationFreezesStaticStreetPropsWithoutChangingPicking(): void {
  const engine = new NullEngine();
  const scene = new Scene(engine);
  const root = new TransformNode("street-root", scene);
  const mesh = MeshBuilder.CreateBox("street-prop", { size: 1 }, scene);
  mesh.parent = root;
  mesh.isPickable = true;
  const descriptor: SceneObjectDescriptor = {
    id: "street-prop-a",
    type: "street",
    asset: "/assets/models/street/Bench/model.glb",
    position: [0, 0, 0],
    rotation: [0, 0, 0],
    scale: [1, 1, 1]
  };
  const content = {
    objectId: descriptor.id,
    type: descriptor.type,
    root,
    descriptor,
    cullingBounds: null,
    meshes: [mesh],
    renderableMeshes: [mesh],
    helperMeshes: [],
    transformNodes: [],
    skeletons: [],
    animationGroups: [],
    particleSystems: []
  };

  const result = new RuntimeSceneObjectPreparer().prepare(content);

  assert(result.prepared && result.frozenNodeCount === 2, "Expected a static street prop to be prepared for broad-phase culling.");
  assert(root.isWorldMatrixFrozen && mesh.isWorldMatrixFrozen, "Expected static street transforms to be frozen.");
  assert(mesh.isPickable, "Expected street prop picking to remain available.");

  scene.dispose();
  engine.dispose();
}

function testRuntimePreparationDoesNotFreezeInteractiveBuildingTransforms(): void {
  const engine = new NullEngine();
  const scene = new Scene(engine);
  const root = new TransformNode("interactive-building-root", scene);
  const door = MeshBuilder.CreateBox("Story0_Door", { size: 1 }, scene);
  door.parent = root;
  door.metadata = { game_interactable: true };
  const descriptor: SceneObjectDescriptor = {
    id: "interactive-building",
    type: "building",
    asset: "/assets/models/buildings/interactive.glb",
    position: [0, 0, 0],
    rotation: [0, 0, 0],
    scale: [1, 1, 1]
  };
  const content = {
    objectId: descriptor.id,
    type: descriptor.type,
    root,
    descriptor,
    cullingBounds: null,
    meshes: [door],
    renderableMeshes: [door],
    helperMeshes: [],
    transformNodes: [],
    skeletons: [],
    animationGroups: [],
    particleSystems: []
  };

  const result = new RuntimeSceneObjectPreparer().prepare(content);

  assert(result.prepared && result.frozenNodeCount === 0, "Expected interactive building content to stay transformable.");
  assert(door.isPickable, "Expected interactive building geometry to remain pickable.");
  assert(!root.isWorldMatrixFrozen && !door.isWorldMatrixFrozen, "Expected interactive building transforms not to be frozen.");

  scene.dispose();
  engine.dispose();
}

async function testSceneContentReportsMonotonicLoadingProgress(): Promise<void> {
  const engine = new NullEngine();
  const scene = new Scene(engine);
  const root = new TransformNode("scene-root", scene);
  const descriptor: SceneDescriptor = {
    schemaVersion: 2,
    id: "progress-scene",
    terrain: {
      id: "progress-terrain",
      kind: "plane",
      size: [16, 16]
    },
    objects: []
  };
  const reports: Array<{ progress: number; message: string }> = [];

  await importSceneContent({
    scene,
    sceneId: descriptor.id,
    root,
    rootNamePrefix: "progress-test",
    descriptor,
    onProgress: (report) => reports.push(report)
  });

  assert(reports[0]?.progress === 0, "Expected scene progress to start at zero.");
  assert(reports.at(-1)?.progress === 1, "Expected scene progress to finish at one.");
  assert(reports.some((report) => report.message === "Preparing terrain"), "Expected terrain loading stage to be reported.");
  assert(
    reports.every((report, index) => index === 0 || report.progress >= reports[index - 1]!.progress),
    "Expected scene loading progress to remain monotonic."
  );

  scene.dispose();
  engine.dispose();
}

async function testSceneContentDefersInteriorObjectsWithoutImportingTheirAssets(): Promise<void> {
  const engine = new NullEngine();
  const scene = new Scene(engine);
  const root = new TransformNode("scene-root", scene);
  const interiorObject: SceneObjectDescriptor = {
    id: "interior-chair-001",
    type: "interior",
    asset: "/assets/models/interior/Chair/Chair_1.glb",
    position: [1, 0, 1],
    rotation: [0, 0, 0],
    scale: [1, 1, 1]
  };
  const descriptor: SceneDescriptor = {
    schemaVersion: 2,
    id: "deferred-interior-scene",
    terrain: null,
    objects: [interiorObject]
  };

  const content = await importSceneContent({
    scene,
    sceneId: descriptor.id,
    root,
    rootNamePrefix: "deferred-test",
    descriptor,
    shouldDeferSceneObject: (object) => object.type === "interior"
  });

  assert(content.sceneObjects.length === 0, "Expected deferred interiors to stay out of the initial imported scene.");
  assert(content.deferredSceneObjects.length === 1, "Expected the interior descriptor to be retained for streaming.");
  assert(content.deferredSceneObjects[0]?.id === interiorObject.id, "Expected the original interior descriptor to be deferred.");

  scene.dispose();
  engine.dispose();
}

async function run(): Promise<void> {
  testAdoptImportedSceneNodesPreservesLocalImportedTransforms();
  testCachedInstancesDoNotDisposeSharedMaterials();
  testUncachedMeshesDisposeOwnedMaterials();
  testSceneDescriptorPreservesInteriorBuildingOwnership();
  testRuntimeBuildingPreparationKeepsNavigationPickableAndFreezesStaticTransforms();
  testRuntimePreparationDoesNotChangeEditorStyleNonBuildingContent();
  testRuntimePreparationFreezesStaticStreetPropsWithoutChangingPicking();
  testRuntimePreparationDoesNotFreezeInteractiveBuildingTransforms();
  await testSceneContentReportsMonotonicLoadingProgress();
  await testSceneContentDefersInteriorObjectsWithoutImportingTheirAssets();
  await testGeneratedTerrainWithLodUsesPickSurfaceInsteadOfFullCanonicalMesh();
  await testGeneratedTerrainWithBakedHeightMapImportsInCoreRuntime();
  await testGeneratedTerrainWithoutBakedHeightMapIsRejectedByCoreRuntimeImport();
}

async function testGeneratedTerrainWithLodUsesPickSurfaceInsteadOfFullCanonicalMesh(): Promise<void> {
  const engine = new NullEngine();
  const scene = new Scene(engine);
  const parent = new TransformNode("parent", scene);
  const descriptor = createGeneratedTerrainDescriptor();
  const content = await importSceneTerrainContent(scene, descriptor, parent, "test", {
    generatedTerrainLodEnabled: true
  });
  const surfaceMesh = content.terrainSurfaceMeshes[0];

  assert(content.heightField !== undefined, "Runtime generated terrain should deserialize baked heightfield.");
  assert(content.terrainLodControllers.length === 1, "LOD-enabled generated terrain should create a LOD controller.");
  assert(content.renderableMeshes.length === 0, "LOD-enabled runtime terrain should not expose a full canonical render mesh.");
  assert(surfaceMesh !== undefined, "LOD-enabled runtime terrain should expose a lightweight terrain surface.");
  assert(surfaceMesh.getTotalVertices() < descriptor.resolution[0] * descriptor.resolution[1], "Runtime pick surface should be cheaper than the source heightfield.");
  assert(surfaceMesh.metadata?.generatedTerrainHeightField === content.heightField, "Runtime pick surface should expose heightfield metadata.");
  assert(surfaceMesh.metadata?.terrainCanonicalMeshMode === "PICK_ONLY", "LOD runtime surface should be marked as pick-only canonical terrain.");
  assert(surfaceMesh.visibility === 0, "LOD runtime pick surface should not render as visible terrain.");
  assert(
    !scene.meshes.some((mesh) => mesh.name === `terrain:${descriptor.id}` && mesh.getTotalVertices() === descriptor.resolution[0] * descriptor.resolution[1]),
    "LOD-enabled runtime import should not allocate the full canonical terrain mesh."
  );

  scene.dispose();
  engine.dispose();
}

async function testGeneratedTerrainWithBakedHeightMapImportsInCoreRuntime(): Promise<void> {
  const engine = new NullEngine();
  const scene = new Scene(engine);
  const parent = new TransformNode("parent", scene);
  const descriptor = createGeneratedTerrainDescriptor();
  const content = await importSceneTerrainContent(scene, descriptor, parent, "test", {
    generatedTerrainLodEnabled: false
  });
  const mesh = content.renderableMeshes[0];

  assert(content.heightField !== undefined, "Runtime generated terrain should deserialize baked heightfield.");
  assert(content.terrainLodControllers.length === 0, "Test import disables LOD controllers explicitly.");
  assert(mesh?.getTotalVertices() === descriptor.resolution[0] * descriptor.resolution[1], "LOD-disabled runtime import should build the canonical terrain mesh.");
  assert(mesh?.metadata?.generatedTerrainHeightField === content.heightField, "Runtime terrain mesh should expose heightfield metadata.");
  assert((mesh?.getBoundingInfo().boundingBox.maximumWorld.y ?? 0) >= 3, "Baked heightmap should affect runtime terrain mesh height.");
  scene.dispose();
  engine.dispose();
}

async function testGeneratedTerrainWithoutBakedHeightMapIsRejectedByCoreRuntimeImport(): Promise<void> {
  const engine = new NullEngine();
  const scene = new Scene(engine);
  const parent = new TransformNode("parent", scene);
  const descriptor = {
    id: "terrain-generated",
    kind: "generated" as const,
    size: [16, 16] as const,
    resolution: [5, 5] as const,
    generator: {
      preset: "urban-pad",
      seed: 55,
      height: {
        base: 0,
        amplitude: 0,
        frequency: 1,
        octaves: 1,
        persistence: 0,
        lacunarity: 2
      }
    }
  };
  let threw = false;
  try {
    await importSceneTerrainContent(scene, descriptor, parent, "test");
  } catch (error) {
    threw = error instanceof Error && error.message.includes("no editedHeightMap");
  }

  assert(threw, "Core runtime importer must reject generated terrain without baked heightmap.");
  scene.dispose();
  engine.dispose();
}

function createGeneratedTerrainDescriptor() {
  return {
    id: "terrain-generated",
    kind: "generated" as const,
    size: [16, 16] as const,
    resolution: [5, 5] as const,
    generator: {
      preset: "urban-pad",
      seed: 55,
      height: {
        base: 0,
        amplitude: 0,
        frequency: 1,
        octaves: 1,
        persistence: 0,
        lacunarity: 2
      }
    },
    editedHeightMap: {
      encoding: "array" as const,
      resolution: [5, 5] as const,
      heights: Array.from({ length: 25 }, (_, index) => (index === 12 ? 3 : 0))
    },
    lod: {
      enabled: true,
      maxDepth: 2,
      nearPatchWorldSize: 8,
      targetPatchQuads: 4,
      updateIntervalSeconds: 0,
      updateMovementThreshold: 0
    }
  };
}

Promise.resolve(run()).then(() => {
  console.log("SceneContentLoader tests passed");
});
