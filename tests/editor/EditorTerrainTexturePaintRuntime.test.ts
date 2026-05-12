import { MeshBuilder, NullEngine, Scene, StandardMaterial, TransformNode } from "@babylonjs/core";
import { TerrainHeightField } from "../../src/core/world/terrain/TerrainHeightField";
import { TerrainSplatMaterialBuilder, type TerrainSplatMaterialRuntime } from "../../src/core/world/terrain/TerrainSplatMaterialBuilder";
import { TerrainSplatMap } from "../../src/core/world/terrain/editing/TerrainSplatMap";
import type { TerrainTextureLayerDescriptor } from "../../src/core/world/terrain/editing/TerrainTextureLayer";
import { EditorTerrainTexturePaintRuntime } from "../../src/editor/terrain/tools/EditorTerrainTexturePaintRuntime";
import type { EditorTerrainInstance } from "../../src/editor/types";

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

class StubTerrainSplatMaterialBuilder extends TerrainSplatMaterialBuilder {
  private readonly supportedLayerCount: number;

  public constructor(supportedLayerCount: number) {
    super();
    this.supportedLayerCount = supportedLayerCount;
  }

  public override getSupportedLayerCount(): number {
    return this.supportedLayerCount;
  }
}

class ThrowingTerrainSplatMaterialBuilder extends TerrainSplatMaterialBuilder {
  public override getSupportedLayerCount(): number {
    return 2;
  }

  public override build(): TerrainSplatMaterialRuntime {
    throw new Error("synthetic material failure");
  }
}

class CountingTerrainSplatMaterialBuilder extends TerrainSplatMaterialBuilder {
  public updateCount = 0;

  public override getSupportedLayerCount(): number {
    return 6;
  }

  public override build(scene: Scene, mesh: ReturnType<typeof MeshBuilder.CreateGround>): TerrainSplatMaterialRuntime {
    const material = new StandardMaterial("counting-splat-material", scene);
    mesh.material = material;
    return {
      material,
      updateSplatTexture: () => {
        this.updateCount += 1;
      },
      dispose: () => {
        material.dispose();
      }
    } as unknown as TerrainSplatMaterialRuntime;
  }
}

function createLayers(count: number): TerrainTextureLayerDescriptor[] {
  return Array.from({ length: count }, (_unused, index) => ({
    id: `layer-${index}`,
    label: `Layer ${index}`,
    url: `/textures/layer-${index}.png`
  }));
}

function installOffscreenCanvasShim(): void {
  const globals = globalThis as typeof globalThis & { OffscreenCanvas?: unknown };
  if (globals.OffscreenCanvas) {
    return;
  }

  globals.OffscreenCanvas = class TestOffscreenCanvas {
    public width: number;
    public height: number;

    public constructor(width: number, height: number) {
      this.width = width;
      this.height = height;
    }

    public getContext(): unknown {
      return {
        fillStyle: "#ffffff",
        imageSmoothingEnabled: true,
        clearRect: () => undefined,
        drawImage: () => undefined,
        fillRect: () => undefined
      };
    }
  } as unknown as typeof OffscreenCanvas;
}

function createGeneratedTerrainInstance(scene: Scene): {
  readonly terrain: EditorTerrainInstance;
  readonly terrainMesh: ReturnType<typeof MeshBuilder.CreateGround>;
  readonly baseMaterial: StandardMaterial;
} {
  const terrainMesh = MeshBuilder.CreateGround("terrain", { width: 10, height: 10 }, scene);
  const terrainRoot = new TransformNode("terrain-root", scene);
  const baseMaterial = new StandardMaterial("terrain-base", scene);
  terrainMesh.material = baseMaterial;

  return {
    terrainMesh,
    baseMaterial,
    terrain: {
      root: terrainRoot,
      meshes: [terrainMesh],
      renderableMeshes: [terrainMesh],
      helperMeshes: [],
      transformNodes: [terrainRoot],
      skeletons: [],
      animationGroups: [],
      particleSystems: [],
      descriptor: {
        id: "terrain",
        kind: "generated",
        size: [10, 10],
        resolution: [2, 2],
        generator: {
          preset: "test",
          seed: 1,
          height: {
            base: 0,
            amplitude: 0,
            frequency: 1,
            octaves: 1,
            persistence: 0.5,
            lacunarity: 2
          }
        }
      }
    }
  };
}

function testSelectionAllowsLayerAboveFirstSplatChunkWhenSupported(): void {
  const engine = new NullEngine();
  const scene = new Scene(engine);
  const runtime = new EditorTerrainTexturePaintRuntime(
    scene,
    createLayers(6),
    new StubTerrainSplatMaterialBuilder(6)
  );

  const result = runtime.selectLayer("layer-5");

  assert(runtime.getPaintableLayerCount() === 6, "Expected every supported layer to be paintable.");
  assert(result.selected, "Expected selecting layer index 5 to succeed when sampler budget supports it.");
  assert(runtime.getSelectedLayerId() === "layer-5", "Expected selected layer id to update.");

  runtime.dispose();
  scene.dispose();
  engine.dispose();
}

function testSelectionBlocksOnlySamplerLimitedLayers(): void {
  const engine = new NullEngine();
  const scene = new Scene(engine);
  const runtime = new EditorTerrainTexturePaintRuntime(
    scene,
    createLayers(6),
    new StubTerrainSplatMaterialBuilder(4)
  );

  const result = runtime.selectLayer("layer-5");

  assert(runtime.getPaintableLayerCount() === 4, "Expected runtime to expose sampler-supported layer count.");
  assert(!result.selected, "Expected selecting an unsupported layer to fail.");
  assert(
    result.message.includes("texture sampler limit"),
    "Expected unsupported layer message to explain sampler limit."
  );
  assert(
    !result.message.includes("first 4"),
    "Expected unsupported layer message not to use the old hard-coded first 4 wording."
  );

  runtime.dispose();
  scene.dispose();
  engine.dispose();
}

function testDefaultBuilderSupportsCurrentTerrainTextureCountOnSixteenSamplerBudget(): void {
  const engine = new NullEngine();
  const scene = new Scene(engine);
  const builder = new TerrainSplatMaterialBuilder();

  assert(
    builder.getSupportedLayerCount(scene, 19) === 19,
    "Expected the atlas-backed splat material to support all current terrain texture layers on a 16-sampler budget."
  );

  scene.dispose();
  engine.dispose();
}

function testSplatMaterialPluginRegistrationUsesInitializedFields(): void {
  installOffscreenCanvasShim();
  const engine = new NullEngine();
  const scene = new Scene(engine);
  const terrainMesh = MeshBuilder.CreateGround("terrain", { width: 10, height: 10 }, scene);
  const splatMap = new TerrainSplatMap(8, 8, 6);
  const builder = new TerrainSplatMaterialBuilder();

  const runtime = builder.build(scene, terrainMesh, createLayers(6), splatMap, 10, 10);

  assert(runtime.material === terrainMesh.material, "Expected builder to assign the generated material.");
  assert(terrainMesh.receiveShadows, "Expected splat terrain mesh to keep receiving shadows.");

  runtime.dispose();
  scene.dispose();
  engine.dispose();
}

function testResetForTerrainInitializesRealSplatMaterial(): void {
  installOffscreenCanvasShim();
  const engine = new NullEngine();
  const scene = new Scene(engine);
  const { terrain } = createGeneratedTerrainInstance(scene);
  const runtime = new EditorTerrainTexturePaintRuntime(scene, createLayers(6));
  const heightField = TerrainHeightField.createFilled(10, 10, 2, 2, 0);

  runtime.resetForTerrain(terrain, heightField);
  const selection = runtime.selectLayer("layer-5");

  assert(runtime.getPaintableLayerCount() === 6, "Expected resetForTerrain to keep all supported layers paintable.");
  assert(runtime.getLayerLimitMessage() === "", "Expected no layer limit message after successful initialization.");
  assert(selection.selected, "Expected selecting a valid layer above index 3 to succeed after initialization.");

  runtime.dispose();
  scene.dispose();
  engine.dispose();
}

function testPaintUpdatesSplatTextureRuntimePath(): void {
  const engine = new NullEngine();
  const scene = new Scene(engine);
  const { terrain } = createGeneratedTerrainInstance(scene);
  const builder = new CountingTerrainSplatMaterialBuilder();
  const runtime = new EditorTerrainTexturePaintRuntime(scene, createLayers(6), builder);
  const heightField = TerrainHeightField.createFilled(10, 10, 2, 2, 0);

  runtime.resetForTerrain(terrain, heightField);
  runtime.selectLayer("layer-5");
  const result = runtime.paint(
    { x: 0, z: 0 },
    { shape: "circle", radius: 5, strength: 1, falloff: 0 },
    0.25
  );

  assert(result.changedTexelCount > 0, "Expected painting to affect at least one splat texel.");
  assert(builder.updateCount === 1, "Expected painting to update the runtime splat texture.");
  assert(runtime.getPaintableLayerCount() > 4, "Expected more than four layers to remain paintable.");

  runtime.dispose();
  scene.dispose();
  engine.dispose();
}

function testResetForTerrainKeepsSceneMaterialWhenSplatMaterialBuildFails(): void {
  const engine = new NullEngine();
  const scene = new Scene(engine);
  const { terrain, terrainMesh, baseMaterial } = createGeneratedTerrainInstance(scene);
  let baseMaterialDisposed = false;
  const originalDispose = baseMaterial.dispose.bind(baseMaterial);
  baseMaterial.dispose = ((forceDisposeEffect?: boolean, forceDisposeTextures?: boolean, notBoundToMesh?: boolean) => {
    baseMaterialDisposed = true;
    originalDispose(forceDisposeEffect, forceDisposeTextures, notBoundToMesh);
  }) as typeof baseMaterial.dispose;
  const runtime = new EditorTerrainTexturePaintRuntime(
    scene,
    createLayers(2),
    new ThrowingTerrainSplatMaterialBuilder()
  );
  const heightField = TerrainHeightField.createFilled(10, 10, 2, 2, 0);
  const originalConsoleError = console.error;
  console.error = () => undefined;

  try {
    runtime.resetForTerrain(terrain, heightField);
  } finally {
    console.error = originalConsoleError;
  }

  assert(terrainMesh.material === baseMaterial, "Expected failed splat initialization to keep the loaded terrain material.");
  assert(!baseMaterialDisposed, "Expected failed splat initialization not to dispose the loaded terrain material.");
  assert(runtime.getPaintableLayerCount() === 0, "Expected texture painting to be disabled after material initialization fails.");
  assert(
    runtime.getLayerLimitMessage().includes("synthetic material failure"),
    "Expected texture painting failure to be exposed through the terrain tools view model."
  );

  runtime.dispose();
  scene.dispose();
  engine.dispose();
}

function run(): void {
  testSelectionAllowsLayerAboveFirstSplatChunkWhenSupported();
  testSelectionBlocksOnlySamplerLimitedLayers();
  testDefaultBuilderSupportsCurrentTerrainTextureCountOnSixteenSamplerBudget();
  testSplatMaterialPluginRegistrationUsesInitializedFields();
  testResetForTerrainInitializesRealSplatMaterial();
  testPaintUpdatesSplatTextureRuntimePath();
  testResetForTerrainKeepsSceneMaterialWhenSplatMaterialBuildFails();
}

run();
console.log("EditorTerrainTexturePaintRuntime tests passed");
