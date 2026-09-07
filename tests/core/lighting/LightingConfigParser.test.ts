import { LightingConfigParser } from "../../../src/core/lighting/LightingConfigParser";
import { LightingPresetCatalog } from "../../../src/core/lighting/LightingPreset";

const parser = new LightingConfigParser();

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
  const descriptor = parser.parseSceneLightingDescriptor(undefined, "missing lighting");

  assert(descriptor.preset === "day", "Expected missing lighting to use day preset.");
  assert(descriptor.clearColor === "#8DB7D6", "Expected default day clear color.");
  assert(descriptor.ambient?.intensity === 0.55, "Expected default day ambient intensity.");
  assert(descriptor.sun?.intensity === 1.05, "Expected default day sun intensity.");
  assert(descriptor.shadows?.enabled === true, "Expected default day shadows to be enabled.");
  assert(descriptor.shadows?.filter === "pcf", "Expected default day shadows to use PCF.");
}

function testValidOverrideMergesWithPreset(): void {
  const descriptor = parser.parseSceneLightingDescriptor(
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
        filter: "blurEsm",
        cascadeCount: 3,
        shadowMaxZ: 120,
        freezeShadowCastersBoundingInfo: true,
        usePercentageCloserFiltering: true,
        bias: 0.0001,
        normalBias: 0.03,
        depthScale: 100,
        lambda: 0.7,
        casterMode: "metadata",
        receiverMode: "all",
        includeCharacters: false,
        includeSceneObjects: true,
        includeTerrain: true,
        preferBuildingShadowProxies: true
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
  assert(descriptor.shadows?.filter === "blurEsm", "Expected explicit shadow filter override.");
  assert(descriptor.shadows?.cascadeCount === 3, "Expected CSM cascade count override.");
  assert(descriptor.shadows?.shadowMaxZ === 120, "Expected shadow max distance override.");
  assert(descriptor.shadows?.freezeShadowCastersBoundingInfo === true, "Expected CSM bounds freeze override.");
  assert(descriptor.shadows?.receiverMode === "all", "Expected shadow receiver mode override.");
  assert(descriptor.shadows?.includeCharacters === false, "Expected character include override.");
  assert(descriptor.shadows?.preferBuildingShadowProxies === true, "Expected building shadow proxy preference override.");
}

function testLegacyShadowFilterFlagsMapToFilterMode(): void {
  const pcfDescriptor = parser.parseSceneLightingDescriptor(
    {
      shadows: {
        usePercentageCloserFiltering: true
      }
    },
    "pcf legacy lighting"
  );
  const disabledDescriptor = parser.parseSceneLightingDescriptor(
    {
      shadows: {
        usePercentageCloserFiltering: false
      }
    },
    "disabled legacy lighting"
  );

  assert(pcfDescriptor.shadows?.filter === "pcf", "Expected legacy PCF flag to map to pcf filter.");
  assert(disabledDescriptor.shadows?.filter === "none", "Expected false legacy filter flag to map to none filter.");
}

function testPresetCatalogReturnsIsolatedClones(): void {
  const catalog = LightingPresetCatalog.getShared();
  const first = catalog.get("day");
  const second = catalog.get("day");
  const mutableDirection = first.ambient?.direction as unknown as [number, number, number] | undefined;

  if (mutableDirection) {
    mutableDirection[0] = 99;
  }

  assert(second.ambient?.direction?.[0] === 0, "Expected preset catalog to protect shared preset vectors from mutation.");
  assert(first !== second, "Expected preset catalog to return distinct descriptor objects.");
}

function testInvalidPresetThrows(): void {
  assertThrows(
    () => parser.parseSceneLightingDescriptor({ preset: "storm" }, "bad preset"),
    "preset",
    "Expected invalid preset to throw."
  );
}

function testInvalidColorThrows(): void {
  assertThrows(
    () => parser.parseSceneLightingDescriptor({ ambient: { diffuse: "white" } }, "bad color"),
    "#RRGGBB",
    "Expected invalid color to throw."
  );
}

function testInvalidVectorLengthThrows(): void {
  assertThrows(
    () => parser.parseSceneLightingDescriptor({ sun: { direction: [0, -1] } }, "bad vector"),
    "[x, y, z]",
    "Expected invalid vector length to throw."
  );
}

function testInvalidIntensityTypeThrows(): void {
  assertThrows(
    () => parser.parseSceneLightingDescriptor({ ambient: { intensity: "bright" } }, "bad intensity"),
    "intensity",
    "Expected invalid intensity type to throw."
  );
}

function testInvalidShadowModeThrows(): void {
  assertThrows(
    () => parser.parseSceneLightingDescriptor({ shadows: { receiverMode: "buildingsOnly" } }, "bad shadow mode"),
    "receiverMode",
    "Expected invalid shadow receiver mode to throw."
  );
}

function run(): void {
  testMissingLightingUsesDefaultDay();
  testValidOverrideMergesWithPreset();
  testLegacyShadowFilterFlagsMapToFilterMode();
  testPresetCatalogReturnsIsolatedClones();
  testInvalidPresetThrows();
  testInvalidColorThrows();
  testInvalidVectorLengthThrows();
  testInvalidIntensityTypeThrows();
  testInvalidShadowModeThrows();
}

run();
console.log("LightingConfigParser tests passed");
