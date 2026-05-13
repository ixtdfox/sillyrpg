import { parseSceneDescriptor } from "../../../src/core/world/scene/SceneDescriptor";

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

function testParserAcceptsGeneratedTerrain(): void {
  const descriptor = parseSceneDescriptor(
    {
      schemaVersion: 2,
      id: "generated-scene",
      terrain: {
        id: "terrain-0",
        kind: "generated",
        size: [40, 40],
        resolution: [65, 65],
        position: [0, 0, 0],
        rotation: [0, 0, 0],
        scale: [1, 1, 1],
        normalMode: "flat",
        generator: {
          preset: "urban-pad",
          seed: 101,
          height: {
            base: 0,
            amplitude: 0.6,
            frequency: 0.1,
            octaves: 3,
            persistence: 0.4,
            lacunarity: 2
          },
          falloff: {
            enabled: true,
            mode: "edgeFade",
            radius: 0.8,
            strength: 0.3
          },
          shaping: {
            flattenCenter: true,
            centerRadius: 0.45,
            terraceSteps: 0,
            smoothPasses: 2
          }
        },
        material: {
          kind: "flat",
          color: "#8D9298",
          emissive: null
        }
      },
      objects: []
    },
    "generated terrain test"
  );

  assert(descriptor.terrain?.kind === "generated", "Expected generated terrain kind.");
  assert(descriptor.terrain?.kind === "generated" && descriptor.terrain.normalMode === "flat", "Expected normal mode to parse.");
}

function testParserRejectsInvalidResolution(): void {
  let threw = false;
  try {
    parseSceneDescriptor(
      {
        schemaVersion: 2,
        id: "bad-generated-scene",
        terrain: {
          id: "terrain-0",
          kind: "generated",
          size: [40, 40],
          resolution: [64, 65],
          generator: {
            preset: "urban-pad",
            seed: 1,
            height: {
              base: 0,
              amplitude: 1,
              frequency: 0.1,
              octaves: 3,
              persistence: 0.4,
              lacunarity: 2
            }
          }
        },
        objects: []
      },
      "invalid generated terrain"
    );
  } catch (error) {
    threw = (error as Error).message.includes("odd integer values");
  }

  assert(threw, "Expected invalid generated resolution to throw.");
}

function testParserRejectsNaNGeneratorParams(): void {
  let threw = false;
  try {
    parseSceneDescriptor(
      {
        schemaVersion: 2,
        id: "bad-generated-scene",
        terrain: {
          id: "terrain-0",
          kind: "generated",
          size: [40, 40],
          resolution: [65, 65],
          generator: {
            preset: "urban-pad",
            seed: 1,
            height: {
              base: 0,
              amplitude: Number.NaN,
              frequency: 0.1,
              octaves: 3,
              persistence: 0.4,
              lacunarity: 2
            }
          }
        },
        objects: []
      },
      "invalid generated terrain"
    );
  } catch (error) {
    threw = (error as Error).message.includes("amplitude");
  }

  assert(threw, "Expected NaN amplitude to throw.");
}

function testParserAcceptsKnownStrategy(): void {
  const descriptor = parseSceneDescriptor(
    {
      schemaVersion: 2,
      id: "known-strategy-scene",
      terrain: {
        id: "terrain-0",
        kind: "generated",
        size: [40, 40],
        resolution: [65, 65],
        generator: {
          preset: "urban-pad",
          strategy: "urbanPad",
          seed: 1,
          height: {
            base: 0,
            amplitude: 1,
            frequency: 0.1,
            octaves: 3,
            persistence: 0.4,
            lacunarity: 2
          }
        }
      },
      objects: []
    },
    "known strategy"
  );

  assert(descriptor.terrain?.kind === "generated", "Expected generated terrain kind.");
  assert(descriptor.terrain?.kind === "generated" && descriptor.terrain.generator.strategy === "urbanPad", "Expected strategy to parse.");
}

function testParserAllowsUnknownStrategyString(): void {
  const descriptor = parseSceneDescriptor(
    {
      schemaVersion: 2,
      id: "unknown-strategy-scene",
      terrain: {
        id: "terrain-0",
        kind: "generated",
        size: [40, 40],
        resolution: [65, 65],
        generator: {
          preset: "urban-pad",
          strategy: "future-strategy",
          seed: 1,
          height: {
            base: 0,
            amplitude: 1,
            frequency: 0.1,
            octaves: 3,
            persistence: 0.4,
            lacunarity: 2
          }
        }
      },
      objects: []
    },
    "unknown strategy"
  );

  assert(descriptor.terrain?.kind === "generated", "Expected generated terrain kind.");
  assert(
    descriptor.terrain?.kind === "generated" && descriptor.terrain.generator.strategy === "future-strategy",
    "Expected unknown strategy to be preserved."
  );
}

function testParserAcceptsEditedHeightMap(): void {
  const descriptor = parseSceneDescriptor(
    {
      schemaVersion: 2,
      id: "edited-heightmap-scene",
      terrain: {
        id: "terrain-0",
        kind: "generated",
        size: [40, 40],
        resolution: [65, 65],
        generator: {
          preset: "urban-pad",
          seed: 1,
          height: {
            base: 0,
            amplitude: 1,
            frequency: 0.1,
            octaves: 3,
            persistence: 0.4,
            lacunarity: 2
          }
        },
        editedHeightMap: {
          encoding: "array",
          resolution: [65, 65],
          heights: Array.from({ length: 65 * 65 }, (_, index) => (index % 3) - 1)
        }
      },
      objects: []
    },
    "edited heightmap"
  );

  assert(
    descriptor.terrain?.kind === "generated" && descriptor.terrain.editedHeightMap?.heights.length === 65 * 65,
    "Expected edited heightmap to parse."
  );
}

function testParserAcceptsBakedTextureTerrainMaterial(): void {
  const descriptor = parseSceneDescriptor(
    {
      schemaVersion: 2,
      id: "baked-terrain-scene",
      terrain: {
        id: "terrain-0",
        kind: "generated",
        size: [40, 40],
        resolution: [65, 65],
        generator: {
          preset: "urban-pad",
          seed: 1,
          height: {
            base: 0,
            amplitude: 1,
            frequency: 0.1,
            octaves: 3,
            persistence: 0.4,
            lacunarity: 2
          }
        },
        material: {
          kind: "bakedTexture",
          texture: "assets/generated/terrain/baked-terrain-scene/terrain-0_albedo.png",
          uvScale: [1, 1]
        }
      },
      objects: []
    },
    "baked texture material"
  );

  assert(descriptor.terrain?.kind === "generated", "Expected generated terrain kind.");
  assert(
    descriptor.terrain?.kind === "generated" && descriptor.terrain.material?.kind === "bakedTexture",
    "Expected baked terrain material to parse."
  );
}

function testParserAcceptsEditedTextureMap(): void {
  const descriptor = parseSceneDescriptor(
    {
      schemaVersion: 2,
      id: "edited-texture-map-scene",
      terrain: {
        id: "terrain-0",
        kind: "generated",
        size: [40, 40],
        resolution: [65, 65],
        generator: {
          preset: "urban-pad",
          seed: 1,
          height: {
            base: 0,
            amplitude: 1,
            frequency: 0.1,
            octaves: 3,
            persistence: 0.4,
            lacunarity: 2
          }
        },
        editedTextureMap: {
          encoding: "splatRgba8",
          resolution: [256, 256],
          layers: ["grass", "dirt"],
          weights: ["assets/generated/terrain/edited-texture-map-scene/terrain-0_splat_0.png"],
          bakedTexture: "assets/generated/terrain/edited-texture-map-scene/terrain-0_albedo.png",
          bakeResolution: [2048, 2048]
        }
      },
      objects: []
    },
    "edited texture map"
  );

  assert(
    descriptor.terrain?.kind === "generated" && descriptor.terrain.editedTextureMap?.weights.length === 1,
    "Expected edited texture map to parse."
  );
}

function testParserRejectsUnsafeBakedTexturePath(): void {
  let threw = false;
  try {
    parseSceneDescriptor(
      {
        schemaVersion: 2,
        id: "bad-baked-terrain-scene",
        terrain: {
          id: "terrain-0",
          kind: "generated",
          size: [40, 40],
          resolution: [65, 65],
          generator: {
            preset: "urban-pad",
            seed: 1,
            height: {
              base: 0,
              amplitude: 1,
              frequency: 0.1,
              octaves: 3,
              persistence: 0.4,
              lacunarity: 2
            }
          },
          material: {
            kind: "bakedTexture",
            texture: "assets/generated/terrain/../../oops.png"
          }
        },
        objects: []
      },
      "bad baked texture material"
    );
  } catch (error) {
    threw = (error as Error).message.includes("assets/generated/terrain");
  }

  assert(threw, "Expected unsafe baked terrain texture path to throw.");
}

function testParserRejectsUnsafeEditedTextureMapPath(): void {
  let threw = false;
  try {
    parseSceneDescriptor(
      {
        schemaVersion: 2,
        id: "bad-edited-texture-map-scene",
        terrain: {
          id: "terrain-0",
          kind: "generated",
          size: [40, 40],
          resolution: [65, 65],
          generator: {
            preset: "urban-pad",
            seed: 1,
            height: {
              base: 0,
              amplitude: 1,
              frequency: 0.1,
              octaves: 3,
              persistence: 0.4,
              lacunarity: 2
            }
          },
          editedTextureMap: {
            encoding: "splatRgba8",
            resolution: [256, 256],
            layers: ["grass"],
            weights: ["assets/generated/terrain/../../oops.png"]
          }
        },
        objects: []
      },
      "bad edited texture map"
    );
  } catch (error) {
    threw = (error as Error).message.includes("assets/generated/terrain");
  }

  assert(threw, "Expected unsafe edited texture map path to throw.");
}

function testParserRejectsMismatchedEditedHeightMapResolution(): void {
  let threw = false;
  try {
    parseSceneDescriptor(
      {
        schemaVersion: 2,
        id: "bad-edited-heightmap-scene",
        terrain: {
          id: "terrain-0",
          kind: "generated",
          size: [40, 40],
          resolution: [65, 65],
          generator: {
            preset: "urban-pad",
            seed: 1,
            height: {
              base: 0,
              amplitude: 1,
              frequency: 0.1,
              octaves: 3,
              persistence: 0.4,
              lacunarity: 2
            }
          },
          editedHeightMap: {
            encoding: "array",
            resolution: [33, 33],
            heights: Array.from({ length: 33 * 33 }, () => 0)
          }
        },
        objects: []
      },
      "mismatched edited heightmap"
    );
  } catch (error) {
    threw = (error as Error).message.includes("must match terrain resolution");
  }

  assert(threw, "Expected mismatched edited heightmap resolution to throw.");
}

function run(): void {
  testParserAcceptsGeneratedTerrain();
  testParserRejectsInvalidResolution();
  testParserRejectsNaNGeneratorParams();
  testParserAcceptsKnownStrategy();
  testParserAllowsUnknownStrategyString();
  testParserAcceptsEditedHeightMap();
  testParserAcceptsBakedTextureTerrainMaterial();
  testParserAcceptsEditedTextureMap();
  testParserRejectsUnsafeBakedTexturePath();
  testParserRejectsUnsafeEditedTextureMapPath();
  testParserRejectsMismatchedEditedHeightMapResolution();
}

run();
console.log("SceneDescriptor generated terrain tests passed");
