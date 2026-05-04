import { AbstractMesh, type Node } from "@babylonjs/core";

export type BuildingVisibilityRole =
  | "wall_halo"
  | "hide_above_player"
  | "inside_volume"
  | "ground"
  | "ignore";

export interface BuildingVisibilityMeshRecord {
  readonly mesh: AbstractMesh;
  readonly buildingId: string;
  readonly storyIndex: number;
  readonly part: string;
  readonly role: BuildingVisibilityRole;
  readonly isWallHalo: boolean;
  readonly hideWhenAbovePlayer: boolean;
  readonly isInsideVolume: boolean;
  readonly rawMetadata: Record<string, unknown> | null;
}

interface RawBuildingVisibilityMetadata {
  readonly game_visibility?: unknown;
  readonly game_building_id?: unknown;
  readonly game_story_index?: unknown;
  readonly game_part?: unknown;
  readonly game_visibility_role?: unknown;
  readonly game_hide_when_above_player?: unknown;
  readonly game_inside_volume_source?: unknown;
}

const ROLE_VALUES = new Set<BuildingVisibilityRole>([
  "wall_halo",
  "hide_above_player",
  "inside_volume",
  "ground",
  "ignore"
]);

const WALL_NAME_PATTERN = /(OuterWall|InnerWall)/i;
const BUILDING_PART_NAME_PATTERN =
  /(Story|OuterWall|InnerWall|Wall|Roof|Ceiling|Slab|Terrace|Floor|Border|Band|Railing|Stair|Window|Door|Glass|Frame|Sill|Reveal)/i;
const HIDE_ABOVE_NAME_PATTERN =
  /(Roof|Ceiling|Slab|Terrace|Floor|Border|Band|Railing|Stair|Window|Door|Glass|Frame|Sill|Reveal)/i;
const INSIDE_VOLUME_NAME_PATTERN = /(InsideVolume|InteriorVolume|BuildingVolume)/i;

export function parseBuildingVisibilityMesh(mesh: AbstractMesh): BuildingVisibilityMeshRecord | null {
  const metadata = resolveVisibilityMetadata(mesh);
  if (metadata) {
    return parseMetadataRecord(mesh, metadata);
  }

  return parseFallbackNameRecord(mesh);
}

function parseMetadataRecord(
  mesh: AbstractMesh,
  metadata: RawBuildingVisibilityMetadata
): BuildingVisibilityMeshRecord | null {
  const hasVisibilityMarker = hasGameVisibilityMetadata(metadata as Record<string, unknown>);
  const role = normalizeRole(metadata.game_visibility_role) ?? inferFallbackRole(mesh.name);
  const buildingId = normalizeString(metadata.game_building_id);

  if (!hasVisibilityMarker && !role && !buildingId) {
    return null;
  }

  const normalizedRole = role ?? "ignore";

  return {
    mesh,
    buildingId: buildingId ?? "metadata-building",
    storyIndex: normalizeStoryIndex(metadata.game_story_index) ?? parseStoryIndex(mesh.name) ?? 0,
    part: normalizeString(metadata.game_part) ?? mesh.name,
    role: normalizedRole,
    isWallHalo: normalizedRole === "wall_halo",
    hideWhenAbovePlayer:
      normalizedRole === "hide_above_player" || metadata.game_hide_when_above_player === true,
    isInsideVolume: isInsideVolumeRecord(mesh, metadata, normalizedRole),
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
    isWallHalo,
    hideWhenAbovePlayer,
    isInsideVolume,
    rawMetadata: null
  };
}

function resolveVisibilityMetadata(mesh: AbstractMesh): RawBuildingVisibilityMetadata | null {
  let currentNode: Node | null = mesh;

  while (currentNode) {
    const metadata = currentNode.metadata;
    if (metadata && typeof metadata === "object") {
      const record = resolveExtrasRecord(metadata as Record<string, unknown>);
      if (hasGameVisibilityMetadata(record)) {
        return record as RawBuildingVisibilityMetadata;
      }
    }

    currentNode = currentNode.parent;
  }

  return null;
}

function resolveExtrasRecord(metadata: Record<string, unknown>): Record<string, unknown> {
  const gltfPayload = metadata.gltf;
  if (gltfPayload && typeof gltfPayload === "object") {
    const extrasPayload = (gltfPayload as Record<string, unknown>).extras;
    if (extrasPayload && typeof extrasPayload === "object") {
      return extrasPayload as Record<string, unknown>;
    }
  }

  return metadata;
}

function hasGameVisibilityMetadata(record: Record<string, unknown>): boolean {
  return (
    "game_visibility" in record ||
    "game_building_id" in record ||
    "game_story_index" in record ||
    "game_part" in record ||
    "game_visibility_role" in record ||
    "game_hide_when_above_player" in record ||
    "game_inside_volume_source" in record
  );
}

function normalizeRole(value: unknown): BuildingVisibilityRole | null {
  const normalized = normalizeString(value);
  if (!normalized || !ROLE_VALUES.has(normalized as BuildingVisibilityRole)) {
    return null;
  }

  return normalized as BuildingVisibilityRole;
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

function parseFallbackBuildingId(name: string): string {
  const match = /(Building[_-]?[A-Za-z0-9]+)/i.exec(name);
  return match?.[1] ?? "fallback-building";
}
