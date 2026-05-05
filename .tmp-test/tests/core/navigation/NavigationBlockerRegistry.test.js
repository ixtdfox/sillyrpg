"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const core_1 = require("@babylonjs/core");
const GridCell_1 = require("../../../src/core/grid/GridCell");
const RectGrid_1 = require("../../../src/core/grid/RectGrid");
const NavigationGraph_1 = require("../../../src/core/navigation/NavigationGraph");
const MultiFloorPathfinder_1 = require("../../../src/core/navigation/MultiFloorPathfinder");
const NavigationBlockerRegistry_1 = require("../../../src/core/navigation/NavigationBlockerRegistry");
const wallBounds = {
    minX: 0.45,
    maxX: 0.55,
    minZ: -0.2,
    maxZ: 0.2
};
assertEqual((0, NavigationBlockerRegistry_1.circleIntersectsAabb2D)({ x: 0.5, z: 0 }, 0.15, wallBounds), true);
assertEqual((0, NavigationBlockerRegistry_1.circleIntersectsAabb2D)({ x: 2, z: 0 }, 0.15, wallBounds), false);
assertEqual((0, NavigationBlockerRegistry_1.segmentIntersectsAabb2D)({ x: 0, z: 0 }, { x: 1, z: 0 }, wallBounds), true);
assertEqual((0, NavigationBlockerRegistry_1.segmentIntersectsAabb2D)({ x: 0, z: 1 }, { x: 1, z: 1 }, wallBounds), false);
const edgeA = new GridCell_1.GridCell(0, -1);
const edgeB = new GridCell_1.GridCell(1, -1);
const symmetricForward = (0, NavigationBlockerRegistry_1.makeEdgeKey)(0, edgeA, edgeB);
const symmetricReverse = (0, NavigationBlockerRegistry_1.makeEdgeKey)(0, edgeB, edgeA);
assertEqual(symmetricForward, symmetricReverse);
assertEqual((0, NavigationBlockerRegistry_1.makeEdgeKey)(0, new GridCell_1.GridCell(-3, -11), new GridCell_1.GridCell(-2, -11)), "0:-2:-11->-3:-11");
const blockedEdges = new Set([symmetricForward]);
assertEqual(blockedEdges.has((0, NavigationBlockerRegistry_1.makeEdgeKey)(0, edgeA, edgeB)), true);
assertEqual(blockedEdges.has((0, NavigationBlockerRegistry_1.makeEdgeKey)(0, edgeB, edgeA)), true);
const doorEdgeKey = (0, NavigationBlockerRegistry_1.makeEdgeKey)(0, new GridCell_1.GridCell(5, 2), new GridCell_1.GridCell(5, 3));
const blockedWithDoor = new Set([symmetricForward, doorEdgeKey]);
blockedWithDoor.delete(doorEdgeKey);
assertEqual(blockedWithDoor.has(symmetricForward), true);
assertEqual(blockedWithDoor.has(doorEdgeKey), false);
const grid = new RectGrid_1.RectGrid(core_1.Vector3.Zero(), 1, {
    minX: 0,
    maxX: 1,
    minZ: 0,
    maxZ: 0
});
const blockedGraph = new NavigationGraph_1.NavigationGraph(grid, [], new Map([[0, 0]]), () => true, (fromCell, toCell) => fromCell.equals(new GridCell_1.GridCell(0, 0)) && toCell.equals(new GridCell_1.GridCell(1, 0)));
const blockedPathfinder = new MultiFloorPathfinder_1.MultiFloorPathfinder(blockedGraph);
assertEqual(blockedPathfinder.findPath({
    fromCell: new GridCell_1.GridCell(0, 0),
    fromStoryIndex: 0,
    toCell: new GridCell_1.GridCell(1, 0),
    toStoryIndex: 0
}), null);
const openDoorGraph = new NavigationGraph_1.NavigationGraph(grid, [], new Map([[0, 0]]), () => true, () => false);
const openDoorPathfinder = new MultiFloorPathfinder_1.MultiFloorPathfinder(openDoorGraph);
const openDoorPath = openDoorPathfinder.findPath({
    fromCell: new GridCell_1.GridCell(0, 0),
    fromStoryIndex: 0,
    toCell: new GridCell_1.GridCell(1, 0),
    toStoryIndex: 0
});
assertEqual(Boolean(openDoorPath && openDoorPath.length > 0), true);
const stairGraph = new NavigationGraph_1.NavigationGraph(new RectGrid_1.RectGrid(core_1.Vector3.Zero(), 1, {
    minX: 0,
    maxX: 2,
    minZ: 0,
    maxZ: 0
}), [
    {
        stairId: "test-stair",
        fromStoryIndex: 0,
        toStoryIndex: 1,
        fromCell: new GridCell_1.GridCell(0, 0),
        toCell: new GridCell_1.GridCell(1, 0),
        kind: "internal",
        cost: 1,
        bidirectional: true,
        traversalPathWorld: [new core_1.Vector3(0, 0, 0), new core_1.Vector3(1, 1, 0)]
    }
], new Map([
    [0, 0],
    [1, 1]
]), () => true, () => false);
const stairPathfinder = new MultiFloorPathfinder_1.MultiFloorPathfinder(stairGraph);
const stairPath = stairPathfinder.findPath({
    fromCell: new GridCell_1.GridCell(0, 0),
    fromStoryIndex: 0,
    toCell: new GridCell_1.GridCell(2, 0),
    toStoryIndex: 1
});
assertEqual(stairPath?.[0]?.kind, "stair");
assertEqual(stairPath?.[1]?.kind, "walk");
console.log("NavigationBlockerRegistry geometry tests passed");
function assertEqual(actual, expected) {
    if (actual !== expected) {
        throw new Error(`Assertion failed: expected ${String(expected)}, got ${String(actual)}`);
    }
}
