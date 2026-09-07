import { NullEngine, Scene, TransformNode, Vector3 } from "@babylonjs/core";
import { GridCell } from "../../../src/core/grid/GridCell";
import { StairEndpointCellRepairService } from "../../../src/core/grid/RectGridRuntime";
import { RectGrid } from "../../../src/core/grid/RectGrid";
import { NavigationGraph } from "../../../src/core/navigation/NavigationGraph";
import { MultiFloorPathfinder } from "../../../src/core/navigation/MultiFloorPathfinder";
import { GridNavigationContractService } from "../../../src/core/navigation/GridNavigationContract";
import {
  NavigationBlockerRegistry,
  NavigationEdgeKeyFactory,
  NavigationGeometry2D
} from "../../../src/core/navigation/NavigationBlockerRegistry";

const wallBounds = {
  minX: 0.45,
  maxX: 0.55,
  minZ: -0.2,
  maxZ: 0.2
};
const geometry = new NavigationGeometry2D();
const edgeKeyFactory = new NavigationEdgeKeyFactory();

assertEqual(geometry.circleIntersectsAabb({ x: 0.5, z: 0 }, 0.15, wallBounds), true);
assertEqual(geometry.circleIntersectsAabb({ x: 2, z: 0 }, 0.15, wallBounds), false);
assertEqual(geometry.segmentIntersectsAabb({ x: 0, z: 0 }, { x: 1, z: 0 }, wallBounds), true);
assertEqual(geometry.segmentIntersectsAabb({ x: 0, z: 1 }, { x: 1, z: 1 }, wallBounds), false);

const edgeA = new GridCell(0, -1);
const edgeB = new GridCell(1, -1);
const symmetricForward = edgeKeyFactory.make(0, edgeA, edgeB);
const symmetricReverse = edgeKeyFactory.make(0, edgeB, edgeA);
assertEqual(symmetricForward, symmetricReverse);
assertEqual(edgeKeyFactory.make(0, new GridCell(-3, -11), new GridCell(-2, -11)), "0:-2:-11->-3:-11");

const blockedEdges = new Set<string>([symmetricForward]);
assertEqual(blockedEdges.has(edgeKeyFactory.make(0, edgeA, edgeB)), true);
assertEqual(blockedEdges.has(edgeKeyFactory.make(0, edgeB, edgeA)), true);

const doorEdgeKey = edgeKeyFactory.make(0, new GridCell(5, 2), new GridCell(5, 3));
const blockedWithDoor = new Set<string>([symmetricForward, doorEdgeKey]);
blockedWithDoor.delete(doorEdgeKey);
assertEqual(blockedWithDoor.has(symmetricForward), true);
assertEqual(blockedWithDoor.has(doorEdgeKey), false);

const grid = new RectGrid(Vector3.Zero(), 1, {
  minX: 0,
  maxX: 1,
  minZ: 0,
  maxZ: 0
});
const blockedGraph = new NavigationGraph(
  grid,
  [],
  new Map([[0, 0]]),
  () => true,
  (fromCell, toCell) => fromCell.equals(new GridCell(0, 0)) && toCell.equals(new GridCell(1, 0))
);
const blockedPathfinder = new MultiFloorPathfinder(blockedGraph);
assertEqual(
  blockedPathfinder.findPath({
    fromCell: new GridCell(0, 0),
    fromStoryIndex: 0,
    toCell: new GridCell(1, 0),
    toStoryIndex: 0
  }),
  null
);

const openDoorGraph = new NavigationGraph(
  grid,
  [],
  new Map([[0, 0]]),
  () => true,
  () => false
);
const openDoorPathfinder = new MultiFloorPathfinder(openDoorGraph);
const openDoorPath = openDoorPathfinder.findPath({
  fromCell: new GridCell(0, 0),
  fromStoryIndex: 0,
  toCell: new GridCell(1, 0),
  toStoryIndex: 0
});
assertEqual(Boolean(openDoorPath && openDoorPath.length > 0), true);

const stairGraph = new NavigationGraph(
  new RectGrid(Vector3.Zero(), 1, {
    minX: 0,
    maxX: 2,
    minZ: 0,
    maxZ: 0
  }),
  [
    {
      stairId: "test-stair",
      fromStoryIndex: 0,
      toStoryIndex: 1,
      fromCell: new GridCell(0, 0),
      toCell: new GridCell(1, 0),
      kind: "internal",
      cost: 1,
      bidirectional: true,
      traversalPathWorld: [new Vector3(0, 0, 0), new Vector3(1, 1, 0)]
    }
  ],
  new Map([
    [0, 0],
    [1, 1]
  ]),
  () => true,
  () => false
);
const stairPathfinder = new MultiFloorPathfinder(stairGraph);
const stairPath = stairPathfinder.findPath({
  fromCell: new GridCell(0, 0),
  fromStoryIndex: 0,
  toCell: new GridCell(2, 0),
  toStoryIndex: 1
});
assertEqual(stairPath?.[0]?.kind, "stair");
assertEqual(stairPath?.[1]?.kind, "walk");

const endpointCleanupRegistry = buildRegistryFromContract({
  contract: "sillyrpg.grid_navigation.v3",
  grid_type: "rect",
  tile_size_m: 1,
  origin: { x: 0, z: 0 },
  coordinate_mapping: "blender_xy_to_game_xz",
  stories: [
    {
      story_index: 0,
      story_y_m: 0,
      walkable_cells: [
        { x: 0, z: -1 },
        { x: 1, z: -1 },
        { x: 2, z: -1 },
        { x: 3, z: -1 }
      ],
      blocked_cells: [
        { x: 0, z: -1, reason: "obstacle" },
        { x: 1, z: -1, reason: "obstacle" },
        { x: 2, z: -1, reason: "obstacle" },
        { x: 3, z: -1, reason: "obstacle" }
      ],
      blocked_edges: [
        {
          a: { x: 0, z: -1 },
          b: { x: 1, z: -1 },
          reason: "wall"
        }
      ],
      door_edges: [
        {
          a: { x: 0, z: -1 },
          b: { x: 0, z: -2 },
          door_id: "door-1",
          is_open: true
        }
      ],
      stairs: [
        {
          id: "stair-from",
          from: { story_index: 0, cell: { x: 1, z: -1 } },
          to: { story_index: 1, cell: { x: 4, z: -1 } },
          kind: "internal",
          bidirectional: true
        },
        {
          id: "stair-to",
          from: { story_index: 1, cell: { x: 5, z: -1 } },
          to: { story_index: 0, cell: { x: 2, z: -1 } },
          kind: "internal",
          bidirectional: true
        }
      ]
    },
    {
      story_index: 1,
      story_y_m: 3,
      walkable_cells: [
        { x: 4, z: -1 },
        { x: 5, z: -1 }
      ],
      blocked_cells: [],
      blocked_edges: [],
      door_edges: [],
      stairs: []
    }
  ]
});

assertEqual(endpointCleanupRegistry.isCellBlocked(new GridCell(0, -1), 0), false);
assertEqual(endpointCleanupRegistry.isCellBlocked(new GridCell(1, -1), 0), false);
assertEqual(endpointCleanupRegistry.isCellBlocked(new GridCell(2, -1), 0), false);
assertEqual(endpointCleanupRegistry.isCellBlocked(new GridCell(3, -1), 0), true);

const cleanValidationCalls: string[] = [];
const cleanValidationRepairs = new StairEndpointCellRepairService().validateAndRepair(
  [
    {
      stairId: "clean-stair",
      fromStoryIndex: 0,
      toStoryIndex: 1,
      fromCell: new GridCell(1, -1),
      toCell: new GridCell(4, -1),
      kind: "internal",
      cost: 1,
      bidirectional: true,
      traversalPathWorld: [new Vector3(1.5, 0, -0.5), new Vector3(4.5, 3, -0.5)]
    }
  ],
  {
    isWalkableCell: () => true
  },
  {
    isCellBlocked: () => false,
    forceUnblockCell: (_cell, _storyIndex, reason) => {
      cleanValidationCalls.push(reason);
    }
  }
);
assertEqual(cleanValidationRepairs, 0);
assertEqual(cleanValidationCalls.length, 0);

testContractStairIdsAreScopedBySceneObjectInstance();

console.log("NavigationBlockerRegistry geometry tests passed");

function assertEqual<T>(actual: T, expected: T): void {
  if (actual !== expected) {
    throw new Error(`Assertion failed: expected ${String(expected)}, got ${String(actual)}`);
  }
}

function buildRegistryFromContract(contract: Record<string, unknown>): NavigationBlockerRegistry {
  const engine = new NullEngine();
  const scene = new Scene(engine);
  const root = new TransformNode("nav-contract-root", scene);
  root.metadata = {
    game_navigation_json: JSON.stringify(contract)
  };
  const grid = new RectGrid(Vector3.Zero(), 1, {
    minX: 0,
    maxX: 6,
    minZ: -3,
    maxZ: 0
  });
  const registry = new NavigationBlockerRegistry();
  registry.rebuild(scene, grid, new Map([
    [0, 0],
    [1, 3]
  ]));
  scene.dispose();
  engine.dispose();
  return registry;
}

function testContractStairIdsAreScopedBySceneObjectInstance(): void {
  const engine = new NullEngine();
  const scene = new Scene(engine);
  const contract = {
    contract: "sillyrpg.grid_navigation.v3",
    grid_type: "rect",
    tile_size_m: 1,
    origin: { x: 0, z: 0 },
    coordinate_mapping: "blender_xy_to_game_xz",
    stories: [
      {
        story_index: 0,
        story_y_m: 0,
        walkable_cells: [{ x: 0, z: 0 }],
        blocked_cells: [],
        blocked_edges: [],
        door_edges: [],
        stairs: [
          {
            id: "BuildingA:0_1_000",
            from: { story_index: 0, cell: { x: 0, z: 0 } },
            to: { story_index: 1, cell: { x: 0, z: 0 } },
            traversal_path_world: [
              { x: 0.5, y: 0, z: 0.5 },
              { x: 0.5, y: 3, z: 0.5 }
            ]
          }
        ]
      },
      {
        story_index: 1,
        story_y_m: 3,
        walkable_cells: [{ x: 0, z: 0 }],
        blocked_cells: [],
        blocked_edges: [],
        door_edges: [],
        stairs: []
      }
    ]
  };

  for (const instanceId of ["building-a-001", "building-a-002"]) {
    const root = new TransformNode(`root-${instanceId}`, scene);
    root.metadata = { sceneObjectId: instanceId, buildingVisibilityInstanceId: instanceId };
    const metadataNode = new TransformNode(`metadata-${instanceId}`, scene);
    metadataNode.metadata = { game_navigation_json: JSON.stringify(contract) };
    metadataNode.parent = root;
  }

  const grid = new RectGrid(Vector3.Zero(), 1, { minX: -1, maxX: 1, minZ: -1, maxZ: 1 });
  const stairIds = GridNavigationContractService.getShared()
    .mapToRuntime(scene, grid)
    .flatMap((mappedContract) => mappedContract.stories.flatMap((story) => story.stairs.map((stair) => stair.id)))
    .sort();

  assertEqual(stairIds.length, 2);
  assertEqual(stairIds[0], "building-a-001:BuildingA:0_1_000");
  assertEqual(stairIds[1], "building-a-002:BuildingA:0_1_000");
  scene.dispose();
  engine.dispose();
}
