import { TerrainGenerator } from "../../../src/core/world/terrain/TerrainGenerator";
import { createGeneratedTerrainDescriptorFromPreset } from "../../../src/core/world/terrain/TerrainGeneratorPresets";

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
  const descriptor = createGeneratedTerrainDescriptorFromPreset({ presetId: "soft-hills", seed: 1234 });
  const first = generator.generate(descriptor);
  const second = generator.generate(descriptor);

  assert(first.heights.length === second.heights.length, "Height arrays should match in length.");
  for (let index = 0; index < first.heights.length; index += 1) {
    assertClose(first.heights[index] ?? 0, second.heights[index] ?? 0, `Height mismatch at ${index}`);
  }
}

function testDifferentSeedChangesTerrain(): void {
  const generator = new TerrainGenerator();
  const first = generator.generate(createGeneratedTerrainDescriptorFromPreset({ presetId: "soft-hills", seed: 111 }));
  const second = generator.generate(createGeneratedTerrainDescriptorFromPreset({ presetId: "soft-hills", seed: 222 }));

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
  const field = generator.generate(createGeneratedTerrainDescriptorFromPreset({ presetId: "flat-gray", seed: 77 }));
  assert(field.maxHeight - field.minHeight < 0.5, "Flat preset should stay near-flat.");
}

function testSoftHillsHaveVisibleRange(): void {
  const generator = new TerrainGenerator();
  const field = generator.generate(
    createGeneratedTerrainDescriptorFromPreset({
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
    createGeneratedTerrainDescriptorFromPreset({
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
    createGeneratedTerrainDescriptorFromPreset({
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
  const descriptor = createGeneratedTerrainDescriptorFromPreset({ presetId: "urban-pad", seed: 909 });
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

function run(): void {
  testSameSeedProducesSameHeights();
  testDifferentSeedChangesTerrain();
  testFlatPresetStaysNearFlat();
  testSoftHillsHaveVisibleRange();
  testRockyRidgesHaveLargeRange();
  testMountainsHaveVeryLargeRange();
  testUnknownStrategyFallsBackDeterministically();
}

run();
console.log("TerrainGenerator tests passed");
