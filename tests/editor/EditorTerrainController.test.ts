import type { EditorSceneLoader } from "../../src/editor/EditorSceneLoader";
import { EditorSceneDocument } from "../../src/editor/state/EditorSceneDocument";
import { EditorTerrainController } from "../../src/editor/terrain/EditorTerrainController";
import { TerrainGeneratorPresetCatalog } from "../../src/editor/terrain/generation/TerrainGeneratorPresets";
import type { SceneDescriptor, SceneGeneratedTerrainDescriptor } from "../../src/core/world/scene/SceneDescriptor";

const terrainPresetCatalog = new TerrainGeneratorPresetCatalog();

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

function testGridFollowingDraftRecalculatesResolutionWhenSizeChanges(): void {
  const terrain = terrainPresetCatalog.createDescriptor({
    presetId: "flat-gray",
    size: [40, 40]
  });
  const { controller } = createBoundController(terrain);
  const draft = controller.getViewModel().descriptor!;

  controller.updateDraft({
    ...draft,
    size: [200, 200]
  });

  const normalized = controller.getViewModel().descriptor!;
  assert(normalized.resolutionMode === "gridStep", "Expected draft to remain in grid-following mode.");
  assert(normalized.size[0] === 200 && normalized.size[1] === 200, "Expected 200x200 to remain grid-aligned.");
  assert(normalized.resolution[0] === 201, "Expected width resize to recalculate resolutionX.");
  assert(normalized.resolution[1] === 201, "Expected depth resize to recalculate resolutionZ.");
}

function testManualDraftPreservesExplicitResolutionWhenSizeChanges(): void {
  const terrain = terrainPresetCatalog.createDescriptor({
    presetId: "flat-gray",
    size: [40, 40]
  });
  const { controller } = createBoundController(terrain);
  const draft = controller.getViewModel().descriptor!;

  controller.updateDraft({
    ...draft,
    resolutionMode: "manual",
    size: [200, 200],
    resolution: [41, 41]
  });

  const normalized = controller.getViewModel().descriptor!;
  assert(normalized.resolutionMode === "manual", "Expected manual resolution mode to be preserved.");
  assert(normalized.size[0] === 200 && normalized.size[1] === 200, "Expected manual mode to preserve typed size.");
  assert(normalized.resolution[0] === 41, "Expected manual mode to preserve resolutionX.");
  assert(normalized.resolution[1] === 41, "Expected manual mode to preserve resolutionZ.");
  assert(
    controller.getViewModel().message?.includes("Source quads are 5.00 x 5.00m") === true,
    "Expected manual low source density to be visible in editor status."
  );
}

function testGridFollowingDraftClearsEditedMapsWhenResolutionChanges(): void {
  const baseTerrain = terrainPresetCatalog.createDescriptor({
    presetId: "flat-gray",
    size: [40, 40]
  });
  const terrain: SceneGeneratedTerrainDescriptor = {
    ...baseTerrain,
    editedHeightMap: {
      encoding: "array",
      resolution: baseTerrain.resolution,
      heights: Array.from({ length: baseTerrain.resolution[0] * baseTerrain.resolution[1] }, () => 0)
    },
    editedTextureMap: {
      encoding: "splatRgba8",
      resolution: [4, 4],
      layers: ["grass"],
      weights: ["assets/generated/terrain/test-scene/terrain-0_splat_0.png"]
    }
  };
  const { controller } = createBoundController(terrain);
  const draft = controller.getViewModel().descriptor!;

  controller.updateDraft({
    ...draft,
    size: [200, 200]
  });

  const normalized = controller.getViewModel().descriptor!;
  assert(normalized.editedHeightMap === undefined, "Expected incompatible edited height map to be cleared.");
  assert(normalized.editedTextureMap === undefined, "Expected incompatible edited texture map to be cleared.");
  assert(
    controller.getViewModel().message?.includes("Incompatible edited height and texture maps were cleared") === true,
    "Expected editor status to mention cleared edited terrain maps."
  );
}

function createBoundController(terrain: SceneGeneratedTerrainDescriptor): {
  readonly controller: EditorTerrainController;
  readonly document: EditorSceneDocument;
} {
  const document = new EditorSceneDocument("test-scene.json", createSceneDescriptor(terrain));
  const controller = new EditorTerrainController({
    onChanged: () => {},
    onTerrainApplied: () => {},
    onStatusMessageChanged: () => {}
  });
  const loader = {
    setTerrain: async () => undefined
  } as unknown as EditorSceneLoader;
  controller.bind(document, loader);
  return { controller, document };
}

function createSceneDescriptor(terrain: SceneGeneratedTerrainDescriptor): SceneDescriptor {
  return {
    schemaVersion: 2,
    id: "test-scene",
    terrain,
    objects: []
  };
}

function run(): void {
  testGridFollowingDraftRecalculatesResolutionWhenSizeChanges();
  testManualDraftPreservesExplicitResolutionWhenSizeChanges();
  testGridFollowingDraftClearsEditedMapsWhenResolutionChanges();
}

run();
console.log("EditorTerrainController tests passed");
