import { getBrushWeightCircle, getBrushWeightSquare } from "../../../src/core/world/terrain/editing/TerrainBrushMask";

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

function testCircleBrushWeight(): void {
  assert(getBrushWeightCircle(0, 0, 4, 0.5) > 0.99, "Circle brush center should have near-full weight.");
  assert(getBrushWeightCircle(5, 0, 4, 0.5) === 0, "Circle brush should not affect points outside the radius.");
}

function testSquareBrushWeight(): void {
  assert(getBrushWeightSquare(2, 2, 4, 0.25) > 0.9, "Square brush should affect inner points.");
  assert(getBrushWeightSquare(5, 0, 4, 0.25) === 0, "Square brush should not affect points outside the square radius.");
}

function run(): void {
  testCircleBrushWeight();
  testSquareBrushWeight();
}

run();
console.log("TerrainBrushMask tests passed");
