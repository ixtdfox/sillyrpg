import { LightingConfigParser } from "../../lighting/LightingConfigParser";
import type { SceneLightingDescriptor } from "../../lighting/LightingTypes";

export type SceneVector2Tuple = readonly [number, number];
export type SceneVector3Tuple = readonly [number, number, number];
export type SceneTerrainNormalMode = "smooth" | "flat";
export type SceneGeneratedTerrainResolutionMode = "gridStep" | "manual";

const MAX_GENERATED_TERRAIN_RESOLUTION = 4097;

export interface SceneFlatTerrainMaterialDescriptor {
  readonly kind: "flat";
  readonly color?: string;
  readonly emissive?: string | null;
}

export interface SceneGeneratedTerrainBakedTextureMaterialDescriptor {
  readonly kind: "bakedTexture";
  readonly texture: string;
  readonly color?: string;
  readonly emissive?: string | null;
  readonly uvScale?: readonly [number, number];
}

export interface SceneTerrainMaterialBandDescriptor {
  readonly id: string;
  readonly label: string;
  readonly minHeight: number;
  readonly maxHeight: number;
  readonly color: string;
}

export interface SceneGeneratedTerrainFlatMaterialDescriptor {
  readonly kind: "flat";
  readonly color?: string;
  readonly emissive?: string | null;
}

export interface SceneGeneratedTerrainHeightBandsMaterialDescriptor {
  readonly kind: "heightBands";
  readonly color?: string;
  readonly emissive?: string | null;
  readonly bands: readonly SceneTerrainMaterialBandDescriptor[];
}

export type SceneGeneratedTerrainMaterialDescriptor =
  | SceneGeneratedTerrainFlatMaterialDescriptor
  | SceneGeneratedTerrainHeightBandsMaterialDescriptor
  | SceneGeneratedTerrainBakedTextureMaterialDescriptor;

export interface SceneGeneratedTerrainLodDescriptor {
  readonly enabled?: boolean;
  readonly strategy?: "quadtree";
  readonly maxDepth?: number;
  readonly targetPatchQuads?: number;
  readonly nearLeafWorldSize?: number;
  readonly nearFullResolutionPatchQuads?: number;
  readonly nearFullResolutionRadius?: number;
  readonly lodRings?: readonly SceneGeneratedTerrainLodRingDescriptor[];
  /** @deprecated Use targetPatchQuads. */
  readonly basePatchQuads?: number;
  /** @deprecated Use lodRings. */
  readonly splitDistances?: readonly number[];
  readonly updateIntervalSeconds?: number;
  readonly skirtDepth?: number;
  readonly debug?: boolean;
}

export interface SceneGeneratedTerrainLodRingDescriptor {
  readonly distance: number;
  readonly maxSampleStep: number;
}

export interface SceneGeneratedTerrainEditedHeightMap {
  readonly encoding: "array";
  readonly resolution: SceneVector2Tuple;
  readonly heights: readonly number[];
}

export interface SceneGeneratedTerrainEditedTextureMap {
  readonly encoding: "splatRgba8";
  readonly resolution: SceneVector2Tuple;
  readonly layers: readonly string[];
  readonly weights: readonly string[];
  readonly bakedTexture?: string;
  readonly bakeResolution?: SceneVector2Tuple;
}

export interface SceneTerrainGeneratorDescriptor {
  readonly preset: string;
  readonly strategy?: string;
  readonly seed: number;
  readonly height: {
    readonly base: number;
    readonly amplitude: number;
    readonly frequency: number;
    readonly octaves: number;
    readonly persistence: number;
    readonly lacunarity: number;
  };
  readonly falloff?: {
    readonly enabled: boolean;
    readonly mode: "none" | "island" | "centerPlateau" | "edgeFade";
    readonly radius: number;
    readonly strength: number;
  };
  readonly shaping?: {
    readonly flattenCenter?: boolean;
    readonly centerRadius?: number;
    readonly terraceSteps?: number;
    readonly smoothPasses?: number;
  };
}

export interface ScenePlaneTerrainDescriptor {
  readonly id: string;
  readonly kind: "plane";
  readonly size: SceneVector2Tuple;
  readonly position?: SceneVector3Tuple;
  readonly rotation?: SceneVector3Tuple;
  readonly scale?: SceneVector3Tuple;
  readonly material?: SceneFlatTerrainMaterialDescriptor;
}

export interface SceneModelTerrainDescriptor {
  readonly id: string;
  readonly kind: "model";
  readonly model: string;
  readonly position?: SceneVector3Tuple;
  readonly rotation?: SceneVector3Tuple;
  readonly scale?: SceneVector3Tuple;
}

export interface SceneGeneratedTerrainDescriptor {
  readonly id: string;
  readonly kind: "generated";
  readonly size: SceneVector2Tuple;
  readonly terrainGridStep?: number;
  readonly resolutionMode?: SceneGeneratedTerrainResolutionMode;
  readonly resolution: SceneVector2Tuple;
  readonly position?: SceneVector3Tuple;
  readonly rotation?: SceneVector3Tuple;
  readonly scale?: SceneVector3Tuple;
  readonly normalMode?: SceneTerrainNormalMode;
  readonly generator: SceneTerrainGeneratorDescriptor;
  readonly material?: SceneGeneratedTerrainMaterialDescriptor;
  readonly lod?: SceneGeneratedTerrainLodDescriptor;
  readonly editedHeightMap?: SceneGeneratedTerrainEditedHeightMap;
  readonly editedTextureMap?: SceneGeneratedTerrainEditedTextureMap;
}

export type SceneTerrainDescriptor =
  | ScenePlaneTerrainDescriptor
  | SceneModelTerrainDescriptor
  | SceneGeneratedTerrainDescriptor;

export interface SceneObjectDescriptor {
  readonly id: string;
  readonly type: string;
  readonly asset: string;
  readonly position: SceneVector3Tuple;
  readonly rotation: SceneVector3Tuple;
  readonly scale: SceneVector3Tuple;
}

export interface SceneDescriptor {
  readonly schemaVersion: 2;
  readonly id: string;
  readonly title?: string;
  readonly chunkCoord?: readonly [number, number];
  readonly lighting?: SceneLightingDescriptor;
  readonly terrain?: SceneTerrainDescriptor | null;
  readonly objects: readonly SceneObjectDescriptor[];
}

const DEFAULT_POSITION: SceneVector3Tuple = [0, 0, 0];
const DEFAULT_ROTATION: SceneVector3Tuple = [0, 0, 0];
const DEFAULT_SCALE: SceneVector3Tuple = [1, 1, 1];
const LIGHTING_CONFIG_PARSER = new LightingConfigParser();

export function parseSceneDescriptor(payload: unknown, sourceLabel: string): SceneDescriptor {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error(`${sourceLabel} must be an object.`);
  }

  const record = payload as Record<string, unknown>;
  if (record.schemaVersion !== 2) {
    throw new Error(`${sourceLabel} schemaVersion must be 2.`);
  }

  const id = requireString(record.id, `${sourceLabel} id must be a string.`);
  const title = optionalString(record.title, `${sourceLabel} title must be a string if provided.`);
  const chunkCoord = parseChunkCoord(record.chunkCoord, `${sourceLabel} chunkCoord`);
  const lighting = LIGHTING_CONFIG_PARSER.parseSceneLightingDescriptor(record.lighting, `${sourceLabel} lighting`);
  const terrain = parseTerrainDescriptor(record.terrain, `${sourceLabel} terrain`);
  const objects = parseObjectDescriptors(record.objects, `${sourceLabel} objects`);

  return {
    schemaVersion: 2,
    id,
    title,
    chunkCoord,
    lighting,
    terrain,
    objects
  };
}

export function cloneSceneDescriptor(descriptor: SceneDescriptor): SceneDescriptor {
  return JSON.parse(JSON.stringify(descriptor)) as SceneDescriptor;
}

export function isLegacySceneAssetPath(assetPath: string): boolean {
  const normalized = assetPath.trim().replace(/^\/+/, "");
  return normalized.startsWith("assets/scenes/");
}

function parseTerrainDescriptor(value: unknown, sourceLabel: string): SceneTerrainDescriptor | null | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (value === null) {
    return null;
  }

  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${sourceLabel} must be an object or null.`);
  }

  const record = value as Record<string, unknown>;
  const id = requireString(record.id, `${sourceLabel}.id must be a string.`);
  const kind = requireString(record.kind, `${sourceLabel}.kind must be a string.`);

  if (kind === "plane") {
    return {
      id,
      kind: "plane",
      size: parseVector2Tuple(record.size, `${sourceLabel}.size`),
      position: parseVector3Tuple(record.position, `${sourceLabel}.position`),
      rotation: parseVector3Tuple(record.rotation, `${sourceLabel}.rotation`),
      scale: parseVector3Tuple(record.scale, `${sourceLabel}.scale`),
      material: parseFlatMaterial(record.material, `${sourceLabel}.material`)
    };
  }

  if (kind === "model") {
    const model = requireString(record.model, `${sourceLabel}.model must be a string.`);
    assertAllowedSceneAssetPath(model, `${sourceLabel}.model`);
    return {
      id,
      kind: "model",
      model,
      position: parseVector3Tuple(record.position, `${sourceLabel}.position`),
      rotation: parseVector3Tuple(record.rotation, `${sourceLabel}.rotation`),
      scale: parseVector3Tuple(record.scale, `${sourceLabel}.scale`)
    };
  }

  if (kind === "generated") {
    return parseGeneratedTerrainDescriptor(record, sourceLabel, id);
  }

  throw new Error(`${sourceLabel}.kind must be 'plane', 'model', or 'generated'.`);
}

function parseFlatMaterial(value: unknown, sourceLabel: string): SceneFlatTerrainMaterialDescriptor | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${sourceLabel} must be an object.`);
  }

  const record = value as Record<string, unknown>;
  const kind = requireString(record.kind, `${sourceLabel}.kind must be a string.`);
  if (kind !== "flat") {
    throw new Error(`${sourceLabel}.kind must be 'flat'.`);
  }

  return {
    kind: "flat",
    color: optionalString(record.color, `${sourceLabel}.color must be a string if provided.`),
    emissive: optionalNullableHexColor(record.emissive, `${sourceLabel}.emissive`)
  };
}

function parseObjectDescriptors(value: unknown, sourceLabel: string): readonly SceneObjectDescriptor[] {
  if (value === undefined) {
    return [];
  }

  if (!Array.isArray(value)) {
    throw new Error(`${sourceLabel} must be an array.`);
  }

  return value.map((item, index) => parseObjectDescriptor(item, `${sourceLabel}[${index}]`));
}

function parseGeneratedTerrainDescriptor(
  record: Record<string, unknown>,
  sourceLabel: string,
  id: string
): SceneGeneratedTerrainDescriptor {
  const resolution = parseTerrainResolutionTuple(record.resolution, `${sourceLabel}.resolution`);
  return {
    id,
    kind: "generated",
    size: parseTerrainSizeTuple(record.size, `${sourceLabel}.size`),
    terrainGridStep:
      record.terrainGridStep === undefined
        ? undefined
        : parseFiniteNumberInRange(record.terrainGridStep, `${sourceLabel}.terrainGridStep`, 0.0001, Number.POSITIVE_INFINITY),
    resolutionMode: parseGeneratedTerrainResolutionMode(record.resolutionMode, `${sourceLabel}.resolutionMode`),
    resolution,
    position: parseVector3Tuple(record.position, `${sourceLabel}.position`),
    rotation: parseVector3Tuple(record.rotation, `${sourceLabel}.rotation`),
    scale: parseVector3Tuple(record.scale, `${sourceLabel}.scale`),
    normalMode: parseTerrainNormalMode(record.normalMode, `${sourceLabel}.normalMode`),
    generator: parseTerrainGeneratorDescriptor(record.generator, `${sourceLabel}.generator`),
    material: parseGeneratedTerrainMaterial(record.material, `${sourceLabel}.material`),
    lod: parseGeneratedTerrainLodDescriptor(record.lod, `${sourceLabel}.lod`),
    editedHeightMap: parseGeneratedTerrainEditedHeightMap(record.editedHeightMap, resolution, `${sourceLabel}.editedHeightMap`),
    editedTextureMap: parseGeneratedTerrainEditedTextureMap(record.editedTextureMap, `${sourceLabel}.editedTextureMap`)
  };
}

function parseGeneratedTerrainLodDescriptor(
  value: unknown,
  sourceLabel: string
): SceneGeneratedTerrainLodDescriptor | undefined {
  if (value === undefined) {
    return undefined;
  }

  const record = requireRecord(value, `${sourceLabel} must be an object.`);
  const strategy = parseGeneratedTerrainLodStrategy(record.strategy, `${sourceLabel}.strategy`);

  return {
    enabled: optionalBoolean(record.enabled, `${sourceLabel}.enabled must be a boolean if provided.`),
    strategy,
    maxDepth:
      record.maxDepth === undefined
        ? undefined
        : parseFiniteIntegerInRange(record.maxDepth, `${sourceLabel}.maxDepth`, 0, 16),
    targetPatchQuads:
      record.targetPatchQuads === undefined
        ? undefined
        : parseFiniteIntegerInRange(record.targetPatchQuads, `${sourceLabel}.targetPatchQuads`, 1, 128),
    nearLeafWorldSize:
      record.nearLeafWorldSize === undefined
        ? undefined
        : parseFiniteNumberInRange(
            record.nearLeafWorldSize,
            `${sourceLabel}.nearLeafWorldSize`,
            0.0001,
            Number.POSITIVE_INFINITY
          ),
    nearFullResolutionPatchQuads:
      record.nearFullResolutionPatchQuads === undefined
        ? undefined
        : parseFiniteIntegerInRange(
            record.nearFullResolutionPatchQuads,
            `${sourceLabel}.nearFullResolutionPatchQuads`,
            1,
            128
          ),
    nearFullResolutionRadius:
      record.nearFullResolutionRadius === undefined
        ? undefined
        : parseFiniteNumberInRange(
            record.nearFullResolutionRadius,
            `${sourceLabel}.nearFullResolutionRadius`,
            0.0001,
            Number.POSITIVE_INFINITY
          ),
    lodRings: parseGeneratedTerrainLodRings(record.lodRings, `${sourceLabel}.lodRings`),
    basePatchQuads:
      record.basePatchQuads === undefined
        ? undefined
        : parseFiniteIntegerInRange(record.basePatchQuads, `${sourceLabel}.basePatchQuads`, 8, 128),
    splitDistances: parseGeneratedTerrainLodSplitDistances(record.splitDistances, `${sourceLabel}.splitDistances`),
    updateIntervalSeconds:
      record.updateIntervalSeconds === undefined
        ? undefined
        : parseFiniteNumberInRange(record.updateIntervalSeconds, `${sourceLabel}.updateIntervalSeconds`, 0.05, 2),
    skirtDepth:
      record.skirtDepth === undefined
        ? undefined
        : parseFiniteNumberInRange(record.skirtDepth, `${sourceLabel}.skirtDepth`, 0, Number.POSITIVE_INFINITY),
    debug: optionalBoolean(record.debug, `${sourceLabel}.debug must be a boolean if provided.`)
  };
}

function parseGeneratedTerrainEditedHeightMap(
  value: unknown,
  expectedResolution: SceneVector2Tuple,
  sourceLabel: string
): SceneGeneratedTerrainEditedHeightMap | undefined {
  if (value === undefined) {
    return undefined;
  }

  const record = requireRecord(value, `${sourceLabel} must be an object.`);
  const encoding = requireString(record.encoding, `${sourceLabel}.encoding must be a string.`);
  if (encoding !== "array") {
    throw new Error(`${sourceLabel}.encoding must be 'array'.`);
  }

  const resolution = parseTerrainResolutionTuple(record.resolution, `${sourceLabel}.resolution`);
  if (resolution[0] !== expectedResolution[0] || resolution[1] !== expectedResolution[1]) {
    throw new Error(
      `${sourceLabel}.resolution must match terrain resolution ${expectedResolution[0]} x ${expectedResolution[1]}.`
    );
  }

  if (!Array.isArray(record.heights)) {
    throw new Error(`${sourceLabel}.heights must be an array.`);
  }

  const expectedLength = resolution[0] * resolution[1];
  if (record.heights.length !== expectedLength) {
    throw new Error(`${sourceLabel}.heights must contain ${expectedLength} entries.`);
  }

  const heights = record.heights.map((entry, index) =>
    parseFiniteNumber(entry, `${sourceLabel}.heights[${index}] must be a finite number.`)
  );

  return {
    encoding: "array",
    resolution,
    heights
  };
}

function parseGeneratedTerrainEditedTextureMap(
  value: unknown,
  sourceLabel: string
): SceneGeneratedTerrainEditedTextureMap | undefined {
  if (value === undefined) {
    return undefined;
  }

  const record = requireRecord(value, `${sourceLabel} must be an object.`);
  const encoding = requireString(record.encoding, `${sourceLabel}.encoding must be a string.`);
  if (encoding !== "splatRgba8") {
    throw new Error(`${sourceLabel}.encoding must be 'splatRgba8'.`);
  }

  const resolution = parsePositiveIntegerVector2Tuple(record.resolution, `${sourceLabel}.resolution`);
  const layers = parseStringArray(record.layers, `${sourceLabel}.layers`);
  const weights = parseStringArray(record.weights, `${sourceLabel}.weights`);
  if (layers.length === 0) {
    throw new Error(`${sourceLabel}.layers must be a non-empty array.`);
  }
  if (weights.length === 0) {
    throw new Error(`${sourceLabel}.weights must be a non-empty array.`);
  }
  for (let index = 0; index < weights.length; index += 1) {
    assertAllowedGeneratedTerrainTextureAssetPath(weights[index]!, `${sourceLabel}.weights[${index}]`);
  }

  const bakedTexture = optionalString(record.bakedTexture, `${sourceLabel}.bakedTexture must be a string if provided.`);
  if (bakedTexture !== undefined) {
    assertAllowedGeneratedTerrainTextureAssetPath(bakedTexture, `${sourceLabel}.bakedTexture`);
  }

  return {
    encoding: "splatRgba8",
    resolution,
    layers,
    weights,
    bakedTexture,
    bakeResolution: parseOptionalPositiveIntegerVector2Tuple(record.bakeResolution, `${sourceLabel}.bakeResolution`)
  };
}

function parseTerrainGeneratorDescriptor(value: unknown, sourceLabel: string): SceneTerrainGeneratorDescriptor {
  const record = requireRecord(value, `${sourceLabel} must be an object.`);
  const height = requireRecord(record.height, `${sourceLabel}.height must be an object.`);
  const falloffRecord = optionalRecord(record.falloff, `${sourceLabel}.falloff must be an object if provided.`);
  const shapingRecord = optionalRecord(record.shaping, `${sourceLabel}.shaping must be an object if provided.`);

  return {
    preset: requireString(record.preset, `${sourceLabel}.preset must be a string.`),
    strategy: optionalString(record.strategy, `${sourceLabel}.strategy must be a string if provided.`),
    seed: parseFiniteInteger(record.seed, `${sourceLabel}.seed must be a finite integer.`),
    height: {
      base: parseFiniteNumber(height.base, `${sourceLabel}.height.base must be a finite number.`),
      amplitude: parseFiniteNumberInRange(height.amplitude, `${sourceLabel}.height.amplitude`, 0, 1000),
      frequency: parseFiniteNumberInRange(height.frequency, `${sourceLabel}.height.frequency`, 0.0001, 100),
      octaves: parseFiniteIntegerInRange(height.octaves, `${sourceLabel}.height.octaves`, 1, 8),
      persistence: parseFiniteNumberInRange(height.persistence, `${sourceLabel}.height.persistence`, 0, 1),
      lacunarity: parseFiniteNumberInRange(height.lacunarity, `${sourceLabel}.height.lacunarity`, 1, 8)
    },
    falloff: falloffRecord
      ? {
          enabled: parseBoolean(falloffRecord.enabled, `${sourceLabel}.falloff.enabled must be a boolean.`),
          mode: parseTerrainFalloffMode(falloffRecord.mode, `${sourceLabel}.falloff.mode`),
          radius: parseFiniteNumberInRange(falloffRecord.radius, `${sourceLabel}.falloff.radius`, 0, 1),
          strength: parseFiniteNumberInRange(falloffRecord.strength, `${sourceLabel}.falloff.strength`, 0, 1)
        }
      : undefined,
    shaping: shapingRecord
      ? {
          flattenCenter: optionalBoolean(
            shapingRecord.flattenCenter,
            `${sourceLabel}.shaping.flattenCenter must be a boolean if provided.`
          ),
          centerRadius:
            shapingRecord.centerRadius === undefined
              ? undefined
              : parseFiniteNumberInRange(
                  shapingRecord.centerRadius,
                  `${sourceLabel}.shaping.centerRadius`,
                  0,
                  1
                ),
          terraceSteps:
            shapingRecord.terraceSteps === undefined
              ? undefined
              : parseFiniteIntegerInRange(shapingRecord.terraceSteps, `${sourceLabel}.shaping.terraceSteps`, 0, 64),
          smoothPasses:
            shapingRecord.smoothPasses === undefined
              ? undefined
              : parseFiniteIntegerInRange(shapingRecord.smoothPasses, `${sourceLabel}.shaping.smoothPasses`, 0, 12)
        }
      : undefined
  };
}

function parseGeneratedTerrainMaterial(
  value: unknown,
  sourceLabel: string
): SceneGeneratedTerrainMaterialDescriptor | undefined {
  if (value === undefined) {
    return undefined;
  }

  const record = requireRecord(value, `${sourceLabel} must be an object.`);
  const kind = requireString(record.kind, `${sourceLabel}.kind must be a string.`);

  if (kind === "flat") {
    return {
      kind: "flat",
      color: optionalString(record.color, `${sourceLabel}.color must be a string if provided.`),
      emissive: optionalNullableHexColor(record.emissive, `${sourceLabel}.emissive`)
    };
  }

  if (kind === "heightBands") {
    return {
      kind: "heightBands",
      color: optionalString(record.color, `${sourceLabel}.color must be a string if provided.`),
      emissive: optionalNullableHexColor(record.emissive, `${sourceLabel}.emissive`),
      bands: parseTerrainMaterialBands(record.bands, `${sourceLabel}.bands`)
    };
  }

  if (kind === "bakedTexture") {
    const texture = requireString(record.texture, `${sourceLabel}.texture must be a string.`);
    assertAllowedGeneratedTerrainTextureAssetPath(texture, `${sourceLabel}.texture`);
    return {
      kind: "bakedTexture",
      texture,
      color: optionalString(record.color, `${sourceLabel}.color must be a string if provided.`),
      emissive: optionalNullableHexColor(record.emissive, `${sourceLabel}.emissive`),
      uvScale: parseOptionalVector2Tuple(record.uvScale, `${sourceLabel}.uvScale`)
    };
  }

  throw new Error(`${sourceLabel}.kind must be 'flat', 'heightBands', or 'bakedTexture'.`);
}

function parseTerrainMaterialBands(
  value: unknown,
  sourceLabel: string
): readonly SceneTerrainMaterialBandDescriptor[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error(`${sourceLabel} must be a non-empty array.`);
  }

  return value.map((item, index) => {
    const record = requireRecord(item, `${sourceLabel}[${index}] must be an object.`);
    const minHeight = parseFiniteNumber(record.minHeight, `${sourceLabel}[${index}].minHeight must be a finite number.`);
    const maxHeight = parseFiniteNumber(record.maxHeight, `${sourceLabel}[${index}].maxHeight must be a finite number.`);
    if (maxHeight < minHeight) {
      throw new Error(`${sourceLabel}[${index}] maxHeight must be greater than or equal to minHeight.`);
    }

    return {
      id: requireString(record.id, `${sourceLabel}[${index}].id must be a string.`),
      label: requireString(record.label, `${sourceLabel}[${index}].label must be a string.`),
      minHeight,
      maxHeight,
      color: requireString(record.color, `${sourceLabel}[${index}].color must be a string.`)
    };
  });
}

function parseObjectDescriptor(value: unknown, sourceLabel: string): SceneObjectDescriptor {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${sourceLabel} must be an object.`);
  }

  const record = value as Record<string, unknown>;
  const asset = requireString(record.asset, `${sourceLabel}.asset must be a string.`);
  assertAllowedSceneAssetPath(asset, `${sourceLabel}.asset`);

  return {
    id: requireString(record.id, `${sourceLabel}.id must be a string.`),
    type: requireString(record.type, `${sourceLabel}.type must be a string.`),
    asset,
    position: parseVector3Tuple(record.position, `${sourceLabel}.position`) ?? DEFAULT_POSITION,
    rotation: parseVector3Tuple(record.rotation, `${sourceLabel}.rotation`) ?? DEFAULT_ROTATION,
    scale: parseVector3Tuple(record.scale, `${sourceLabel}.scale`) ?? DEFAULT_SCALE
  };
}

function assertAllowedSceneAssetPath(assetPath: string, sourceLabel: string): void {
  if (isLegacySceneAssetPath(assetPath)) {
    throw new Error(`${sourceLabel} must not reference legacy assets/scenes content.`);
  }
}

function assertAllowedGeneratedTerrainTextureAssetPath(assetPath: string, sourceLabel: string): void {
  assertAllowedSceneAssetPath(assetPath, sourceLabel);
  if (assetPath.startsWith("/")) {
    throw new Error(`${sourceLabel} must be a relative asset path under assets/generated/terrain.`);
  }

  const normalized = assetPath.replace(/\\/g, "/");
  if (normalized.includes("..") || !normalized.startsWith("assets/generated/terrain/") || !normalized.endsWith(".png")) {
    throw new Error(`${sourceLabel} must be a .png under assets/generated/terrain.`);
  }
}

function parseChunkCoord(value: unknown, sourceLabel: string): readonly [number, number] | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (!Array.isArray(value) || value.length !== 2) {
    throw new Error(`${sourceLabel} must be a [x, z] tuple.`);
  }

  const [x, z] = value;
  if (!Number.isFinite(x) || !Number.isInteger(x)) {
    throw new Error(`${sourceLabel}[0] must be a finite integer.`);
  }

  if (!Number.isFinite(z) || !Number.isInteger(z)) {
    throw new Error(`${sourceLabel}[1] must be a finite integer.`);
  }

  return [x, z] as const;
}

function parseVector2Tuple(value: unknown, sourceLabel: string): SceneVector2Tuple {
  if (!Array.isArray(value) || value.length !== 2) {
    throw new Error(`${sourceLabel} must be a [x, z] tuple.`);
  }

  const [x, z] = value;
  if (![x, z].every((item) => typeof item === "number" && Number.isFinite(item))) {
    throw new Error(`${sourceLabel} must contain two finite numbers.`);
  }

  return [x, z] as const;
}

function parseOptionalVector2Tuple(value: unknown, sourceLabel: string): SceneVector2Tuple | undefined {
  if (value === undefined) {
    return undefined;
  }

  return parseVector2Tuple(value, sourceLabel);
}

function parsePositiveIntegerVector2Tuple(value: unknown, sourceLabel: string): SceneVector2Tuple {
  if (!Array.isArray(value) || value.length !== 2) {
    throw new Error(`${sourceLabel} must be a [x, z] tuple.`);
  }

  const [x, z] = value;
  const parsedX = parseFiniteIntegerInRange(x, `${sourceLabel}[0]`, 1, 16384);
  const parsedZ = parseFiniteIntegerInRange(z, `${sourceLabel}[1]`, 1, 16384);
  return [parsedX, parsedZ] as const;
}

function parseOptionalPositiveIntegerVector2Tuple(value: unknown, sourceLabel: string): SceneVector2Tuple | undefined {
  if (value === undefined) {
    return undefined;
  }

  return parsePositiveIntegerVector2Tuple(value, sourceLabel);
}

function parseTerrainSizeTuple(value: unknown, sourceLabel: string): SceneVector2Tuple {
  const result = parseVector2Tuple(value, sourceLabel);
  if (result[0] <= 0 || result[1] <= 0) {
    throw new Error(`${sourceLabel} must contain positive numbers.`);
  }

  return result;
}

function parseTerrainResolutionTuple(value: unknown, sourceLabel: string): SceneVector2Tuple {
  if (!Array.isArray(value) || value.length !== 2) {
    throw new Error(`${sourceLabel} must be a [x, z] tuple.`);
  }

  const [x, z] = value;
  const parsedX = parseFiniteIntegerInRange(x, `${sourceLabel}[0]`, 3, MAX_GENERATED_TERRAIN_RESOLUTION);
  const parsedZ = parseFiniteIntegerInRange(z, `${sourceLabel}[1]`, 3, MAX_GENERATED_TERRAIN_RESOLUTION);

  if (parsedX % 2 === 0 || parsedZ % 2 === 0) {
    throw new Error(`${sourceLabel} must use odd integer values such as 33, 65, 129, 257, or 4097.`);
  }

  return [parsedX, parsedZ] as const;
}

function parseVector3Tuple(value: unknown, sourceLabel: string): SceneVector3Tuple | undefined {
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

function requireString(value: unknown, errorMessage: string): string {
  if (typeof value !== "string") {
    throw new Error(errorMessage);
  }

  return value;
}

function optionalString(value: unknown, errorMessage: string): string | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== "string") {
    throw new Error(errorMessage);
  }

  return value;
}

function parseStringArray(value: unknown, sourceLabel: string): readonly string[] {
  if (!Array.isArray(value)) {
    throw new Error(`${sourceLabel} must be an array.`);
  }

  return value.map((entry, index) => requireString(entry, `${sourceLabel}[${index}] must be a string.`));
}

function optionalNullableHexColor(value: unknown, sourceLabel: string): string | null | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (value === null) {
    return null;
  }

  if (typeof value !== "string" || !/^#[0-9A-Fa-f]{6}$/.test(value)) {
    throw new Error(`${sourceLabel} must be a #RRGGBB color string or null if provided.`);
  }

  return value;
}

function parseTerrainNormalMode(value: unknown, sourceLabel: string): SceneTerrainNormalMode | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (value !== "smooth" && value !== "flat") {
    throw new Error(`${sourceLabel} must be 'smooth' or 'flat'.`);
  }

  return value;
}

function parseGeneratedTerrainResolutionMode(
  value: unknown,
  sourceLabel: string
): SceneGeneratedTerrainResolutionMode {
  if (value === undefined) {
    return "gridStep";
  }

  if (value !== "gridStep" && value !== "manual") {
    throw new Error(`${sourceLabel} must be 'gridStep' or 'manual'.`);
  }

  return value;
}

function parseGeneratedTerrainLodStrategy(value: unknown, sourceLabel: string): "quadtree" | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (value !== "quadtree") {
    throw new Error(`${sourceLabel} must be 'quadtree'.`);
  }

  return value;
}

function parseGeneratedTerrainLodSplitDistances(
  value: unknown,
  sourceLabel: string
): readonly number[] | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (!Array.isArray(value) || value.length === 0) {
    throw new Error(`${sourceLabel} must be a non-empty sorted array of positive numbers.`);
  }

  const distances = value.map((entry, index) =>
    parseFiniteNumberInRange(entry, `${sourceLabel}[${index}]`, 0.0001, Number.POSITIVE_INFINITY)
  );
  for (let index = 1; index < distances.length; index += 1) {
    if ((distances[index] ?? 0) < (distances[index - 1] ?? 0)) {
      throw new Error(`${sourceLabel} must be sorted in ascending order.`);
    }
  }

  return distances;
}

function parseGeneratedTerrainLodRings(
  value: unknown,
  sourceLabel: string
): readonly SceneGeneratedTerrainLodRingDescriptor[] | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (!Array.isArray(value) || value.length === 0) {
    throw new Error(`${sourceLabel} must be a non-empty sorted array.`);
  }

  const rings = value.map((item, index) => {
    const record = requireRecord(item, `${sourceLabel}[${index}] must be an object.`);
    return {
      distance: parseFiniteNumberInRange(
        record.distance,
        `${sourceLabel}[${index}].distance`,
        0.0001,
        Number.POSITIVE_INFINITY
      ),
      maxSampleStep: parseFiniteIntegerInRange(
        record.maxSampleStep,
        `${sourceLabel}[${index}].maxSampleStep`,
        1,
        128
      )
    };
  });

  for (let index = 1; index < rings.length; index += 1) {
    if ((rings[index]?.distance ?? 0) < (rings[index - 1]?.distance ?? 0)) {
      throw new Error(`${sourceLabel} must be sorted in ascending distance order.`);
    }
  }

  return rings;
}

function requireRecord(value: unknown, errorMessage: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(errorMessage);
  }

  return value as Record<string, unknown>;
}

function optionalRecord(value: unknown, errorMessage: string): Record<string, unknown> | undefined {
  if (value === undefined) {
    return undefined;
  }

  return requireRecord(value, errorMessage);
}

function parseFiniteNumber(value: unknown, errorMessage: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(errorMessage);
  }

  return value;
}

function parseFiniteInteger(value: unknown, errorMessage: string): number {
  const parsed = parseFiniteNumber(value, errorMessage);
  if (!Number.isInteger(parsed)) {
    throw new Error(errorMessage);
  }

  return parsed;
}

function parseFiniteNumberInRange(value: unknown, sourceLabel: string, min: number, max: number): number {
  const parsed = parseFiniteNumber(value, `${sourceLabel} must be a finite number.`);
  if (parsed < min || parsed > max) {
    throw new Error(`${sourceLabel} must be between ${min} and ${max}.`);
  }

  return parsed;
}

function parseFiniteIntegerInRange(value: unknown, sourceLabel: string, min: number, max: number): number {
  const parsed = parseFiniteInteger(value, `${sourceLabel} must be a finite integer.`);
  if (parsed < min || parsed > max) {
    throw new Error(`${sourceLabel} must be between ${min} and ${max}.`);
  }

  return parsed;
}

function parseBoolean(value: unknown, errorMessage: string): boolean {
  if (typeof value !== "boolean") {
    throw new Error(errorMessage);
  }

  return value;
}

function optionalBoolean(value: unknown, errorMessage: string): boolean | undefined {
  if (value === undefined) {
    return undefined;
  }

  return parseBoolean(value, errorMessage);
}

function parseTerrainFalloffMode(
  value: unknown,
  sourceLabel: string
): "none" | "island" | "centerPlateau" | "edgeFade" {
  const parsed = requireString(value, `${sourceLabel} must be a string.`);
  if (parsed !== "none" && parsed !== "island" && parsed !== "centerPlateau" && parsed !== "edgeFade") {
    throw new Error(`${sourceLabel} must be 'none', 'island', 'centerPlateau', or 'edgeFade'.`);
  }

  return parsed;
}
