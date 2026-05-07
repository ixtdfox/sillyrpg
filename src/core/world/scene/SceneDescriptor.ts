export type SceneVector2Tuple = readonly [number, number];
export type SceneVector3Tuple = readonly [number, number, number];

export interface SceneFlatTerrainMaterialDescriptor {
  readonly kind: "flat";
  readonly color?: string;
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

export type SceneTerrainDescriptor = ScenePlaneTerrainDescriptor | SceneModelTerrainDescriptor;

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
  readonly terrain?: SceneTerrainDescriptor | null;
  readonly objects: readonly SceneObjectDescriptor[];
}

const DEFAULT_POSITION: SceneVector3Tuple = [0, 0, 0];
const DEFAULT_ROTATION: SceneVector3Tuple = [0, 0, 0];
const DEFAULT_SCALE: SceneVector3Tuple = [1, 1, 1];

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
  const terrain = parseTerrainDescriptor(record.terrain, `${sourceLabel} terrain`);
  const objects = parseObjectDescriptors(record.objects, `${sourceLabel} objects`);

  return {
    schemaVersion: 2,
    id,
    title,
    chunkCoord,
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

  throw new Error(`${sourceLabel}.kind must be 'plane' or 'model'.`);
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
    color: optionalString(record.color, `${sourceLabel}.color must be a string if provided.`)
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
