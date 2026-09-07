import { Matrix, Mesh, MeshBuilder, NullEngine, Scene, StandardMaterial, TransformNode, Vector3 } from "@babylonjs/core";
import { ConnectedObjectInstanceBatcher } from "../../../src/core/world/scene/ConnectedObjectInstanceBatcher";
import type { ImportedSceneObjectContent } from "../../../src/core/world/scene/SceneContentLoader";
import type { SceneObjectDescriptor } from "../../../src/core/world/scene/SceneDescriptor";

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

function assertMatrixClose(actual: Matrix, expected: Matrix, message: string): void {
  const actualValues = actual.asArray();
  const expectedValues = expected.asArray();
  const matches = actualValues.every((value, index) => Math.abs(value - expectedValues[index]!) < 1e-5);
  assert(matches, message);
}

function createRoadObject(
  scene: Scene,
  parent: TransformNode,
  source: Mesh,
  id: string,
  x: number
): ImportedSceneObjectContent {
  const root = new TransformNode(`${id}:root`, scene);
  root.parent = parent;
  root.position.x = x;
  const helper = new Mesh(`${id}:helper`, scene);
  helper.parent = root;
  const instance = source.createInstance(`${id}:instance`);
  instance.parent = helper;
  instance.material = source.material;
  const descriptor: SceneObjectDescriptor = {
    id,
    type: "connected-object",
    asset: "assets/models/connected/road_straight.glb",
    position: [x, 0, 0],
    rotation: [0, 0, 0],
    scale: [1, 1, 1],
    connected: { groupId: "road", presetId: "asphalt-road" }
  };
  return {
    objectId: id,
    type: descriptor.type,
    root,
    descriptor,
    cullingBounds: null,
    meshes: [helper, instance],
    renderableMeshes: [instance],
    helperMeshes: [helper],
    transformNodes: [],
    skeletons: [],
    animationGroups: [],
    particleSystems: []
  };
}

function testBatchesSafeRoadInstancesAndKeepsLogicalObjects(): void {
  const engine = new NullEngine();
  const scene = new Scene(engine);
  const districtRoot = new TransformNode("district-root", scene);
  districtRoot.position = new Vector3(50, 2, -20);
  districtRoot.rotation.y = Math.PI / 4;
  districtRoot.scaling = new Vector3(1.25, 1, 1.25);
  const source = MeshBuilder.CreateBox("road-source", { width: 10, height: 0.1, depth: 10 }, scene);
  source.material = new StandardMaterial("road-material", scene);
  source.setEnabled(false);
  const first = createRoadObject(scene, districtRoot, source, "road-a", 0);
  const second = createRoadObject(scene, districtRoot, source, "road-b", 10);
  first.root.rotation.y = Math.PI / 8;
  second.root.rotation.y = Math.PI / 2;
  second.root.scaling = new Vector3(0.75, 1, 1.5);
  first.renderableMeshes[0]!.metadata = { authoredShadowRole: "road" };
  const expectedWorldMatrices = [first, second].map((content) =>
    content.renderableMeshes[0]!.computeWorldMatrix(true).clone()
  );
  const originalMeshes = [...first.meshes, ...second.meshes];
  const batcher = new ConnectedObjectInstanceBatcher({
    disposeImportedMesh: (mesh) => mesh.dispose(false, false),
    markSharedResourceMesh: () => undefined,
    supportsThinInstances: () => true
  });

  const result = batcher.batch(districtRoot, [first, second]);
  const batchObject = result.sceneObjects.find((object) =>
    (object.root.metadata as Record<string, unknown> | undefined)?.runtimeThinInstanceBatch === true
  );
  const host = batchObject?.renderableMeshes[0] as Mesh | undefined;

  assert(result.batchCount === 1 && result.batchedObjectCount === 2, "Expected one batch containing both roads.");
  assert(result.sceneObjects.length === 2, "Expected batching to preserve the logical scene-object count.");
  assert(result.sceneObjects[0]?.objectId === "road-a", "Expected the batch to reuse the representative logical object ID.");
  assert(result.sceneObjects[0]?.renderableMeshes.length === 1, "Expected the representative logical object to own the batch host.");
  assert(result.sceneObjects[1]?.renderableMeshes.length === 0, "Expected second logical object renderables to move into the batch.");
  assert(originalMeshes.every((mesh) => mesh.isDisposed()), "Expected replaced ordinary instances and helpers to be disposed.");
  assert(host?.thinInstanceCount === 2, "Expected the batch host to contain two thin instances.");
  assert(host?.thinInstanceEnablePicking === false && host.isPickable === false, "Expected render-only road batch not to participate in picking.");
  assert(host?.isWorldMatrixFrozen === true, "Expected the static thin-instance host transform to be frozen.");
  assert(host?.metadata?.authoredShadowRole === "road", "Expected authored mesh metadata to survive batching.");
  assert(batchObject?.cullingBounds !== null, "Expected aggregate bounds for batch-level culling.");
  const batchId = (batchObject?.root.metadata as Record<string, unknown> | undefined)?.runtimeThinInstanceBatchId;
  assert(batchId === (result.sceneObjects[1]?.root.metadata as Record<string, unknown> | undefined)?.runtimeThinInstanceBatchId, "Expected every logical member to reference the generated batch ID.");
  const thinMatrices = host?.thinInstanceGetWorldMatrices() ?? [];
  thinMatrices.forEach((matrix, index) => {
    assertMatrixClose(
      matrix.multiply(host!.getWorldMatrix()),
      expectedWorldMatrices[index]!,
      `Expected thin instance ${index} to preserve its world transform under transformed parents.`
    );
  });

  scene.dispose();
  engine.dispose();
}

function testFallsBackWhenThinInstancesAreUnavailable(): void {
  const engine = new NullEngine();
  const scene = new Scene(engine);
  const districtRoot = new TransformNode("district-root", scene);
  const source = MeshBuilder.CreateBox("road-source", { size: 1 }, scene);
  const first = createRoadObject(scene, districtRoot, source, "road-a", 0);
  const second = createRoadObject(scene, districtRoot, source, "road-b", 10);
  const batcher = new ConnectedObjectInstanceBatcher({
    disposeImportedMesh: (mesh) => mesh.dispose(false, false),
    markSharedResourceMesh: () => undefined,
    supportsThinInstances: () => false
  });
  const objects = [first, second];

  const result = batcher.batch(districtRoot, objects);

  assert(result.batchCount === 0, "Expected unsupported engines to keep the ordinary instance path.");
  assert(result.sceneObjects === objects, "Expected fallback to preserve the original scene-object collection.");
  assert(first.renderableMeshes[0]?.isPickable === true, "Expected fallback road picking state to remain unchanged.");
  assert(!first.renderableMeshes[0]?.isDisposed(), "Expected fallback road meshes not to be disposed.");

  scene.dispose();
  engine.dispose();
}

function testSingletonRoadKeepsOrdinaryPickingState(): void {
  const engine = new NullEngine();
  const scene = new Scene(engine);
  const districtRoot = new TransformNode("district-root", scene);
  const source = MeshBuilder.CreateBox("road-source", { size: 1 }, scene);
  const road = createRoadObject(scene, districtRoot, source, "road-a", 0);
  const batcher = new ConnectedObjectInstanceBatcher({
    disposeImportedMesh: (mesh) => mesh.dispose(false, false),
    markSharedResourceMesh: () => undefined,
    supportsThinInstances: () => true
  });

  const result = batcher.batch(districtRoot, [road]);

  assert(result.batchCount === 0, "Expected singleton road groups to keep the ordinary instance path.");
  assert(road.renderableMeshes[0]?.isPickable === true, "Expected singleton road picking state to remain unchanged.");
  assert(!road.renderableMeshes[0]?.isDisposed(), "Expected singleton road meshes not to be disposed.");

  scene.dispose();
  engine.dispose();
}

function testFallsBackForNonAllowlistedConnectedAssets(): void {
  const engine = new NullEngine();
  const scene = new Scene(engine);
  const districtRoot = new TransformNode("district-root", scene);
  const source = MeshBuilder.CreateBox("interactive-source", { size: 1 }, scene);
  const object = createRoadObject(scene, districtRoot, source, "interactive-a", 0);
  const descriptor = {
    ...object.descriptor,
    asset: "assets/models/connected/interactive_gate.glb"
  };
  const interactiveObject = { ...object, descriptor };
  const batcher = new ConnectedObjectInstanceBatcher({
    disposeImportedMesh: (mesh) => mesh.dispose(false, false),
    markSharedResourceMesh: () => undefined,
    supportsThinInstances: () => true
  });

  const result = batcher.batch(districtRoot, [interactiveObject]);

  assert(result.batchCount === 0, "Expected non-allowlisted connected asset to keep the ordinary path.");
  assert(result.sceneObjects[0]?.renderableMeshes.length === 1, "Expected fallback object renderable to remain intact.");
  assert(!object.renderableMeshes[0]?.isDisposed(), "Expected fallback mesh not to be disposed.");

  scene.dispose();
  engine.dispose();
}

function run(): void {
  testBatchesSafeRoadInstancesAndKeepsLogicalObjects();
  testFallsBackWhenThinInstancesAreUnavailable();
  testSingletonRoadKeepsOrdinaryPickingState();
  testFallsBackForNonAllowlistedConnectedAssets();
}

run();
console.log("ConnectedObjectInstanceBatcher tests passed");
