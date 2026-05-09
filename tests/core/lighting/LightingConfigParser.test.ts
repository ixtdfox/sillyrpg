import { parseSceneLightingDescriptor } from "../../../src/core/lighting/LightingConfigParser";

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

function assertThrows(action: () => void, expectedMessagePart: string, message: string): void {
  let threw = false;
  try {
    action();
  } catch (error) {
    threw = (error as Error).message.includes(expectedMessagePart);
  }

  assert(threw, message);
}

function testMissingLightingUsesDefaultDay(): void {
  const descriptor = parseSceneLightingDescriptor(undefined, "missing lighting");

  assert(descriptor.preset === "day", "Expected missing lighting to use day preset.");
  assert(descriptor.clearColor === "#8DB7D6", "Expected default day clear color.");
  assert(descriptor.ambient?.intensity === 0.55, "Expected default day ambient intensity.");
  assert(descriptor.sun?.intensity === 1.05, "Expected default day sun intensity.");
}

function testValidOverrideMergesWithPreset(): void {
  const descriptor = parseSceneLightingDescriptor(
    {
      preset: "day",
      ambient: {
        intensity: 0.82,
        diffuse: "#112233"
      },
      sun: {
        enabled: false
      },
      shadows: {
        enabled: true,
        generator: "standard",
        usePercentageCloserFiltering: true,
        bias: 0.0001,
        normalBias: 0.03,
        depthScale: 100,
        lambda: 0.7,
        casterMode: "metadata",
        receiverMode: "all",
        includeCharacters: false,
        includeSceneObjects: true,
        includeTerrain: true
      }
    },
    "valid lighting"
  );

  assert(descriptor.preset === "day", "Expected day preset to be preserved.");
  assert(descriptor.ambient?.intensity === 0.82, "Expected ambient intensity override.");
  assert(descriptor.ambient?.diffuse === "#112233", "Expected ambient diffuse override.");
  assert(descriptor.ambient?.groundColor === "#6E7565", "Expected ambient ground color to come from preset.");
  assert(descriptor.sun?.enabled === false, "Expected sun enabled override.");
  assert(descriptor.sun?.intensity === 1.05, "Expected disabled sun descriptor to keep preset intensity.");
  assert(descriptor.shadows?.generator === "standard", "Expected shadow generator override.");
  assert(descriptor.shadows?.receiverMode === "all", "Expected shadow receiver mode override.");
  assert(descriptor.shadows?.includeCharacters === false, "Expected character include override.");
}

function testInvalidPresetThrows(): void {
  assertThrows(
    () => parseSceneLightingDescriptor({ preset: "storm" }, "bad preset"),
    "preset",
    "Expected invalid preset to throw."
  );
}

function testInvalidColorThrows(): void {
  assertThrows(
    () => parseSceneLightingDescriptor({ ambient: { diffuse: "white" } }, "bad color"),
    "#RRGGBB",
    "Expected invalid color to throw."
  );
}

function testInvalidVectorLengthThrows(): void {
  assertThrows(
    () => parseSceneLightingDescriptor({ sun: { direction: [0, -1] } }, "bad vector"),
    "[x, y, z]",
    "Expected invalid vector length to throw."
  );
}

function testInvalidIntensityTypeThrows(): void {
  assertThrows(
    () => parseSceneLightingDescriptor({ ambient: { intensity: "bright" } }, "bad intensity"),
    "intensity",
    "Expected invalid intensity type to throw."
  );
}

function testInvalidShadowModeThrows(): void {
  assertThrows(
    () => parseSceneLightingDescriptor({ shadows: { receiverMode: "buildingsOnly" } }, "bad shadow mode"),
    "receiverMode",
    "Expected invalid shadow receiver mode to throw."
  );
}

function run(): void {
  testMissingLightingUsesDefaultDay();
  testValidOverrideMergesWithPreset();
  testInvalidPresetThrows();
  testInvalidColorThrows();
  testInvalidVectorLengthThrows();
  testInvalidIntensityTypeThrows();
  testInvalidShadowModeThrows();
}

run();
console.log("LightingConfigParser tests passed");
