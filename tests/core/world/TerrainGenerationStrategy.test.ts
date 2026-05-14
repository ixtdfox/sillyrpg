import { TerrainGenerationContext } from "../../../src/core/world/terrain/TerrainGenerationContext";
import { FlatTerrainStrategy } from "../../../src/core/world/terrain/strategies/FlatTerrainStrategy";
import { IslandPlateauTerrainStrategy } from "../../../src/core/world/terrain/strategies/IslandPlateauTerrainStrategy";
import { MountainsTerrainStrategy } from "../../../src/core/world/terrain/strategies/MountainsTerrainStrategy";
import { NoiseTerrainStrategy } from "../../../src/core/world/terrain/strategies/NoiseTerrainStrategy";
import { RockyRidgesTerrainStrategy } from "../../../src/core/world/terrain/strategies/RockyRidgesTerrainStrategy";
import { UrbanPadTerrainStrategy } from "../../../src/core/world/terrain/strategies/UrbanPadTerrainStrategy";
import { TerrainGeneratorPresetCatalog } from "../../../src/core/world/terrain/TerrainGeneratorPresets";
const terrainPresetCatalog = new TerrainGeneratorPresetCatalog();

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

function testEachStrategyProducesFiniteHeightField(): void {
  const cases = [
    ["flat", new FlatTerrainStrategy(), terrainPresetCatalog.createDescriptor({ presetId: "flat-gray", seed: 10 })],
    ["noise", new NoiseTerrainStrategy(), terrainPresetCatalog.createDescriptor({ presetId: "soft-hills", seed: 11 })],
    [
      "urbanPad",
      new UrbanPadTerrainStrategy(),
      terrainPresetCatalog.createDescriptor({ presetId: "urban-pad", seed: 12 })
    ],
    [
      "islandPlateau",
      new IslandPlateauTerrainStrategy(),
      terrainPresetCatalog.createDescriptor({ presetId: "island-plateau", seed: 13 })
    ],
    [
      "rockyRidges",
      new RockyRidgesTerrainStrategy(),
      terrainPresetCatalog.createDescriptor({ presetId: "rocky-ridges", seed: 14 })
    ],
    [
      "mountains",
      new MountainsTerrainStrategy(),
      terrainPresetCatalog.createDescriptor({ presetId: "mountains", seed: 15 })
    ]
  ] as const;

  for (const [strategyId, strategy, descriptor] of cases) {
    const context = new TerrainGenerationContext(
      {
        ...descriptor,
        generator: {
          ...descriptor.generator,
          strategy: strategyId
        }
      },
      strategyId
    );
    const field = strategy.generate(context);
    assert(field.resolutionX === descriptor.resolution[0], `${strategyId} should preserve resolutionX.`);
    assert(field.resolutionZ === descriptor.resolution[1], `${strategyId} should preserve resolutionZ.`);
    for (let index = 0; index < field.heights.length; index += 1) {
      assert(Number.isFinite(field.heights[index]), `${strategyId} produced non-finite height at ${index}.`);
    }
  }
}

function testIslandStrategyKeepsCenterHigherThanEdges(): void {
  const descriptor = terrainPresetCatalog.createDescriptor({ presetId: "island-plateau", seed: 77 });
  const context = new TerrainGenerationContext(descriptor, "islandPlateau");
  const field = new IslandPlateauTerrainStrategy().generate(context);
  const center = field.getHeight(Math.floor(field.resolutionX / 2), Math.floor(field.resolutionZ / 2));
  const edge = field.getHeight(0, 0);
  assert(center > edge, "Island strategy should keep the center higher than the far edge.");
}

function testFlatStrategyVariationStaysSmall(): void {
  const descriptor = terrainPresetCatalog.createDescriptor({ presetId: "flat-gray", seed: 88 });
  const context = new TerrainGenerationContext(descriptor, "flat");
  const field = new FlatTerrainStrategy().generate(context);
  assert(field.maxHeight - field.minHeight < 0.5, "Flat strategy should stay near-flat.");
}

function run(): void {
  testEachStrategyProducesFiniteHeightField();
  testIslandStrategyKeepsCenterHigherThanEdges();
  testFlatStrategyVariationStaysSmall();
}

run();
console.log("Terrain generation strategy tests passed");
