import { Vector3 } from "@babylonjs/core";
import { HexCell } from "../../../src/core/hex/HexCell";
import { HexGrid } from "../../../src/core/hex/HexGrid";
import { NavigationGraph } from "../../../src/core/navigation/NavigationGraph";
import { MultiFloorPathfinder } from "../../../src/core/navigation/MultiFloorPathfinder";
import {
  circleIntersectsAabb2D,
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

const grid = new HexGrid(Vector3.Zero(), 1, {
  minQ: 0,
  maxQ: 1,
  minR: 0,
  maxR: 0
});
const blockedGraph = new NavigationGraph(
  grid,
  [],
  new Map([[0, 0]]),
  () => true,
  (fromCell, toCell) => fromCell.equals(new HexCell(0, 0)) && toCell.equals(new HexCell(1, 0))
);
const blockedPathfinder = new MultiFloorPathfinder(blockedGraph);
assertEqual(
  blockedPathfinder.findPath({
    fromCell: new HexCell(0, 0),
    fromStoryIndex: 0,
    toCell: new HexCell(1, 0),
    toStoryIndex: 0
  }),
  null
);

const stairGraph = new NavigationGraph(
  grid,
  [
    {
      stairId: "test-stair",
      fromStoryIndex: 0,
      toStoryIndex: 1,
      fromCell: new HexCell(0, 0),
      toCell: new HexCell(1, 0),
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
  () => true
);
const stairPathfinder = new MultiFloorPathfinder(stairGraph);
const stairPath = stairPathfinder.findPath({
  fromCell: new HexCell(0, 0),
  fromStoryIndex: 0,
  toCell: new HexCell(1, 0),
  toStoryIndex: 1
});
assertEqual(stairPath?.[0]?.kind, "stair");

console.log("NavigationBlockerRegistry geometry tests passed");

function assertEqual<T>(actual: T, expected: T): void {
  if (actual !== expected) {
    throw new Error(`Assertion failed: expected ${String(expected)}, got ${String(actual)}`);
  }
}
