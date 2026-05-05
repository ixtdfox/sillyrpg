import { Vector3 } from "@babylonjs/core";
import { GridCell } from "../../../src/core/grid/GridCell";
import { RectGrid } from "../../../src/core/grid/RectGrid";
import { NavigationGraph } from "../../../src/core/navigation/NavigationGraph";
import { MultiFloorPathfinder } from "../../../src/core/navigation/MultiFloorPathfinder";
import {
  circleIntersectsAabb2D,
  makeEdgeKey,
  segmentIntersectsAabb2D
} from "../../../src/core/navigation/NavigationBlockerRegistry";

const wallBounds = {
  minX: 0.45,
  maxX: 0.55,
  minZ: -0.2,
  maxZ: 0.2
};

assertEqual(circleIntersectsAabb2D({ x: 0.5, z: 0 }, 0.15, wallBounds), true);
assertEqual(circleIntersectsAabb2D({ x: 2, z: 0 }, 0.15, wallBounds), false);
assertEqual(segmentIntersectsAabb2D({ x: 0, z: 0 }, { x: 1, z: 0 }, wallBounds), true);
assertEqual(segmentIntersectsAabb2D({ x: 0, z: 1 }, { x: 1, z: 1 }, wallBounds), false);

const edgeA = new GridCell(0, -1);
const edgeB = new GridCell(1, -1);
const symmetricForward = makeEdgeKey(0, edgeA, edgeB);
const symmetricReverse = makeEdgeKey(0, edgeB, edgeA);
assertEqual(symmetricForward, symmetricReverse);
assertEqual(makeEdgeKey(0, new GridCell(-3, -11), new GridCell(-2, -11)), "0:-2:-11->-3:-11");

const blockedEdges = new Set<string>([symmetricForward]);
assertEqual(blockedEdges.has(makeEdgeKey(0, edgeA, edgeB)), true);
assertEqual(blockedEdges.has(makeEdgeKey(0, edgeB, edgeA)), true);

const doorEdgeKey = makeEdgeKey(0, new GridCell(5, 2), new GridCell(5, 3));
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

console.log("NavigationBlockerRegistry geometry tests passed");

function assertEqual<T>(actual: T, expected: T): void {
  if (actual !== expected) {
    throw new Error(`Assertion failed: expected ${String(expected)}, got ${String(actual)}`);
  }
}
