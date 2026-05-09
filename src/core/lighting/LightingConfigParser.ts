import {
  DEFAULT_LIGHTING_PRESET_ID,
  getLightingPreset
} from "./LightingPreset";
import type {
  DirectionalLightingDescriptor,
  HemisphericLightingDescriptor,
  LightingPresetId,
  LightingVector3Tuple,
  SceneLightingDescriptor,
  ShadowCasterMode,
  ShadowFilterMode,
  ShadowGeneratorKind,
  ShadowLightingDescriptor,
  ShadowReceiverMode
} from "./LightingTypes";

const LIGHTING_PRESET_IDS: readonly LightingPresetId[] = ["day", "overcast", "dusk", "night"];
const SHADOW_GENERATOR_KINDS: readonly ShadowGeneratorKind[] = ["standard", "cascaded"];
const SHADOW_CASTER_MODES: readonly ShadowCasterMode[] = ["all", "metadata", "none"];
const SHADOW_RECEIVER_MODES: readonly ShadowReceiverMode[] = ["terrainOnly", "all", "metadata", "none"];
const SHADOW_FILTER_MODES: readonly ShadowFilterMode[] = ["none", "pcf", "esm", "blurEsm"];
const HEX_COLOR_PATTERN = /^#[0-9A-Fa-f]{6}$/;

export function parseSceneLightingDescriptor(value: unknown, sourceLabel: string): SceneLightingDescriptor {
  if (value === undefined) {
    return getLightingPreset(DEFAULT_LIGHTING_PRESET_ID);
  }

  const record = requireRecord(value, `${sourceLabel} must be an object.`);
  const preset = parseLightingPresetId(record.preset, `${sourceLabel}.preset`) ?? DEFAULT_LIGHTING_PRESET_ID;
  const base = getLightingPreset(preset);

  return {
    ...base,
    preset,
    clearColor:
      record.clearColor === undefined ? base.clearColor : parseHexColor(record.clearColor, `${sourceLabel}.clearColor`),
    ambient:
      record.ambient === undefined
        ? base.ambient
        : {
            ...(base.ambient ?? {}),
            ...parseHemisphericLightingDescriptor(record.ambient, `${sourceLabel}.ambient`)
          },
    sun:
      record.sun === undefined
        ? base.sun
        : {
            ...(base.sun ?? {}),
            ...parseDirectionalLightingDescriptor(record.sun, `${sourceLabel}.sun`)
          },
    shadows:
      record.shadows === undefined
        ? base.shadows
        : {
            ...(base.shadows ?? {}),
            ...parseShadowLightingDescriptor(record.shadows, `${sourceLabel}.shadows`)
          }
  };
}

function parseHemisphericLightingDescriptor(value: unknown, sourceLabel: string): HemisphericLightingDescriptor {
  const record = requireRecord(value, `${sourceLabel} must be an object.`);
  const enabled = optionalBoolean(record.enabled, `${sourceLabel}.enabled must be a boolean if provided.`);
  const direction = parseOptionalVector3Tuple(record.direction, `${sourceLabel}.direction`);
  const intensity = parseOptionalFiniteNumber(record.intensity, `${sourceLabel}.intensity must be a finite number if provided.`);
  const diffuse = parseOptionalHexColor(record.diffuse, `${sourceLabel}.diffuse`);
  const specular = parseOptionalHexColor(record.specular, `${sourceLabel}.specular`);
  const groundColor = parseOptionalHexColor(record.groundColor, `${sourceLabel}.groundColor`);

  return {
    ...(enabled !== undefined ? { enabled } : {}),
    ...(direction !== undefined ? { direction } : {}),
    ...(intensity !== undefined ? { intensity } : {}),
    ...(diffuse !== undefined ? { diffuse } : {}),
    ...(specular !== undefined ? { specular } : {}),
    ...(groundColor !== undefined ? { groundColor } : {})
  };
}

function parseDirectionalLightingDescriptor(value: unknown, sourceLabel: string): DirectionalLightingDescriptor {
  const record = requireRecord(value, `${sourceLabel} must be an object.`);
  const enabled = optionalBoolean(record.enabled, `${sourceLabel}.enabled must be a boolean if provided.`);
  const direction = parseOptionalVector3Tuple(record.direction, `${sourceLabel}.direction`);
  const position = parseOptionalVector3Tuple(record.position, `${sourceLabel}.position`);
  const intensity = parseOptionalFiniteNumber(record.intensity, `${sourceLabel}.intensity must be a finite number if provided.`);
  const diffuse = parseOptionalHexColor(record.diffuse, `${sourceLabel}.diffuse`);
  const specular = parseOptionalHexColor(record.specular, `${sourceLabel}.specular`);

  return {
    ...(enabled !== undefined ? { enabled } : {}),
    ...(direction !== undefined ? { direction } : {}),
    ...(position !== undefined ? { position } : {}),
    ...(intensity !== undefined ? { intensity } : {}),
    ...(diffuse !== undefined ? { diffuse } : {}),
    ...(specular !== undefined ? { specular } : {})
  };
}

function parseShadowLightingDescriptor(value: unknown, sourceLabel: string): ShadowLightingDescriptor {
  const record = requireRecord(value, `${sourceLabel} must be an object.`);
  const enabled = optionalBoolean(record.enabled, `${sourceLabel}.enabled must be a boolean if provided.`);
  const generator = parseOptionalEnum(record.generator, SHADOW_GENERATOR_KINDS, `${sourceLabel}.generator`);
  const mapSize = parseOptionalFiniteInteger(record.mapSize, `${sourceLabel}.mapSize must be a finite integer if provided.`);
  const darkness = parseOptionalFiniteNumber(record.darkness, `${sourceLabel}.darkness must be a finite number if provided.`);
  const parsedFilter = parseOptionalEnum(record.filter, SHADOW_FILTER_MODES, `${sourceLabel}.filter`);
  const useBlurExponentialShadowMap = optionalBoolean(
    record.useBlurExponentialShadowMap,
    `${sourceLabel}.useBlurExponentialShadowMap must be a boolean if provided.`
  );
  const usePercentageCloserFiltering = optionalBoolean(
    record.usePercentageCloserFiltering,
    `${sourceLabel}.usePercentageCloserFiltering must be a boolean if provided.`
  );
  const blurKernel = parseOptionalFiniteNumber(record.blurKernel, `${sourceLabel}.blurKernel must be a finite number if provided.`);
  const bias = parseOptionalFiniteNumber(record.bias, `${sourceLabel}.bias must be a finite number if provided.`);
  const normalBias = parseOptionalFiniteNumber(record.normalBias, `${sourceLabel}.normalBias must be a finite number if provided.`);
  const depthScale = parseOptionalFiniteNumber(record.depthScale, `${sourceLabel}.depthScale must be a finite number if provided.`);
  const lambda = parseOptionalFiniteNumber(record.lambda, `${sourceLabel}.lambda must be a finite number if provided.`);
  const casterMode = parseOptionalEnum(record.casterMode, SHADOW_CASTER_MODES, `${sourceLabel}.casterMode`);
  const receiverMode = parseOptionalEnum(record.receiverMode, SHADOW_RECEIVER_MODES, `${sourceLabel}.receiverMode`);
  const includeCharacters = optionalBoolean(record.includeCharacters, `${sourceLabel}.includeCharacters must be a boolean if provided.`);
  const includeSceneObjects = optionalBoolean(record.includeSceneObjects, `${sourceLabel}.includeSceneObjects must be a boolean if provided.`);
  const includeTerrain = optionalBoolean(record.includeTerrain, `${sourceLabel}.includeTerrain must be a boolean if provided.`);
  const filter =
    parsedFilter ??
    inferLegacyShadowFilter(usePercentageCloserFiltering, useBlurExponentialShadowMap);

  return {
    ...(enabled !== undefined ? { enabled } : {}),
    ...(generator !== undefined ? { generator } : {}),
    ...(mapSize !== undefined ? { mapSize } : {}),
    ...(darkness !== undefined ? { darkness } : {}),
    ...(filter !== undefined ? { filter } : {}),
    ...(useBlurExponentialShadowMap !== undefined ? { useBlurExponentialShadowMap } : {}),
    ...(usePercentageCloserFiltering !== undefined ? { usePercentageCloserFiltering } : {}),
    ...(blurKernel !== undefined ? { blurKernel } : {}),
    ...(bias !== undefined ? { bias } : {}),
    ...(normalBias !== undefined ? { normalBias } : {}),
    ...(depthScale !== undefined ? { depthScale } : {}),
    ...(lambda !== undefined ? { lambda } : {}),
    ...(casterMode !== undefined ? { casterMode } : {}),
    ...(receiverMode !== undefined ? { receiverMode } : {}),
    ...(includeCharacters !== undefined ? { includeCharacters } : {}),
    ...(includeSceneObjects !== undefined ? { includeSceneObjects } : {}),
    ...(includeTerrain !== undefined ? { includeTerrain } : {})
  };
}

function inferLegacyShadowFilter(
  usePercentageCloserFiltering: boolean | undefined,
  useBlurExponentialShadowMap: boolean | undefined
): ShadowFilterMode | undefined {
  if (usePercentageCloserFiltering === true) {
    return "pcf";
  }

  if (useBlurExponentialShadowMap === true) {
    return "blurEsm";
  }

  if (usePercentageCloserFiltering === false || useBlurExponentialShadowMap === false) {
    return "none";
  }

  return undefined;
}

function parseLightingPresetId(value: unknown, sourceLabel: string): LightingPresetId | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== "string") {
    throw new Error(`${sourceLabel} must be a string if provided.`);
  }

  if (!LIGHTING_PRESET_IDS.includes(value as LightingPresetId)) {
    throw new Error(`${sourceLabel} must be 'day', 'overcast', 'dusk', or 'night'.`);
  }

  return value as LightingPresetId;
}

function parseOptionalVector3Tuple(value: unknown, sourceLabel: string): LightingVector3Tuple | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (!Array.isArray(value) || value.length !== 3) {
    throw new Error(`${sourceLabel} must be a [x, y, z] tuple.`);
  }

  const [x, y, z] = value;
  if (![x, y, z].every((item) => typeof item === "number" && Number.isFinite(item))) {
    throw new Error(`${sourceLabel} must contain three finite numbers.`);
  }

  return [x, y, z] as const;
}

function parseOptionalHexColor(value: unknown, sourceLabel: string): string | undefined {
  if (value === undefined) {
    return undefined;
  }

  return parseHexColor(value, sourceLabel);
}

function parseHexColor(value: unknown, sourceLabel: string): string {
  if (typeof value !== "string" || !HEX_COLOR_PATTERN.test(value)) {
    throw new Error(`${sourceLabel} must be a #RRGGBB color string.`);
  }

  return value;
}

function parseOptionalFiniteNumber(value: unknown, errorMessage: string): number | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(errorMessage);
  }

  return value;
}

function parseOptionalFiniteInteger(value: unknown, errorMessage: string): number | undefined {
  const parsed = parseOptionalFiniteNumber(value, errorMessage);
  if (parsed === undefined) {
    return undefined;
  }

  if (!Number.isInteger(parsed)) {
    throw new Error(errorMessage);
  }

  return parsed;
}

function optionalBoolean(value: unknown, errorMessage: string): boolean | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== "boolean") {
    throw new Error(errorMessage);
  }

  return value;
}

function parseOptionalEnum<T extends string>(
  value: unknown,
  allowedValues: readonly T[],
  sourceLabel: string
): T | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== "string") {
    throw new Error(`${sourceLabel} must be a string if provided.`);
  }

  if (!allowedValues.includes(value as T)) {
    throw new Error(`${sourceLabel} must be one of: ${allowedValues.map((item) => `'${item}'`).join(", ")}.`);
  }

  return value as T;
}

function requireRecord(value: unknown, errorMessage: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(errorMessage);
  }

  return value as Record<string, unknown>;
}
