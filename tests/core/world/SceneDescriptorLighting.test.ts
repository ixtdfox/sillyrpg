import { parseSceneDescriptor } from "../../../src/core/world/scene/SceneDescriptor";

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

function testParserAcceptsTopLevelLighting(): void {
  const descriptor = parseSceneDescriptor(
    {
      schemaVersion: 2,
      id: "lighting-scene",
      lighting: {
        preset: "day",
        clearColor: "#112244",
        ambient: {
          intensity: 0.7,
          diffuse: "#DDEEFF"
        },
        sun: {
          direction: [0, -1, 0]
        },
        shadows: {
          enabled: true
        }
      },
      terrain: null,
      objects: []
    },
    "scene descriptor lighting"
  );

  assert(descriptor.lighting?.preset === "day", "Expected lighting preset to parse.");
  assert(descriptor.lighting?.clearColor === "#112244", "Expected clear color override to parse.");
  assert(descriptor.lighting?.ambient?.intensity === 0.7, "Expected ambient intensity override.");
  assert(descriptor.lighting?.ambient?.groundColor === "#6E7565", "Expected ambient defaults to be preserved.");
  assert(descriptor.lighting?.sun?.direction?.[1] === -1, "Expected sun direction override.");
  assert(descriptor.lighting?.sun?.intensity === 1.05, "Expected sun defaults to be preserved.");
  assert(descriptor.lighting?.shadows?.enabled === true, "Expected shadow flag override.");
  assert(descriptor.lighting?.shadows?.filter === "pcf", "Expected shadow filter defaults to be preserved.");
  assert(descriptor.lighting?.shadows?.blurKernel === 0, "Expected shadow defaults to be preserved.");
}

function testMissingLightingNormalizesToDefault(): void {
  const descriptor = parseSceneDescriptor(
    {
      schemaVersion: 2,
      id: "default-lighting-scene",
      terrain: null,
      objects: []
    },
    "scene descriptor default lighting"
  );

  assert(descriptor.lighting?.preset === "day", "Expected missing top-level lighting to normalize to day.");
  assert(descriptor.lighting?.clearColor === "#8DB7D6", "Expected default clear color.");
  assert(descriptor.lighting?.shadows?.enabled === true, "Expected default shadows to be enabled.");
}

function run(): void {
  testParserAcceptsTopLevelLighting();
  testMissingLightingNormalizesToDefault();
}

run();
console.log("SceneDescriptor lighting tests passed");
