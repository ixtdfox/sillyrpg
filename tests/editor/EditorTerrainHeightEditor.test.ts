import { TerrainHeightEditor } from "../../src/editor/terrain/editing/TerrainHeightEditor";
import { TerrainHeightSampler } from "../../src/editor/terrain/editing/TerrainHeightSampler";
import { TerrainHeightField } from "../../src/core/world/terrain/TerrainHeightField";
import type { TerrainToolSettings } from "../../src/editor/terrain/editing/TerrainBrushTypes";

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

const DEFAULT_SETTINGS: TerrainToolSettings = {
  tool: "raise",
  brush: {
    shape: "circle",
    radius: 4,
    strength: 10,
    falloff: 0.5
  },
  targetHeight: 0,
  snapHeightStep: 1
};

function testRaiseAndLower(): void {
  const editor = new TerrainHeightEditor();
  const field = TerrainHeightField.createFilled(8, 8, 5, 5, 0);
  const raised = editor.raise(field, { x: 0, z: 0 }, DEFAULT_SETTINGS, 0.2);
  const lowered = editor.lower(raised, { x: 0, z: 0 }, DEFAULT_SETTINGS, 0.2);
  const centerIndex = Math.floor(raised.heights.length / 2);
  assert((raised.heights[centerIndex] ?? 0) > 0, "Raise should increase center heights.");
  assert((lowered.heights[centerIndex] ?? 0) < (raised.heights[centerIndex] ?? 0), "Lower should decrease center heights.");
  assert((raised.heights[0] ?? 0) === 0, "Outside the brush should stay unchanged.");
}

function testSmoothMovesSpikeTowardAverage(): void {
  const editor = new TerrainHeightEditor();
  const sampler = new TerrainHeightSampler();
  const heights = new Float32Array(25);
  heights[12] = 10;
  const field = new TerrainHeightField(8, 8, 5, 5, heights);
  const smoothed = editor.smooth(field, { x: 0, z: 0 }, DEFAULT_SETTINGS, 0.2);
  assert((smoothed.heights[12] ?? 0) < 10, "Smooth should reduce a sharp spike.");
  assert(sampler.sampleNearest(smoothed, { x: 0, z: 0 }) < 10, "Sampler should observe the smoothed center.");
}

function testFlattenModesAndFlattenAll(): void {
  const editor = new TerrainHeightEditor();
  const heights = new Float32Array(25);
  heights[12] = 8;
  const field = new TerrainHeightField(8, 8, 5, 5, heights);
  const flattened = editor.flattenToHeight(field, { x: 0, z: 0 }, DEFAULT_SETTINGS, 3, 0.2);
  assert((flattened.heights[12] ?? 0) < 8, "Flatten should move heights toward the target.");
  const flatAll = editor.flattenAll(flattened, 2);
  for (let index = 0; index < flatAll.heights.length; index += 1) {
    assert((flatAll.heights[index] ?? 0) === 2, "Flatten all should reset every height.");
  }
}

function testQuantization(): void {
  const editor = new TerrainHeightEditor();
  const heights = new Float32Array([0.49, 0.51, 1.49, 1.51, 2.4, 2.6, 3.2, 3.8, -0.6]);
  const field = new TerrainHeightField(3, 3, 3, 3, heights);
  const quantized = editor.quantizeHeights(field, 1);
  assert((quantized.heights[0] ?? 0) === 0, "0.49 should snap to 0.");
  assert((quantized.heights[1] ?? 0) === 1, "0.51 should snap to 1.");
  assert((quantized.heights[8] ?? 0) === -1, "-0.6 should snap to -1.");
}

function run(): void {
  testRaiseAndLower();
  testSmoothMovesSpikeTowardAverage();
  testFlattenModesAndFlattenAll();
  testQuantization();
}

run();
console.log("TerrainHeightEditor tests passed");
