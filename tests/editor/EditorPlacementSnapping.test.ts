import { Vector3 } from "@babylonjs/core";
import { snapEditorMovePosition, snapWorldYToGrid } from "../../src/editor/EditorPlacementSnapping";

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

function assertVector3(actual: Vector3, expected: Vector3, message: string): void {
  assert(actual.x === expected.x, `${message} (x) expected ${expected.x}, received ${actual.x}`);
  assert(actual.y === expected.y, `${message} (y) expected ${expected.y}, received ${actual.y}`);
  assert(actual.z === expected.z, `${message} (z) expected ${expected.z}, received ${actual.z}`);
}

function testSnapWorldYToGrid(): void {
  assert(snapWorldYToGrid(0.49) === 0, "Expected 0.49 to snap down to 0.");
  assert(snapWorldYToGrid(0.51) === 1, "Expected 0.51 to snap up to 1.");
}

function testSnapEditorMovePositionYOnly(): void {
  const next = snapEditorMovePosition(new Vector3(8.2, 2.6, -7.8), new Vector3(3, 0, -5), "y");
  assertVector3(next, new Vector3(3, 3, -5), "Expected Y mode to change only Y.");
}

function testSnapEditorMovePositionXOnly(): void {
  const next = snapEditorMovePosition(new Vector3(8.2, 2.6, -7.8), new Vector3(3, 0, -5), "x");
  assertVector3(next, new Vector3(8, 0, -5), "Expected X mode to change only X.");
}

function testSnapEditorMovePositionZOnly(): void {
  const next = snapEditorMovePosition(new Vector3(8.2, 2.6, -7.8), new Vector3(3, 0, -5), "z");
  assertVector3(next, new Vector3(3, 0, -8), "Expected Z mode to change only Z.");
}

function testSnapEditorMovePositionXZOnly(): void {
  const next = snapEditorMovePosition(new Vector3(8.2, 2.6, -7.8), new Vector3(3, 4, -5), "xz");
  assertVector3(next, new Vector3(8, 4, -8), "Expected XZ mode to preserve Y while snapping X/Z.");
}

function run(): void {
  testSnapWorldYToGrid();
  testSnapEditorMovePositionYOnly();
  testSnapEditorMovePositionXOnly();
  testSnapEditorMovePositionZOnly();
  testSnapEditorMovePositionXZOnly();
}

run();
console.log("EditorPlacementSnapping tests passed");
