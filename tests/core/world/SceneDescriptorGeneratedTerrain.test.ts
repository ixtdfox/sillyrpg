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
          color: "#8D9298"
        }
      },
      objects: []
    },
    "generated terrain test"
  );

  assert(descriptor.terrain?.kind === "generated", "Expected generated terrain kind.");
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

function run(): void {
  testParserAcceptsGeneratedTerrain();
  testParserRejectsInvalidResolution();
  testParserRejectsNaNGeneratorParams();
  testParserAcceptsKnownStrategy();
  testParserAllowsUnknownStrategyString();
}

run();
console.log("SceneDescriptor generated terrain tests passed");
