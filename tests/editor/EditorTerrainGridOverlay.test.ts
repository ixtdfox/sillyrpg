import { NullEngine, Scene } from "@babylonjs/core";
import { EditorTerrainGridOverlay } from "../../src/editor/terrain/EditorTerrainGridOverlay";
import { TerrainHeightField } from "../../src/core/world/terrain/TerrainHeightField";
import { TerrainMeshBuilder } from "../../src/core/world/terrain/TerrainMeshBuilder";
import type { SceneGeneratedTerrainDescriptor } from "../../src/core/world/scene/SceneDescriptor";
import { RECT_TILE_SIZE } from "../../src/core/grid/WorldGridConstants";
import { TerrainGeneratorPresetCatalog } from "../../src/editor/terrain/generation/TerrainGeneratorPresets";

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

function run(): void {
  testGeneratedTerrainGridCreatesEditorOnlyLineMesh();
  testGeneratedTerrainGridIgnoresVisualOnlyTerrainMeshes();
  testGeneratedTerrainGridVerticesAlignToGameplayGrid();
}

run();
console.log("EditorTerrainGridOverlay tests passed");

function testGeneratedTerrainGridCreatesEditorOnlyLineMesh(): void {
  const engine = new NullEngine();
  const scene = new Scene(engine);
  const heightField = TerrainHeightField.createFilled(8, 8, 3, 3, 0);
  const descriptor = createGeneratedTerrainDescriptor();
  const mesh = new TerrainMeshBuilder().build(scene, descriptor, heightField);
  mesh.metadata = {
    ...(mesh.metadata as Record<string, unknown> | undefined),
    generatedTerrainDescriptor: descriptor,
    generatedTerrainHeightField: heightField,
    terrainSurfaceCanonical: true
  };

  const overlay = new EditorTerrainGridOverlay(scene);
  const isVisible = overlay.setGridVisible(true, [mesh]);
  const gridMesh = scene.meshes.find((candidate) => candidate.metadata?.terrainKind === "editor-generated-terrain-grid");

  assert(isVisible, "Generated terrain grid should become visible for canonical generated terrain.");
  assert(gridMesh !== undefined, "Generated terrain grid should create a line mesh.");
  assert(gridMesh?.isPickable === false, "Generated terrain grid should not be pickable.");
  assert(gridMesh?.checkCollisions === false, "Generated terrain grid should not participate in collisions.");
  assert(gridMesh?.metadata?.terrainVisualOnly === true, "Generated terrain grid should be marked visual-only.");
  assert(gridMesh?.metadata?.terrainSurfaceCanonical === false, "Generated terrain grid should not be canonical terrain.");
  assert(gridMesh?.metadata?.editorHelper === true, "Generated terrain grid should be marked as an editor helper.");

  overlay.setGridVisible(false, [mesh]);
  assert(!overlay.getGridVisible(), "Generated terrain grid should hide cleanly.");
  assert(
    scene.meshes.every((candidate) => candidate.metadata?.terrainKind !== "editor-generated-terrain-grid"),
    "Generated terrain grid line mesh should be disposed when hidden."
  );

  overlay.dispose();
  scene.dispose();
  engine.dispose();
}

function testGeneratedTerrainGridIgnoresVisualOnlyTerrainMeshes(): void {
  const engine = new NullEngine();
  const scene = new Scene(engine);
  const heightField = TerrainHeightField.createFilled(8, 8, 3, 3, 0);
  const descriptor = createGeneratedTerrainDescriptor();
  const mesh = new TerrainMeshBuilder().build(scene, descriptor, heightField);
  mesh.metadata = {
    ...(mesh.metadata as Record<string, unknown> | undefined),
    generatedTerrainDescriptor: descriptor,
    generatedTerrainHeightField: heightField,
    terrainSurfaceCanonical: false,
    terrainVisualOnly: true
  };

  const overlay = new EditorTerrainGridOverlay(scene);
  assert(!overlay.getCanShowTerrainGrid([mesh]), "Visual-only terrain meshes should not be valid editor terrain grid sources.");
  assert(!overlay.setGridVisible(true, [mesh]), "Visual-only terrain meshes should not create an editor terrain grid.");

  overlay.dispose();
  scene.dispose();
  engine.dispose();
}

function testGeneratedTerrainGridVerticesAlignToGameplayGrid(): void {
  const engine = new NullEngine();
  const scene = new Scene(engine);
  const descriptor = new TerrainGeneratorPresetCatalog().createDescriptor({
    presetId: "flat-gray",
    size: [6, 4]
  });
  const heightField = TerrainHeightField.createFilled(
    descriptor.size[0],
    descriptor.size[1],
    descriptor.resolution[0],
    descriptor.resolution[1],
    0
  );
  const mesh = new TerrainMeshBuilder().build(scene, descriptor, heightField);
  mesh.metadata = {
    ...(mesh.metadata as Record<string, unknown> | undefined),
    generatedTerrainDescriptor: descriptor,
    generatedTerrainHeightField: heightField,
    terrainSurfaceCanonical: true
  };

  const overlay = new EditorTerrainGridOverlay(scene);
  overlay.setGridVisible(true, [mesh]);
  const gridMesh = scene.meshes.find((candidate) => candidate.metadata?.terrainKind === "editor-generated-terrain-grid");
  const positions = gridMesh?.getVerticesData("position") ?? [];

  assert(positions.length > 0, "Generated terrain grid should expose vertex positions for alignment checks.");
  for (let index = 0; index < positions.length; index += 3) {
    assertGridAligned(positions[index] ?? 0, `Terrain grid X position ${index / 3} should align to gameplay grid.`);
    assertGridAligned(positions[index + 2] ?? 0, `Terrain grid Z position ${index / 3} should align to gameplay grid.`);
  }

  overlay.dispose();
  scene.dispose();
  engine.dispose();
}

function createGeneratedTerrainDescriptor(): SceneGeneratedTerrainDescriptor {
  return {
    id: "terrain-0",
    kind: "generated",
    size: [8, 8],
    resolution: [3, 3],
    generator: {
      preset: "flat-gray",
      strategy: "flat",
      seed: 1,
      height: {
        base: 0,
        amplitude: 0,
        frequency: 0.1,
        octaves: 1,
        persistence: 0.5,
        lacunarity: 2
      }
    },
    material: {
      kind: "flat",
      color: "#8D9298"
    }
  };
}

function assertGridAligned(value: number, message: string): void {
  const normalized = value / RECT_TILE_SIZE;
  assert(Math.abs(normalized - Math.round(normalized)) < 1e-6, `${message} Received ${value}.`);
}
