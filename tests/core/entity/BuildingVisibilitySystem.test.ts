import {
  BoundingBox,
  FreeCamera,
  MeshBuilder,
  NullEngine,
  Scene,
  StandardMaterial,
  TransformNode,
  Vector3,
} from "@babylonjs/core";
import { Entity } from "../../../src/core/entity/Entity";
import { EntityManager } from "../../../src/core/entity/EntityManager";
import { LocalPlayerComponent } from "../../../src/core/entity/components/LocalPlayerComponent";
import { TransformComponent } from "../../../src/core/entity/components/TransformComponent";
import { BuildingVisibilitySystem } from "../../../src/core/entity/systems/BuildingVisibilitySystem";
import {
  applyCutawayHiddenMeshState,
  restoreCutawayHiddenMeshState,
} from "../../../src/core/entity/systems/BuildingVisibilitySystem";

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

function testCutawayHideKeepsMeshRenderableButNotPickable(): void {
  const mesh = {
    isPickable: true,
    layerMask: 0x0fffffff,
  };

  applyCutawayHiddenMeshState(mesh);

  assert(mesh.layerMask === 0, "Expected cutaway-hidden mesh to be excluded from the main camera layer.");
  assert(mesh.isPickable === false, "Expected cutaway-hidden mesh to stop intercepting picks.");
}

function testCutawayRestoreRestoresOriginalStateIncludingPicking(): void {
  const mesh = {
    isPickable: false,
    layerMask: 0,
  };

  restoreCutawayHiddenMeshState(mesh, {
    isPickable: true,
    layerMask: 0x12345678,
  });

  assert(mesh.isPickable === true, "Expected restore to reinstate the original pickability.");
  assert(mesh.layerMask === 0x12345678, "Expected restore to reinstate the original layer mask.");
}

function createLodMetadata(
  level: number,
  role: "full" | "exterior" | "shadow_proxy",
  interior = false,
): Record<string, unknown> {
  return {
    gltf: {
      extras: {
        game_visibility: true,
        game_building_id: "BuildingA",
        game_visibility_role: role === "full" ? "hide_above_player" : "ignore",
        game_story_index: role === "full" ? 1 : 0,
        game_part: role === "full" ? "Roof" : "LOD1_Exterior",
        game_lod_group: "building_render",
        game_lod_level: level,
        game_lod_role: role,
        game_interior: interior,
      },
    },
  };
}

function testLodSwitchesWithDistanceAndKeepsFullLodInside(): void {
  const engine = new NullEngine();
  const scene = new Scene(engine);
  const camera = new FreeCamera("test-camera", new Vector3(40, 10, 40), scene);
  camera.setTarget(Vector3.Zero());
  scene.activeCamera = camera;

  const lod0 = MeshBuilder.CreateBox("LOD0_Full", { size: 1 }, scene);
  const lod1 = MeshBuilder.CreateBox("LOD1_Exterior", { size: 1 }, scene);
  const interior = MeshBuilder.CreateBox("LOD0_Interior", { size: 0.8 }, scene);
  const shadowProxy = MeshBuilder.CreateBox("ShadowProxy_BuildingA", { size: 1.1 }, scene);
  lod0.metadata = createLodMetadata(0, "full");
  lod1.metadata = createLodMetadata(1, "exterior");
  interior.metadata = createLodMetadata(0, "full", true);
  shadowProxy.metadata = createLodMetadata(1, "shadow_proxy");
  lod0.isPickable = true;
  const insideVolume = createInsideVolume(scene, "BuildingA", Vector3.Zero());

  let shadowSynchronizations = 0;
  const activeMeshes = [lod0, lod1, interior, shadowProxy];
  const activeNodes = [...activeMeshes, insideVolume];
  const locationManager = {
    getActiveDistrictMeshes: () => activeMeshes,
    getActiveDistrictNodes: () => activeNodes,
    getActiveDistrictSceneObjects: () => [],
  };
  scene.metadata = {
    inGameRuntimeContext: {
      locationManager,
      shadowRegistry: { synchronize: () => shadowSynchronizations++ },
    },
  };

  const player = new Entity("player");
  player.addComponent(LocalPlayerComponent, new LocalPlayerComponent());
  const transform = new TransformComponent(new Vector3(40, 0, 40));
  player.addComponent(TransformComponent, transform);
  const entityManager = new EntityManager();
  entityManager.addEntity(player);

  const system = new BuildingVisibilitySystem(entityManager);
  system.setScene(scene);
  system.update(1 / 60);

  assert(lod0.isEnabled() === false, "Expected full LOD to be disabled at distance.");
  assert(lod1.isEnabled() === true, "Expected exterior LOD to be enabled at distance.");
  assert(interior.isEnabled() === false, "Expected interior LOD0 geometry to be disabled at distance.");
  assert(shadowProxy.isEnabled() === true, "Expected shadow proxy to stay enabled for shadow rendering.");
  assert(shadowProxy.isVisible === true && shadowProxy.layerMask === 0, "Expected shadow proxy to stay out of the main camera pass.");

  transform.value = Vector3.Zero();
  system.update(1 / 60);
  assert(lod0.isEnabled() === true, "Expected full LOD to be enabled inside the building.");
  assert(lod0.layerMask === 0 && !lod0.isPickable, "Expected the upper-story full LOD to enter cutaway state.");
  assert(lod1.isEnabled() === false, "Expected exterior LOD to be disabled inside the building.");
  assert(interior.isEnabled() === true, "Expected interior geometry to be enabled inside the building.");
  assert(shadowProxy.isEnabled() === true && shadowProxy.layerMask === 0, "Expected shadow proxy to stay hidden from the main camera pass inside the building.");

  transform.value = new Vector3(25, 0, 0);
  system.update(1 / 60);
  assert(lod0.isEnabled() === false, "Expected full LOD to hide after crossing the hysteresis range.");
  assert(lod1.isEnabled() === true, "Expected exterior LOD to return after crossing the hysteresis range.");
  assert(interior.isEnabled() === false, "Expected interior geometry to hide after crossing the hysteresis range.");
  assert(shadowProxy.isEnabled() === true && shadowProxy.layerMask === 0, "Expected shadow proxy to stay available only to the shadow pass after LOD switching.");
  assert(shadowSynchronizations === 3, "Expected shadow list sync only after each LOD state transition.");

  transform.value = new Vector3(10, 0, 0);
  system.update(1 / 60);
  assert(lod0.isEnabled() === true, "Expected full LOD to return inside the near-distance threshold.");
  assert(lod0.layerMask !== 0, "Expected leaving the building to restore the full LOD camera layer.");
  assert(lod0.isPickable, "Expected LOD restoration not to preserve transient cutaway pickability.");

  scene.dispose();
  engine.dispose();
}

function testStandaloneShadowProxyStaysOutOfMainCameraPass(): void {
  const engine = new NullEngine();
  const scene = new Scene(engine);
  const shadowProxy = MeshBuilder.CreateBox("ShadowProxy_BuildingA", { size: 1 }, scene);
  shadowProxy.metadata = {
    gltf: {
      extras: {
        game_visibility: true,
        game_building_id: "BuildingA",
        game_lod_role: "shadow_proxy",
      },
    },
  };
  const locationManager = {
    getActiveDistrictMeshes: () => [shadowProxy],
    getActiveDistrictNodes: () => [shadowProxy],
    getActiveDistrictSceneObjects: () => [],
  };
  scene.metadata = {
    inGameRuntimeContext: {
      locationManager,
      shadowRegistry: { synchronize: () => undefined },
    },
  };

  const system = new BuildingVisibilitySystem(new EntityManager());
  system.setScene(scene);
  system.update(1 / 60);

  assert(shadowProxy.isEnabled(), "Expected standalone shadow proxy to remain enabled for shadow rendering.");
  assert(shadowProxy.isVisible && shadowProxy.layerMask === 0, "Expected standalone shadow proxy to be hidden from the main camera pass.");
  assert(!shadowProxy.isPickable, "Expected standalone shadow proxy not to intercept picks.");

  scene.dispose();
  engine.dispose();
}

function testLeavesOffscreenSceneObjectRootsEnabledForStableShadows(): void {
  const engine = new NullEngine();
  const scene = new Scene(engine);
  const camera = new FreeCamera("test-camera", Vector3.Zero(), scene);
  camera.setTarget(new Vector3(0, 0, 1));
  camera.minZ = 0.1;
  camera.maxZ = 200;
  scene.activeCamera = camera;

  const visibleRoot = new TransformNode("road-visible-root", scene);
  const visibleRoad = MeshBuilder.CreateBox("road-visible", { size: 2 }, scene);
  visibleRoad.position.z = 20;
  visibleRoad.parent = visibleRoot;
  const hiddenRoot = new TransformNode("road-hidden-root", scene);
  const hiddenRoad = MeshBuilder.CreateBox("road-hidden", { size: 2 }, scene);
  hiddenRoad.position.x = 100;
  hiddenRoad.position.z = 20;
  hiddenRoad.parent = hiddenRoot;
  visibleRoad.computeWorldMatrix(true);
  hiddenRoad.computeWorldMatrix(true);

  const locationManager = {
    getActiveDistrictMeshes: () => [visibleRoad, hiddenRoad],
    getActiveDistrictNodes: () => [visibleRoad, hiddenRoad],
    getActiveDistrictSceneObjects: () => [
      {
        objectId: "road-visible",
        root: visibleRoot,
        renderableMeshes: [visibleRoad],
        cullingBounds: new BoundingBox(
          visibleRoad.getBoundingInfo().boundingBox.minimumWorld,
          visibleRoad.getBoundingInfo().boundingBox.maximumWorld,
        ),
      },
      {
        objectId: "road-hidden",
        root: hiddenRoot,
        renderableMeshes: [hiddenRoad],
        cullingBounds: new BoundingBox(
          hiddenRoad.getBoundingInfo().boundingBox.minimumWorld,
          hiddenRoad.getBoundingInfo().boundingBox.maximumWorld,
        ),
      },
    ],
  };
  let shadowSynchronizations = 0;
  scene.metadata = {
    inGameRuntimeContext: {
      locationManager,
      shadowRegistry: { synchronize: () => shadowSynchronizations++ },
    },
  };

  const player = new Entity("player");
  player.addComponent(LocalPlayerComponent, new LocalPlayerComponent());
  player.addComponent(TransformComponent, new TransformComponent(Vector3.Zero()));
  const entityManager = new EntityManager();
  entityManager.addEntity(player);
  const systemWithPlayer = new BuildingVisibilitySystem(entityManager);
  systemWithPlayer.setScene(scene);
  scene.render();
  systemWithPlayer.update(1 / 60);

  assert(visibleRoot.isEnabled(), "Expected a generic road inside the camera frustum to stay enabled.");
  assert(hiddenRoot.isEnabled(), "Expected offscreen roots to remain enabled so their shadows can reach the camera frustum.");
  assert(shadowSynchronizations === 0, "Expected camera movement not to churn the shadow caster list.");

  camera.setTarget(new Vector3(100, 0, 20));
  scene.render();
  systemWithPlayer.update(1 / 60);
  assert(hiddenRoot.isEnabled(), "Expected camera movement to leave scene object roots unchanged.");
  assert(shadowSynchronizations === 0, "Expected camera movement not to resynchronize stable shadow casters.");

  scene.dispose();
  engine.dispose();
}

function createInsideVolume(
  scene: Scene,
  buildingId: string,
  position: Vector3,
): TransformNode {
  const root = new TransformNode(`${buildingId}-root`, scene);
  root.position.copyFrom(position);
  root.metadata = {
    sceneObjectId: buildingId,
    buildingVisibilityInstanceId: buildingId,
  };
  const volume = new TransformNode(`${buildingId}-Story0_InsideVolume`, scene);
  volume.parent = root;
  volume.metadata = {
    sceneObjectId: buildingId,
    buildingVisibilityInstanceId: buildingId,
    gltf: {
      extras: {
        game_visibility: true,
        game_building_id: "GeneratedBuilding",
        game_visibility_role: "inside_volume",
        game_story_index: 0,
        game_volume_kind: "aabb",
        game_volume_min: [0, 0, 0],
        game_volume_max: [4, 4, 3],
        game_story_z_offset: 0,
      },
    },
  };
  return volume;
}

function createUpperStoryMetadata(buildingId: string): Record<string, unknown> {
  return {
    sceneObjectId: buildingId,
    buildingVisibilityInstanceId: buildingId,
    gltf: {
      extras: {
        game_visibility: true,
        game_building_id: "GeneratedBuilding",
        game_visibility_role: "hide_above_player",
        game_story_index: 1,
        game_part: "Roof",
      },
    },
  };
}

function testOverlappingInsideVolumesHideUpperStoriesFromEveryBuilding(): void {
  const engine = new NullEngine();
  const scene = new Scene(engine);
  const volumeA = createInsideVolume(scene, "building-a", Vector3.Zero());
  const volumeB = createInsideVolume(scene, "building-b", new Vector3(2, 0, 0));
  const roofA = MeshBuilder.CreateBox("building-a-roof", { size: 1 }, scene);
  const roofB = MeshBuilder.CreateBox("building-b-roof", { size: 1 }, scene);
  roofA.metadata = createUpperStoryMetadata("building-a");
  roofB.metadata = createUpperStoryMetadata("building-b");

  const locationManager = {
    getActiveDistrictMeshes: () => [roofA, roofB],
    getActiveDistrictNodes: () => [roofA, roofB, volumeA, volumeB],
    getActiveDistrictSceneObjects: () => [],
  };
  scene.metadata = {
    inGameRuntimeContext: {
      locationManager,
      shadowRegistry: { synchronize: () => undefined },
    },
  };
  const player = new Entity("player");
  player.addComponent(LocalPlayerComponent, new LocalPlayerComponent());
  player.addComponent(TransformComponent, new TransformComponent(new Vector3(2.5, 0.5, -2)));
  const entityManager = new EntityManager();
  entityManager.addEntity(player);

  const system = new BuildingVisibilitySystem(entityManager);
  system.setScene(scene);
  system.update(1 / 60);

  assert(roofA.layerMask === 0 && roofB.layerMask === 0, "Expected every overlapping containing building to apply its upper-story cutaway.");
  assert(roofA.isEnabled() && roofB.isEnabled(), "Expected cutaway roofs to remain enabled as shadow casters.");

  scene.dispose();
  engine.dispose();
}

function testHaloMaterialIsInstalledOnInstancedMeshSource(): void {
  const engine = new NullEngine();
  const scene = new Scene(engine);
  const source = MeshBuilder.CreateBox("wall-source", { size: 1 }, scene);
  const originalMaterial = new StandardMaterial("shared-wall-material", scene);
  source.material = originalMaterial;
  const wall = source.createInstance("wall-instance");
  wall.metadata = {
    sceneObjectId: "building-a",
    buildingVisibilityInstanceId: "building-a",
    gltf: {
      extras: {
        game_visibility: true,
        game_building_id: "GeneratedBuilding",
        game_visibility_role: "wall_halo",
        game_story_index: 0,
        game_part: "OuterWall",
      },
    },
  };
  const volume = createInsideVolume(scene, "building-a", Vector3.Zero());
  const locationManager = {
    getActiveDistrictMeshes: () => [wall],
    getActiveDistrictNodes: () => [wall, volume],
    getActiveDistrictSceneObjects: () => [],
  };
  scene.metadata = {
    inGameRuntimeContext: {
      locationManager,
      shadowRegistry: { synchronize: () => undefined },
    },
  };
  const player = new Entity("player");
  player.addComponent(LocalPlayerComponent, new LocalPlayerComponent());
  player.addComponent(TransformComponent, new TransformComponent(new Vector3(1, 0.5, -1)));
  const entityManager = new EntityManager();
  entityManager.addEntity(player);

  const system = new BuildingVisibilitySystem(entityManager);
  system.setScene(scene);
  system.update(1 / 60);

  assert(source.material !== originalMaterial, "Expected the halo material on the InstancedMesh source owner.");
  assert(wall.material === source.material, "Expected the instance to render with its source halo material.");

  system.setScene(null);
  assert(source.material === originalMaterial, "Expected cleanup to restore the source material.");

  scene.dispose();
  engine.dispose();
}

function run(): void {
  testCutawayHideKeepsMeshRenderableButNotPickable();
  testCutawayRestoreRestoresOriginalStateIncludingPicking();
  testLodSwitchesWithDistanceAndKeepsFullLodInside();
  testStandaloneShadowProxyStaysOutOfMainCameraPass();
  testLeavesOffscreenSceneObjectRootsEnabledForStableShadows();
  testOverlappingInsideVolumesHideUpperStoriesFromEveryBuilding();
  testHaloMaterialIsInstalledOnInstancedMeshSource();
}

run();
console.log("BuildingVisibilitySystem tests passed");
