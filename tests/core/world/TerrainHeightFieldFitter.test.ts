import { TerrainHeightField } from "../../../src/core/world/terrain/TerrainHeightField";
import { TerrainHeightFieldFitter } from "../../../src/core/world/terrain/TerrainHeightFieldFitter";

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

const field = new TerrainHeightField(
  20,
  20,
  5,
  5,
  Float32Array.from([
    1, 2, 3, 4, 5,
    6, 7, 8, 9, 10,
    11, 12, 13, 14, 15,
    16, 17, 18, 19, 20,
    21, 22, 23, 24, 25
  ])
);

const fitted = new TerrainHeightFieldFitter().flattenRectangle(field, {
  minX: -5,
  maxX: 5,
  minZ: -5,
  maxZ: 5,
  targetHeight: 0
});

assert(fitted !== field, "Expected flattening to create a new field when samples change.");
assert(fitted.getHeight(1, 1) === 0, "Expected samples inside the road footprint to be flattened.");
assert(fitted.getHeight(2, 2) === 0, "Expected the footprint boundary to be included.");
assert(fitted.getHeight(0, 0) === 1, "Expected samples outside the footprint to remain unchanged.");
assert(fitted.getHeight(4, 4) === 25, "Expected distant samples to remain unchanged.");

const unchanged = new TerrainHeightFieldFitter().flattenRectangle(fitted, {
  minX: -5,
  maxX: 5,
  minZ: -5,
  maxZ: 5,
  targetHeight: 0
});
assert(unchanged === fitted, "Expected an already fitted footprint to preserve the field reference.");

const padded = new TerrainHeightFieldFitter().flattenRectangle(field, {
  minX: -5,
  maxX: 5,
  minZ: -5,
  maxZ: 5,
  targetHeight: 0,
  padding: 5
});
assert(padded.getHeight(0, 0) === 0, "Expected padding to include the adjacent terrain cell.");
assert(padded.getHeight(4, 4) === 0, "Expected padding to flatten the outer boundary cell.");

console.log("TerrainHeightFieldFitter tests passed");
