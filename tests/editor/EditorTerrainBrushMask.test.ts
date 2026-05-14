import { TerrainBrushWeightCalculator } from "../../src/editor/terrain/editing/TerrainBrushMask";

const brushWeightCalculator = new TerrainBrushWeightCalculator();

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

function testCircleBrushWeight(): void {
  assert(brushWeightCalculator.getCircleWeight(0, 0, 4, 0.5) > 0.99, "Circle brush center should have near-full weight.");
  assert(brushWeightCalculator.getCircleWeight(5, 0, 4, 0.5) === 0, "Circle brush should not affect points outside the radius.");
}

function testSquareBrushWeight(): void {
  assert(brushWeightCalculator.getSquareWeight(2, 2, 4, 0.25) > 0.9, "Square brush should affect inner points.");
  assert(brushWeightCalculator.getSquareWeight(5, 0, 4, 0.25) === 0, "Square brush should not affect points outside the square radius.");
}

function run(): void {
  testCircleBrushWeight();
  testSquareBrushWeight();
}

run();
console.log("TerrainBrushMask tests passed");
