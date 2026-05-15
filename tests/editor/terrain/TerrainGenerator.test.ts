import { TerrainGenerator } from "../../../src/editor/terrain/generation/TerrainGenerator";
import { WORLD_GRID_ORIGIN_Y, WORLD_VERTICAL_TILE_SIZE } from "../../../src/core/grid/WorldGridConstants";
import { TerrainGeneratorPresetCatalog } from "../../../src/editor/terrain/generation/TerrainGeneratorPresets";
import { TerrainGridAlignedResolutionPolicy } from "../../../src/editor/terrain/generation/TerrainTypes";
const terrainPresetCatalog = new TerrainGeneratorPresetCatalog();

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

function assertClose(actual: number, expected: number, message: string): void {
  const epsilon = 1e-6;
  assert(Math.abs(actual - expected) <= epsilon, `${message}: expected ${expected}, received ${actual}`);
}

function testSameSeedProducesSameHeights(): void {
  const generator = new TerrainGenerator();
  const descriptor = terrainPresetCatalog.createDescriptor({ presetId: "soft-hills", seed: 1234 });
  const first = generator.generate(descriptor);
  const second = generator.generate(descriptor);

  assert(first.heights.length === second.heights.length, "Height arrays should match in length.");
  for (let index = 0; index < first.heights.length; index += 1) {
    assertClose(first.heights[index] ?? 0, second.heights[index] ?? 0, `Height mismatch at ${index}`);
  }
}

function testDifferentSeedChangesTerrain(): void {
  const generator = new TerrainGenerator();
  const first = generator.generate(terrainPresetCatalog.createDescriptor({ presetId: "soft-hills", seed: 111 }));
  const second = generator.generate(terrainPresetCatalog.createDescriptor({ presetId: "soft-hills", seed: 222 }));

  let differenceCount = 0;
  for (let index = 0; index < first.heights.length; index += 1) {
    if (Math.abs((first.heights[index] ?? 0) - (second.heights[index] ?? 0)) > 1e-6) {
      differenceCount += 1;
    }
  }

  assert(differenceCount > first.heights.length * 0.25, "Different seeds should materially change the height field.");
}

function testFlatPresetStaysNearFlat(): void {
  const generator = new TerrainGenerator();
  const field = generator.generate(terrainPresetCatalog.createDescriptor({ presetId: "flat-gray", seed: 77 }));
  assert(field.maxHeight - field.minHeight < 0.5, "Flat preset should stay near-flat.");
}

function testSoftHillsHaveVisibleRange(): void {
  const generator = new TerrainGenerator();
  const field = generator.generate(
    terrainPresetCatalog.createDescriptor({
      presetId: "soft-hills",
      seed: 91,
      size: [400, 400],
      resolution: [65, 65]
    })
  );
  assert(field.maxHeight - field.minHeight > 5, "Soft hills should have a clearly visible height range.");
}

function testRockyRidgesHaveLargeRange(): void {
  const generator = new TerrainGenerator();
  const field = generator.generate(
    terrainPresetCatalog.createDescriptor({
      presetId: "rocky-ridges",
      seed: 92,
      size: [400, 400],
      resolution: [65, 65]
    })
  );
  assert(field.maxHeight - field.minHeight > 20, "Rocky ridges should have a large height range.");
}

function testMountainsHaveVeryLargeRange(): void {
  const generator = new TerrainGenerator();
  const field = generator.generate(
    terrainPresetCatalog.createDescriptor({
      presetId: "mountains",
      seed: 93,
      size: [400, 400],
      resolution: [65, 65]
    })
  );
  assert(field.maxHeight - field.minHeight > 40, "Mountains should have a very large height range.");
}

function testUnknownStrategyFallsBackDeterministically(): void {
  const generator = new TerrainGenerator();
  const descriptor = terrainPresetCatalog.createDescriptor({ presetId: "urban-pad", seed: 909 });
  const withUnknownStrategy = {
    ...descriptor,
    generator: {
      ...descriptor.generator,
      strategy: "unknown-strategy"
    }
  };

  const first = generator.generate(withUnknownStrategy);
  const second = generator.generate(withUnknownStrategy);
  for (let index = 0; index < first.heights.length; index += 1) {
    assertClose(first.heights[index] ?? 0, second.heights[index] ?? 0, `Fallback strategy mismatch at ${index}`);
  }
}

function testGeneratedHeightsAreQuantizedToVerticalGrid(): void {
  const generator = new TerrainGenerator();
  const field = generator.generate(
    terrainPresetCatalog.createDescriptor({
      presetId: "rocky-ridges",
      seed: 404,
      size: [400, 400],
      resolution: [65, 65]
    })
  );

  for (let index = 0; index < field.heights.length; index += 1) {
    const normalized = ((field.heights[index] ?? 0) - WORLD_GRID_ORIGIN_Y) / WORLD_VERTICAL_TILE_SIZE;
    assertClose(normalized, Math.round(normalized), `Height ${index} should be snapped to the vertical grid`);
  }
}

function testGridAlignedResolutionPolicyKeeps200mTerrainAtOneMeterSourceQuads(): void {
  const diagnostics = new TerrainGridAlignedResolutionPolicy().resolveWithDiagnostics([200, 200], 1);

  assert(diagnostics.snappedSize[0] === 200 && diagnostics.snappedSize[1] === 200, "200x200 should already be grid-aligned.");
  assert(diagnostics.quadCounts[0] === 200 && diagnostics.quadCounts[1] === 200, "200x200 should use 200 source quads per axis.");
  assert(diagnostics.resolution[0] === 201 && diagnostics.resolution[1] === 201, "200x200 should use 201x201 source vertices.");
  assertClose(diagnostics.actualQuadSize[0], 1, "200m terrain source quad X should be 1m.");
  assertClose(diagnostics.actualQuadSize[1], 1, "200m terrain source quad Z should be 1m.");
  assertHalfSizeAlignsToGrid(diagnostics.snappedSize[0], 1, "200m X half-size should align to the gameplay grid.");
  assertHalfSizeAlignsToGrid(diagnostics.snappedSize[1], 1, "200m Z half-size should align to the gameplay grid.");
}

function testGridAlignedResolutionPolicySnapsOddMeterSizesUpToEvenQuadCounts(): void {
  const diagnostics = new TerrainGridAlignedResolutionPolicy().resolveWithDiagnostics([201, 201], 1);

  assert(diagnostics.snappedSize[0] === 202 && diagnostics.snappedSize[1] === 202, "201x201 should snap up to 202x202 by tie-up nearest-even policy.");
  assert(diagnostics.quadCounts[0] === 202 && diagnostics.quadCounts[1] === 202, "Snapped quad counts should be even.");
  assert(diagnostics.resolution[0] === 203 && diagnostics.resolution[1] === 203, "202 source quads should use 203 source vertices.");
  assertClose(diagnostics.actualQuadSize[0], 1, "Snapped odd terrain source quad X should be 1m.");
  assertClose(diagnostics.actualQuadSize[1], 1, "Snapped odd terrain source quad Z should be 1m.");
  assertHalfSizeAlignsToGrid(diagnostics.snappedSize[0], 1, "Snapped odd X half-size should align to the gameplay grid.");
  assertHalfSizeAlignsToGrid(diagnostics.snappedSize[1], 1, "Snapped odd Z half-size should align to the gameplay grid.");
}

function testGridAlignedResolutionPolicySupportsRectangularTerrain(): void {
  const diagnostics = new TerrainGridAlignedResolutionPolicy().resolveWithDiagnostics([128, 96], 1);

  assert(diagnostics.resolution[0] === 129, "128m width should use 129 source vertices.");
  assert(diagnostics.resolution[1] === 97, "96m depth should use 97 source vertices.");
  assertClose(diagnostics.actualQuadSize[0], 1, "Rectangular terrain source quad X should be 1m.");
  assertClose(diagnostics.actualQuadSize[1], 1, "Rectangular terrain source quad Z should be 1m.");
}

function testGridAlignedResolutionPolicySupportsHalfMeterGridStep(): void {
  const diagnostics = new TerrainGridAlignedResolutionPolicy().resolveWithDiagnostics([40, 40], 0.5);

  assert(diagnostics.quadCounts[0] === 80 && diagnostics.quadCounts[1] === 80, "40m terrain at 0.5m grid step should use 80 quads per axis.");
  assert(diagnostics.resolution[0] === 81 && diagnostics.resolution[1] === 81, "80 source quads should use 81 source vertices.");
  assertClose(diagnostics.actualQuadSize[0], 0.5, "Half-meter grid source quad X should be 0.5m.");
  assertClose(diagnostics.actualQuadSize[1], 0.5, "Half-meter grid source quad Z should be 0.5m.");
}

function run(): void {
  testSameSeedProducesSameHeights();
  testDifferentSeedChangesTerrain();
  testFlatPresetStaysNearFlat();
  testSoftHillsHaveVisibleRange();
  testRockyRidgesHaveLargeRange();
  testMountainsHaveVeryLargeRange();
  testUnknownStrategyFallsBackDeterministically();
  testGeneratedHeightsAreQuantizedToVerticalGrid();
  testGridAlignedResolutionPolicyKeeps200mTerrainAtOneMeterSourceQuads();
  testGridAlignedResolutionPolicySnapsOddMeterSizesUpToEvenQuadCounts();
  testGridAlignedResolutionPolicySupportsRectangularTerrain();
  testGridAlignedResolutionPolicySupportsHalfMeterGridStep();
}

run();
console.log("TerrainGenerator tests passed");

function assertHalfSizeAlignsToGrid(size: number, gridStep: number, message: string): void {
  const halfSizeInCells = (size * 0.5) / gridStep;
  assertClose(halfSizeInCells, Math.round(halfSizeInCells), message);
}
