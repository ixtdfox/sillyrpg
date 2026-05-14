import { NullEngine, Scene, TransformNode } from "@babylonjs/core";
import { EditorTerrainContentImporter } from "../../../src/editor/terrain/generation/EditorTerrainContentImporter";
import { TerrainGeneratorPresetCatalog } from "../../../src/editor/terrain/generation/TerrainGeneratorPresets";

const terrainPresetCatalog = new TerrainGeneratorPresetCatalog();

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

async function testGeneratedTerrainContentCreatesPickableMesh(): Promise<void> {
  const engine = new NullEngine();
  const scene = new Scene(engine);
  const parent = new TransformNode("parent", scene);
  const descriptor = terrainPresetCatalog.createDescriptor({ presetId: "urban-pad", seed: 55 });
  const result = await new EditorTerrainContentImporter().import(scene, descriptor, parent, "test");
  const mesh = result.renderableMeshes[0];

  assert(result.renderableMeshes.length === 1, "Generated terrain should create one renderable mesh.");
  assert(mesh?.isPickable === true, "Generated terrain mesh should be pickable in editor.");
  assert(mesh?.metadata?.terrainKind === "generated", "Generated terrain mesh should carry terrain metadata.");
  assert(mesh?.metadata?.generatedTerrainHeightField !== undefined, "Generated terrain mesh should expose editor heightfield metadata.");

  scene.dispose();
  engine.dispose();
}

async function testGeneratedTerrainContentUsesEditedHeightMap(): Promise<void> {
  const engine = new NullEngine();
  const scene = new Scene(engine);
  const parent = new TransformNode("parent", scene);
  const descriptor = {
    ...terrainPresetCatalog.createDescriptor({ presetId: "urban-pad", seed: 55, size: [8, 8], resolution: [9, 9] }),
    editedHeightMap: {
      encoding: "array" as const,
      resolution: [9, 9] as const,
      heights: Array.from({ length: 81 }, (_, index) => (index === 40 ? 5 : 0))
    }
  };
  const result = await new EditorTerrainContentImporter().import(scene, descriptor, parent, "test");
  const mesh = result.renderableMeshes[0];
  const bounds = mesh?.getBoundingInfo().boundingBox;

  assert((bounds?.maximumWorld.y ?? 0) >= 5, "Edited heightmap should affect generated terrain mesh height.");

  scene.dispose();
  engine.dispose();
}

async function run(): Promise<void> {
  await testGeneratedTerrainContentCreatesPickableMesh();
  await testGeneratedTerrainContentUsesEditedHeightMap();
}

Promise.resolve(run()).then(() => {
  console.log("EditorTerrainContentImporter tests passed");
});
