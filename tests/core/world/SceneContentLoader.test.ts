import { MeshBuilder, NullEngine, Scene, TransformNode, Vector3 } from "@babylonjs/core";
import { adoptImportedSceneNodes, importSceneTerrainContent } from "../../../src/core/world/scene/SceneContentLoader";

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
  await testGeneratedTerrainWithBakedHeightMapImportsInCoreRuntime();
  await testGeneratedTerrainWithoutBakedHeightMapIsRejectedByCoreRuntimeImport();
}

async function testGeneratedTerrainWithBakedHeightMapImportsInCoreRuntime(): Promise<void> {
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
    },
    editedHeightMap: {
      encoding: "array" as const,
      resolution: [5, 5] as const,
      heights: Array.from({ length: 25 }, (_, index) => (index === 12 ? 3 : 0))
    }
  };
  const content = await importSceneTerrainContent(scene, descriptor, parent, "test", {
    generatedTerrainLodEnabled: false
  });
  const mesh = content.renderableMeshes[0];

  assert(content.heightField !== undefined, "Runtime generated terrain should deserialize baked heightfield.");
  assert(content.terrainLodControllers.length === 0, "Test import disables LOD controllers explicitly.");
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

Promise.resolve(run()).then(() => {
  console.log("SceneContentLoader tests passed");
});
