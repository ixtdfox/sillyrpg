import {
  BoundingBox,
  FreeCamera,
  MeshBuilder,
  NullEngine,
  Scene,
  TransformNode,
  Vector3
} from "@babylonjs/core";
import { SceneObjectVisibilityController } from "../../../src/core/scene/visibility/SceneObjectVisibilityController";
import type { ImportedSceneObjectContent } from "../../../src/core/world/scene/SceneContentLoader";

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

function createSceneObject(
  scene: Scene,
  id: string,
  type: string,
  position: Vector3,
  withBounds = true
): ImportedSceneObjectContent {
  const root = new TransformNode(`${id}-root`, scene);
  const mesh = MeshBuilder.CreateBox(`${id}-mesh`, { size: 2 }, scene);
  mesh.parent = root;
  mesh.position.copyFrom(position);
  mesh.computeWorldMatrix(true);
  const meshBounds = mesh.getBoundingInfo().boundingBox;

  return {
    objectId: id,
    type,
    root,
    descriptor: {
      id,
      type,
      asset: `assets/models/${type}/${id}.glb`,
      position: [position.x, position.y, position.z],
      rotation: [0, 0, 0],
      scale: [1, 1, 1]
    },
    cullingBounds: withBounds
      ? new BoundingBox(meshBounds.minimumWorld.clone(), meshBounds.maximumWorld.clone())
      : null,
    meshes: [mesh],
    renderableMeshes: [mesh],
    helperMeshes: [],
    transformNodes: [],
    skeletons: [],
    animationGroups: [],
    particleSystems: []
  };
}

function testCullsOnlyStaticDecorativeObjectsOutsideCameraFrustum(): void {
  const engine = new NullEngine();
  const scene = new Scene(engine);
  const camera = new FreeCamera("camera", Vector3.Zero(), scene);
  camera.setTarget(new Vector3(0, 0, 1));
  camera.minZ = 0.1;
  camera.maxZ = 250;
  scene.activeCamera = camera;

  const visibleStreet = createSceneObject(scene, "visible-street", "street", new Vector3(0, 0, 20));
  const offscreenStreet = createSceneObject(scene, "offscreen-street", "street", new Vector3(100, 0, 20));
  const offscreenBuilding = createSceneObject(scene, "offscreen-building", "building", new Vector3(100, 0, 20));
  const unknownBoundsInterior = createSceneObject(scene, "unknown-interior", "interior", new Vector3(100, 0, 20), false);
  const objects = [visibleStreet, offscreenStreet, offscreenBuilding, unknownBoundsInterior];
  const controller = new SceneObjectVisibilityController();

  controller.update(1, camera, objects);

  assert(visibleStreet.root.isEnabled(), "Expected a street prop in the camera frustum to remain enabled.");
  assert(!offscreenStreet.root.isEnabled(), "Expected an offscreen street prop root to be disabled.");
  assert(offscreenBuilding.root.isEnabled(), "Expected building roots to remain available for shadow and visibility systems.");
  assert(unknownBoundsInterior.root.isEnabled(), "Expected objects without safe cached bounds to fail open.");

  camera.setTarget(new Vector3(100, 0, 20));
  controller.update(1, camera, objects);
  assert(offscreenStreet.root.isEnabled(), "Expected camera movement to restore a newly visible street prop.");

  controller.dispose();
  assert(visibleStreet.root.isEnabled(), "Expected disposal to restore controller-owned roots.");
  assert(offscreenStreet.root.isEnabled(), "Expected disposal to restore every culled root.");

  scene.dispose();
  engine.dispose();
}

testCullsOnlyStaticDecorativeObjectsOutsideCameraFrustum();
console.log("SceneObjectVisibilityController tests passed");
