import { AbstractMesh, TransformNode, type Node } from "@babylonjs/core";

export type BuildingVisibilityRole =
  | "wall_halo"
  | "hide_above_player"
  | "inside_volume"
  | "ground"
  | "ignore";

export type BuildingVisibilityBehavior =
  | "default"
  | "hide_above_player"
  | "external_stair_connector"
  | "always_visible_when_building_visible"
  | "ignore";

export type BuildingLodRole = "full" | "exterior" | "shadow_proxy";

export interface BuildingVisibilityMeshRecord {
  readonly mesh: AbstractMesh;
  readonly buildingId: string;
  readonly storyIndex: number;
  readonly part: string;
  readonly role: BuildingVisibilityRole;
  readonly visibilityBehavior: BuildingVisibilityBehavior;
  readonly stairKind?: string | null;
  readonly fromStory?: number | null;
  readonly toStory?: number | null;
  readonly isWallHalo: boolean;
  readonly hideWhenAbovePlayer: boolean;
  readonly isInsideVolume: boolean;
  readonly isInterior: boolean;
  readonly lodGroup: string | null;
  readonly lodLevel: number | null;
  readonly lodRole: BuildingLodRole | null;
  readonly rawMetadata: Record<string, unknown> | null;
}

export interface BuildingVisibilityVolumeMetadata {
  readonly node: TransformNode;
  readonly buildingId: string;
  readonly storyIndex: number;
  readonly volumeMin: readonly [number, number, number];
  readonly volumeMax: readonly [number, number, number];
  readonly storyZOffset: number;
  readonly rawMetadata: Record<string, unknown>;
}

interface RawBuildingVisibilityMetadata {
  readonly game_visibility?: unknown;
  readonly game_building_id?: unknown;
  readonly game_story_index?: unknown;
  readonly game_part?: unknown;
  readonly game_visibility_role?: unknown;
  readonly game_visibility_behavior?: unknown;
  readonly game_hide_when_above_player?: unknown;
  readonly game_inside_volume_source?: unknown;
  readonly game_interior?: unknown;
  readonly game_lod_group?: unknown;
  readonly game_lod_level?: unknown;
  readonly game_lod_role?: unknown;
  readonly game_volume_kind?: unknown;
  readonly game_volume_min?: unknown;
  readonly game_volume_max?: unknown;
  readonly game_story_z_offset?: unknown;
  readonly stair_kind?: unknown;
  readonly from_story?: unknown;
  readonly to_story?: unknown;
  readonly part?: unknown;
  readonly building_part?: unknown;
  readonly stair_part?: unknown;
  readonly sceneObjectId?: unknown;
  readonly sceneObjectType?: unknown;
  readonly buildingVisibilityInstanceId?: unknown;
}

const ROLE_VALUES = new Set<BuildingVisibilityRole>([
  "wall_halo",
  "hide_above_player",
  "inside_volume",
  "ground",
  "ignore"
]);

const BEHAVIOR_VALUES = new Set<BuildingVisibilityBehavior>([
  "default",
  "hide_above_player",
  "external_stair_connector",
  "always_visible_when_building_visible",
  "ignore"
]);

const WALL_NAME_PATTERN = /(OuterWall|InnerWall)/i;
const BUILDING_PART_NAME_PATTERN =
  /(Story|OuterWall|InnerWall|Wall|Roof|Ceiling|Slab|Terrace|Floor|Border|Band|Railing|Stair|Window|Door|Glass|Frame|Sill|Reveal|Interior|Inside|Room|Furniture|Fixture|Prop)/i;
const HIDE_ABOVE_NAME_PATTERN =
  /(Roof|Ceiling|Slab|Terrace|Floor|Border|Band|Railing|Stair|Window|Door|Glass|Frame|Sill|Reveal)/i;
const INSIDE_VOLUME_NAME_PATTERN = /(InsideVolume|InteriorVolume|BuildingVolume)/i;

export function parseBuildingVisibilityMesh(mesh: AbstractMesh): BuildingVisibilityMeshRecord | null {
  if (isVisibilityHelperMesh(mesh)) {
    return null;
  }

  const metadata = resolveVisibilityMetadata(mesh);
  if (metadata) {
    return parseMetadataRecord(mesh, metadata);
  }

  return parseFallbackNameRecord(mesh);
}

export function parseBuildingVisibilityVolumeMetadata(
  node: TransformNode
): BuildingVisibilityVolumeMetadata | null {
  const metadata = resolveOwnVisibilityMetadata(node);
  if (!metadata || normalizeRole(metadata.game_visibility_role) !== "inside_volume") {
    return null;
  }

  const volumeMin = normalizeVector3Tuple(metadata.game_volume_min);
  const volumeMax = normalizeVector3Tuple(metadata.game_volume_max);
  if (!volumeMin || !volumeMax) {
    return null;
  }

  const instanceBuildingId =
    normalizeString(metadata.buildingVisibilityInstanceId) ??
    normalizeString(metadata.sceneObjectId);
  const authoredBuildingId = normalizeString(metadata.game_building_id);

  return {
    node,
    buildingId: instanceBuildingId ?? authoredBuildingId ?? "metadata-building",
    storyIndex:
      normalizeStoryIndex(metadata.game_story_index) ??
      parseStoryIndex(node.name) ??
      0,
    volumeMin,
    volumeMax,
    storyZOffset:
      normalizeFiniteNumber(metadata.game_story_z_offset) ?? volumeMin[2],
    rawMetadata: metadata as Record<string, unknown>
  };
}

function parseMetadataRecord(
  mesh: AbstractMesh,
  metadata: RawBuildingVisibilityMetadata
): BuildingVisibilityMeshRecord | null {
  const hasVisibilityMarker = hasGameVisibilityMetadata(metadata as Record<string, unknown>);
  const role = normalizeRole(metadata.game_visibility_role) ?? inferFallbackRole(mesh.name);
  const instanceBuildingId =
    normalizeString(metadata.buildingVisibilityInstanceId) ??
    normalizeString(metadata.sceneObjectId);
  const authoredBuildingId = normalizeString(metadata.game_building_id);
  const buildingId = instanceBuildingId ?? authoredBuildingId;
  const part =
    normalizeString(metadata.game_part) ??
    normalizeString(metadata.part) ??
    normalizeString(metadata.building_part) ??
    normalizeString(metadata.stair_part) ??
    mesh.name;
  const stairKind = normalizeString(metadata.stair_kind);
  const fromStory = normalizeStoryIndex(metadata.from_story);
  const toStory = normalizeStoryIndex(metadata.to_story);
  const lodGroup = normalizeString(metadata.game_lod_group);
  const lodLevel = normalizeLodLevel(metadata.game_lod_level);
  const lodRole = normalizeLodRole(metadata.game_lod_role);

  if (!hasVisibilityMarker && !role && !buildingId) {
    return null;
  }

  const normalizedRole = role ?? "ignore";
  const visibilityBehavior = normalizeBehavior(metadata.game_visibility_behavior)
    ?? inferFallbackBehavior(part, stairKind, normalizedRole);

  return {
    mesh,
    buildingId: buildingId ?? "metadata-building",
    storyIndex: normalizeStoryIndex(metadata.game_story_index) ?? parseStoryIndex(mesh.name) ?? 0,
    part,
    role: normalizedRole,
    visibilityBehavior,
    stairKind,
    fromStory,
    toStory,
    isWallHalo: normalizedRole === "wall_halo",
    hideWhenAbovePlayer:
      normalizedRole === "hide_above_player" || metadata.game_hide_when_above_player === true,
    isInsideVolume: isInsideVolumeRecord(mesh, metadata, normalizedRole),
    isInterior: isInteriorRecord(mesh, metadata, part, normalizedRole),
    lodGroup,
    lodLevel,
    lodRole,
    rawMetadata: metadata as Record<string, unknown>
  };
}

function parseFallbackNameRecord(mesh: AbstractMesh): BuildingVisibilityMeshRecord | null {
  const name = mesh.name;
  const role = inferFallbackRole(name);

  if (!role && !BUILDING_PART_NAME_PATTERN.test(name)) {
    return null;
  }

  const normalizedRole = role ?? "ignore";
  const isWallHalo = normalizedRole === "wall_halo";
  const isInsideVolume = normalizedRole === "inside_volume";
  const hideWhenAbovePlayer = normalizedRole === "hide_above_player";

  return {
    mesh,
    buildingId: parseFallbackBuildingId(name),
    storyIndex: parseStoryIndex(name) ?? 0,
    part: name,
    role: normalizedRole,
    visibilityBehavior: inferFallbackBehavior(name, null, normalizedRole),
    stairKind: null,
    fromStory: null,
    toStory: null,
    isWallHalo,
    hideWhenAbovePlayer,
    isInsideVolume,
    isInterior: isFallbackInteriorRecord(name, normalizedRole),
    lodGroup: null,
    lodLevel: null,
    lodRole: null,
    rawMetadata: null
  };
}

function resolveVisibilityMetadata(mesh: AbstractMesh): RawBuildingVisibilityMetadata | null {
  let currentNode: Node | null = mesh;
  let runtimeOverrides: Record<string, unknown> = {};
  let authoredMetadata: Record<string, unknown> = {};
  let hasAuthoredMetadata = false;

  while (currentNode) {
    const metadata = currentNode.metadata;
    if (metadata && typeof metadata === "object") {
      const metadataRecord = metadata as Record<string, unknown>;
      runtimeOverrides = {
        ...pickRuntimeVisibilityOverrides(metadataRecord),
        ...runtimeOverrides
      };
      const record = resolveExtrasRecord(metadataRecord);
      if (hasAuthoredVisibilityMetadata(record)) {
        authoredMetadata = {
          ...record,
          ...authoredMetadata
        };
        hasAuthoredMetadata = true;
      }
    }

    currentNode = currentNode.parent;
  }

  return hasAuthoredMetadata || Object.keys(runtimeOverrides).length > 0
    ? {
        ...authoredMetadata,
        ...runtimeOverrides
      } as RawBuildingVisibilityMetadata
    : null;
}

function resolveOwnVisibilityMetadata(node: Node): RawBuildingVisibilityMetadata | null {
  const metadata = node.metadata;
  if (!metadata || typeof metadata !== "object") {
    return null;
  }

  const record = resolveExtrasRecord(metadata as Record<string, unknown>);
  return hasAuthoredVisibilityMetadata(record)
    ? record as RawBuildingVisibilityMetadata
    : null;
}

function isVisibilityHelperMesh(mesh: AbstractMesh): boolean {
  const metadata = mesh.metadata && typeof mesh.metadata === "object"
    ? mesh.metadata as Record<string, unknown>
    : {};
  const gltf = metadata.gltf && typeof metadata.gltf === "object"
    ? metadata.gltf as Record<string, unknown>
    : {};
  const extras = gltf.extras && typeof gltf.extras === "object"
    ? gltf.extras as Record<string, unknown>
    : {};
  const rawMetadata = metadata.rawMetadata && typeof metadata.rawMetadata === "object"
    ? metadata.rawMetadata as Record<string, unknown>
    : {};

  return [metadata, extras, rawMetadata].some((source) =>
    source.gameHelper === true || source.game_helper === true
  );
}

function resolveExtrasRecord(metadata: Record<string, unknown>): Record<string, unknown> {
  const runtimeOverrides = pickRuntimeVisibilityOverrides(metadata);
  const gltfPayload = metadata.gltf;
  if (gltfPayload && typeof gltfPayload === "object") {
    const extrasPayload = (gltfPayload as Record<string, unknown>).extras;
    if (extrasPayload && typeof extrasPayload === "object") {
      return {
        ...(extrasPayload as Record<string, unknown>),
        ...runtimeOverrides
      };
    }
  }

  return {
    ...metadata,
    ...runtimeOverrides
  };
}

function pickRuntimeVisibilityOverrides(metadata: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  if ("sceneObjectId" in metadata) {
    result.sceneObjectId = metadata.sceneObjectId;
  }
  if ("sceneObjectType" in metadata) {
    result.sceneObjectType = metadata.sceneObjectType;
  }
  if ("buildingVisibilityInstanceId" in metadata) {
    result.buildingVisibilityInstanceId = metadata.buildingVisibilityInstanceId;
  }
  return result;
}

function hasGameVisibilityMetadata(record: Record<string, unknown>): boolean {
  return (
    hasAuthoredVisibilityMetadata(record) ||
    "sceneObjectId" in record ||
    "buildingVisibilityInstanceId" in record
  );
}

function hasAuthoredVisibilityMetadata(record: Record<string, unknown>): boolean {
  return (
    "game_visibility" in record ||
    "game_building_id" in record ||
    "game_story_index" in record ||
    "game_part" in record ||
    "game_visibility_role" in record ||
    "game_visibility_behavior" in record ||
    "game_hide_when_above_player" in record ||
    "game_inside_volume_source" in record ||
    "game_interior" in record ||
    "game_lod_group" in record ||
    "game_lod_level" in record ||
    "game_lod_role" in record ||
    "game_volume_kind" in record ||
    "game_volume_min" in record ||
    "game_volume_max" in record ||
    "game_story_z_offset" in record ||
    "stair_kind" in record ||
    "from_story" in record ||
    "to_story" in record ||
    "part" in record ||
    "building_part" in record ||
    "stair_part" in record
  );
}

function normalizeRole(value: unknown): BuildingVisibilityRole | null {
  const normalized = normalizeString(value);
  if (!normalized || !ROLE_VALUES.has(normalized as BuildingVisibilityRole)) {
    return null;
  }

  return normalized as BuildingVisibilityRole;
}

function normalizeBehavior(value: unknown): BuildingVisibilityBehavior | null {
  const normalized = normalizeString(value);
  if (!normalized || !BEHAVIOR_VALUES.has(normalized as BuildingVisibilityBehavior)) {
    return null;
  }

  return normalized as BuildingVisibilityBehavior;
}

function normalizeLodLevel(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.trunc(value);
  }

  if (typeof value === "string") {
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function normalizeLodRole(value: unknown): BuildingLodRole | null {
  if (value === "full" || value === "exterior" || value === "shadow_proxy") {
    return value;
  }

  return null;
}

function normalizeVector3Tuple(value: unknown): readonly [number, number, number] | null {
  if (
    !Array.isArray(value) ||
    value.length !== 3 ||
    !value.every((component) => typeof component === "number" && Number.isFinite(component))
  ) {
    return null;
  }

  return [value[0], value[1], value[2]];
}

function normalizeFiniteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function inferFallbackBehavior(
  part: string,
  stairKind: string | null,
  role: BuildingVisibilityRole
): BuildingVisibilityBehavior {
  if (isExternalStairPart(part) && stairKind === "external") {
    return "external_stair_connector";
  }

  if (role === "hide_above_player") {
    return "hide_above_player";
  }

  if (role === "ignore") {
    return "ignore";
  }

  return "default";
}

function isExternalStairPart(part: string): boolean {
  return /^(external[_ -]?stair|stairs?|staircase)$/i.test(part);
}

function normalizeString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeStoryIndex(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.trunc(value);
  }

  if (typeof value === "string") {
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function parseStoryIndex(name: string): number | null {
  const match = /Story[_ -]?(-?\d+)/i.exec(name);
  if (!match) {
    return null;
  }

  const parsed = Number.parseInt(match[1], 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function inferFallbackRole(name: string): BuildingVisibilityRole | null {
  if (INSIDE_VOLUME_NAME_PATTERN.test(name)) {
    return "inside_volume";
  }

  if (WALL_NAME_PATTERN.test(name)) {
    return "wall_halo";
  }

  if (HIDE_ABOVE_NAME_PATTERN.test(name)) {
    return "hide_above_player";
  }

  return null;
}

function isInsideVolumeRecord(
  mesh: AbstractMesh,
  metadata: RawBuildingVisibilityMetadata,
  role: BuildingVisibilityRole
): boolean {
  if (role === "inside_volume") {
    return true;
  }

  const part = normalizeString(metadata.game_part);
  return metadata.game_inside_volume_source === true && isInsideVolumeName(part ?? mesh.name);
}

function isInsideVolumeName(name: string): boolean {
  return INSIDE_VOLUME_NAME_PATTERN.test(name) || /visibility[_ -]?volume/i.test(name);
}

function isInteriorRecord(
  mesh: AbstractMesh,
  metadata: RawBuildingVisibilityMetadata,
  part: string,
  role: BuildingVisibilityRole
): boolean {
  if (role === "inside_volume") {
    return false;
  }

  if (typeof metadata.game_interior === "boolean") {
    return metadata.game_interior;
  }

  const lodGroup = normalizeString(metadata.game_lod_group);
  if (lodGroup) {
    return lodGroup.toLowerCase() === "interior";
  }

  return isFallbackInteriorRecord(`${part} ${mesh.name}`, role);
}

function isFallbackInteriorRecord(name: string, role: BuildingVisibilityRole): boolean {
  if (role === "inside_volume") {
    return false;
  }

  return /InnerWall|Interior|Inside|Room|Furniture|Fixture|Prop/i.test(name);
}

function parseFallbackBuildingId(name: string): string {
  const match = /(Building[_-]?[A-Za-z0-9]+)/i.exec(name);
  return match?.[1] ?? "fallback-building";
}
