import { TerrainGenerationContext } from "../../../src/editor/terrain/generation/TerrainGenerationContext";
import { TerrainHeightField } from "../../../src/core/world/terrain/TerrainHeightField";
import { TerrainCenterFlattenModifier } from "../../../src/editor/terrain/generation/modifiers/TerrainCenterFlattenModifier";
import { TerrainFalloffModifier } from "../../../src/editor/terrain/generation/modifiers/TerrainFalloffModifier";
import { TerrainSmoothModifier } from "../../../src/editor/terrain/generation/modifiers/TerrainSmoothModifier";
import { TerrainTerraceModifier } from "../../../src/editor/terrain/generation/modifiers/TerrainTerraceModifier";
import { TerrainGeneratorPresetCatalog } from "../../../src/editor/terrain/generation/TerrainGeneratorPresets";
const terrainPresetCatalog = new TerrainGeneratorPresetCatalog();

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

function testModifiersKeepHeightsFinite(): void {
  const descriptor = terrainPresetCatalog.createDescriptor({ presetId: "rocky-ridges", seed: 301 });
  const context = new TerrainGenerationContext(descriptor, "rockyRidges");
  const heights = new Float32Array(context.resolutionX * context.resolutionZ);
  for (let iz = 0; iz < context.resolutionZ; iz += 1) {
    for (let ix = 0; ix < context.resolutionX; ix += 1) {
      heights[context.getIndex(ix, iz)] = context.baseHeight + (ix + iz) * 0.05;
    }
  }

  const source = new TerrainHeightField(context.width, context.depth, context.resolutionX, context.resolutionZ, heights);
  const modified = new TerrainSmoothModifier().apply(
    new TerrainTerraceModifier().apply(
      new TerrainCenterFlattenModifier().apply(new TerrainFalloffModifier().apply(source, context), context),
      context
    ),
    context
  );

  for (let index = 0; index < modified.heights.length; index += 1) {
    assert(Number.isFinite(modified.heights[index]), `Modifier stack produced non-finite height at ${index}.`);
  }
}

function testFalloffModifierLowersEdgesComparedToCenter(): void {
  const descriptor = terrainPresetCatalog.createDescriptor({ presetId: "island-plateau", seed: 401 });
  const context = new TerrainGenerationContext(descriptor, "islandPlateau");
  const source = TerrainHeightField.createFilled(context.width, context.depth, context.resolutionX, context.resolutionZ, 4);
  const modified = new TerrainFalloffModifier().apply(source, context);
  const center = modified.getHeight(Math.floor(modified.resolutionX / 2), Math.floor(modified.resolutionZ / 2));
  const edge = modified.getHeight(0, 0);
  assert(center > edge, "Falloff modifier should reduce edge heights relative to the center.");
}

function run(): void {
  testModifiersKeepHeightsFinite();
  testFalloffModifierLowersEdgesComparedToCenter();
}

run();
console.log("Terrain modifier tests passed");
