import { MeshBuilder, NullEngine, Scene } from "@babylonjs/core";
import { parseBuildingVisibilityMesh } from "../../../src/core/scene/visibility/BuildingVisibilityMetadata";
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

function run(): void {
  testParserPrefersRuntimeSceneObjectInstanceIdOverAuthoredAssetBuildingId();
  testRegistryKeepsPlacedBuildingCopiesSeparate();
  testLegacyAuthoredBuildingIdStillWorksWithoutRuntimeOverrides();
}

run();
console.log("BuildingVisibilityMetadata tests passed");
