import { MeshBuilder, NullEngine, Scene, TransformNode, Vector3 } from "@babylonjs/core";
import {
  parseBuildingVisibilityMesh,
  parseBuildingVisibilityVolumeMetadata
} from "../../../src/core/scene/visibility/BuildingVisibilityMetadata";
import { BuildingVisibilityRegistry } from "../../../src/core/scene/visibility/BuildingVisibilityRegistry";

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

function testParserPrefersRuntimeSceneObjectInstanceIdOverAuthoredAssetBuildingId(): void {
  const engine = new NullEngine();
  const scene = new Scene(engine);
  const mesh = MeshBuilder.CreateBox("roof", { size: 1 }, scene);
  mesh.metadata = {
    sceneObjectId: "building-a-001",
    buildingVisibilityInstanceId: "building-a-001",
    gltf: {
      extras: {
        game_visibility: true,
        game_building_id: "GeneratedFloorPlanV2",
        game_visibility_role: "hide_above_player",
        game_story_index: 1,
        game_part: "Roof"
      }
    }
  };

  const record = parseBuildingVisibilityMesh(mesh);

  assert(record !== null, "Expected mesh with visibility metadata to parse.");
  assert(record?.buildingId === "building-a-001", "Expected runtime scene object instance id to override authored asset building id.");

  scene.dispose();
  engine.dispose();
}

function testRegistryKeepsPlacedBuildingCopiesSeparate(): void {
  const engine = new NullEngine();
  const scene = new Scene(engine);
  const meshA = MeshBuilder.CreateBox("roof-a", { size: 1 }, scene);
  const meshB = MeshBuilder.CreateBox("roof-b", { size: 1 }, scene);
  meshA.metadata = {
    sceneObjectId: "building-a-001",
    buildingVisibilityInstanceId: "building-a-001",
    gltf: {
      extras: {
        game_visibility: true,
        game_building_id: "GeneratedFloorPlanV2",
        game_visibility_role: "hide_above_player",
        game_story_index: 1,
        game_part: "Roof"
      }
    }
  };
  meshB.metadata = {
    sceneObjectId: "building-b-001",
    buildingVisibilityInstanceId: "building-b-001",
    gltf: {
      extras: {
        game_visibility: true,
        game_building_id: "GeneratedFloorPlanV2",
        game_visibility_role: "hide_above_player",
        game_story_index: 1,
        game_part: "Roof"
      }
    }
  };

  const registry = new BuildingVisibilityRegistry();
  registry.rebuild([meshA, meshB]);
  const buildingIds = registry.getBuildings().map((building) => building.buildingId).sort();

  assert(
    JSON.stringify(buildingIds) === JSON.stringify(["building-a-001", "building-b-001"]),
    `Expected registry to keep placed building copies separate, received ${JSON.stringify(buildingIds)}.`
  );

  scene.dispose();
  engine.dispose();
}

function testLegacyAuthoredBuildingIdStillWorksWithoutRuntimeOverrides(): void {
  const engine = new NullEngine();
  const scene = new Scene(engine);
  const mesh = MeshBuilder.CreateBox("roof", { size: 1 }, scene);
  mesh.metadata = {
    gltf: {
      extras: {
        game_visibility: true,
        game_building_id: "GeneratedFloorPlanV2",
        game_visibility_role: "hide_above_player",
        game_story_index: 1,
        game_part: "Roof"
      }
    }
  };

  const record = parseBuildingVisibilityMesh(mesh);

  assert(record !== null, "Expected legacy visibility metadata to parse.");
  assert(record?.buildingId === "GeneratedFloorPlanV2", "Expected legacy authored building id fallback to stay intact.");

  scene.dispose();
  engine.dispose();
}

function testInnerWallIsClassifiedAsDistanceGatedInterior(): void {
  const engine = new NullEngine();
  const scene = new Scene(engine);
  const mesh = MeshBuilder.CreateBox("InnerWall_Story_0", { size: 1 }, scene);
  mesh.metadata = {
    gltf: {
      extras: {
        game_visibility: true,
        game_building_id: "BuildingA",
        game_visibility_role: "wall_halo",
        game_part: "InnerWall"
      }
    }
  };

  const record = parseBuildingVisibilityMesh(mesh);

  assert(record?.isInterior === true, "Expected inner wall to be classified as interior.");

  scene.dispose();
  engine.dispose();
}

function testLodMetadataIsPreservedOnVisibilityRecord(): void {
  const engine = new NullEngine();
  const scene = new Scene(engine);
  const mesh = MeshBuilder.CreateBox("LOD1_Exterior", { size: 1 }, scene);
  mesh.metadata = {
    gltf: {
      extras: {
        game_visibility: true,
        game_building_id: "BuildingA",
        game_visibility_role: "ignore",
        game_lod_group: "building_render",
        game_lod_level: 1,
        game_lod_role: "exterior",
      },
    },
  };

  const record = parseBuildingVisibilityMesh(mesh);

  assert(record?.lodGroup === "building_render", "Expected LOD group metadata to be parsed.");
  assert(record?.lodLevel === 1, "Expected LOD level metadata to be parsed.");
  assert(record?.lodRole === "exterior", "Expected LOD role metadata to be parsed.");

  scene.dispose();
  engine.dispose();
}

function testParserInheritsAuthoredLodMetadataWithoutLosingRuntimeInstanceId(): void {
  const engine = new NullEngine();
  const scene = new Scene(engine);
  const parent = new TransformNode("LOD1_Exterior", scene);
  parent.metadata = {
    gltf: {
      extras: {
        game_visibility: true,
        game_building_id: "BuildingA",
        game_visibility_role: "ignore",
        game_lod_group: "building_render",
        game_lod_level: 1,
        game_lod_role: "exterior",
      },
    },
  };
  const mesh = MeshBuilder.CreateBox("LOD1_Exterior_Primitive", { size: 1 }, scene);
  mesh.parent = parent;
  mesh.metadata = {
    sceneObjectId: "building-a-001",
    buildingVisibilityInstanceId: "building-a-001",
  };

  const record = parseBuildingVisibilityMesh(mesh);

  assert(record?.buildingId === "building-a-001", "Expected child runtime instance id to override the authored building id.");
  assert(record?.lodGroup === "building_render", "Expected child mesh to inherit its parent's authored LOD group.");
  assert(record?.lodLevel === 1, "Expected child mesh to inherit its parent's authored LOD level.");
  assert(record?.lodRole === "exterior", "Expected child mesh to inherit its parent's authored LOD role.");

  scene.dispose();
  engine.dispose();
}

function testParserComposesPartialChildMetadataWithParentLodMetadata(): void {
  const engine = new NullEngine();
  const scene = new Scene(engine);
  const parent = new TransformNode("LOD1_Exterior", scene);
  parent.metadata = {
    gltf: {
      extras: {
        game_visibility: true,
        game_building_id: "BuildingA",
        game_lod_group: "building_render",
        game_lod_level: 1,
        game_lod_role: "exterior",
      },
    },
  };
  const mesh = MeshBuilder.CreateBox("LOD1_Exterior_Primitive", { size: 1 }, scene);
  mesh.parent = parent;
  mesh.metadata = {
    sceneObjectId: "building-a-001",
    buildingVisibilityInstanceId: "building-a-001",
    gltf: { extras: { game_part: "OuterWall" } },
  };

  const record = parseBuildingVisibilityMesh(mesh);

  assert(record?.part === "OuterWall", "Expected child authored part metadata to win.");
  assert(record?.lodGroup === "building_render", "Expected missing child LOD group to come from the parent.");
  assert(record?.lodLevel === 1, "Expected missing child LOD level to come from the parent.");
  assert(record?.lodRole === "exterior", "Expected missing child LOD role to come from the parent.");

  scene.dispose();
  engine.dispose();
}

function testParserExcludesExplicitHelperMeshes(): void {
  const engine = new NullEngine();
  const scene = new Scene(engine);
  const mesh = MeshBuilder.CreateBox("StairCheckpoint", { size: 1 }, scene);
  mesh.metadata = {
    gameHelper: true,
    sceneObjectId: "building-a-001",
    buildingVisibilityInstanceId: "building-a-001",
    gltf: { extras: { game_part: "Stair" } },
  };

  assert(parseBuildingVisibilityMesh(mesh) === null, "Expected helper mesh to stay out of building visibility bounds.");

  scene.dispose();
  engine.dispose();
}

function testRegistryBuildsWorldBoundsFromMetadataOnlyInsideVolume(): void {
  const engine = new NullEngine();
  const scene = new Scene(engine);
  const placementRoot = new TransformNode("building-placement", scene);
  placementRoot.position = new Vector3(10, 0, 20);
  placementRoot.metadata = {
    sceneObjectId: "building-a-001",
    buildingVisibilityInstanceId: "building-a-001"
  };
  const importedRoot = new TransformNode("gltf-building-root", scene);
  importedRoot.parent = placementRoot;
  importedRoot.scaling.x = -1;
  const volume = new TransformNode("Story1_InsideVolume", scene);
  volume.parent = importedRoot;
  volume.position.y = 3.1;
  volume.metadata = {
    sceneObjectId: "building-a-001",
    buildingVisibilityInstanceId: "building-a-001",
    gltf: {
      extras: {
        game_visibility: true,
        game_building_id: "GeneratedFloorPlanV2",
        game_visibility_role: "inside_volume",
        game_story_index: 1,
        game_volume_kind: "aabb",
        game_volume_min: [0, 0, 3.1],
        game_volume_max: [2, 4, 6.1],
        game_story_z_offset: 3.1
      }
    }
  };

  const parsed = parseBuildingVisibilityVolumeMetadata(volume);
  const registry = new BuildingVisibilityRegistry();
  registry.rebuild([], [volume]);
  const building = registry.getBuildings()[0];
  const bounds = building?.insideVolumes[0]?.bounds;

  assert(parsed?.buildingId === "building-a-001", "Expected runtime instance id on metadata-only volume.");
  assert(parsed?.storyIndex === 1, "Expected story index on metadata-only volume.");
  assert(building?.buildingId === "building-a-001", "Expected volume-only building registration.");
  assert(bounds?.min.equalsWithEpsilon(new Vector3(8, 3.1, 16)) === true, "Expected converted minimum world volume bound with the imported root transform and no double story offset.");
  assert(bounds?.max.equalsWithEpsilon(new Vector3(10, 6.1, 20)) === true, "Expected converted maximum world volume bound with the imported root transform and no double story offset.");

  scene.dispose();
  engine.dispose();
}

function run(): void {
  testParserPrefersRuntimeSceneObjectInstanceIdOverAuthoredAssetBuildingId();
  testRegistryKeepsPlacedBuildingCopiesSeparate();
  testLegacyAuthoredBuildingIdStillWorksWithoutRuntimeOverrides();
  testInnerWallIsClassifiedAsDistanceGatedInterior();
  testLodMetadataIsPreservedOnVisibilityRecord();
  testParserInheritsAuthoredLodMetadataWithoutLosingRuntimeInstanceId();
  testParserComposesPartialChildMetadataWithParentLodMetadata();
  testParserExcludesExplicitHelperMeshes();
  testRegistryBuildsWorldBoundsFromMetadataOnlyInsideVolume();
}

run();
console.log("BuildingVisibilityMetadata tests passed");
