import type { AbstractMesh, Node } from "@babylonjs/core";

export type StairKind = "internal" | "external";

export interface StairCheckpointMetadata {
  readonly nav_kind: "stair_checkpoint";
  readonly stair_id: string;
  readonly checkpoint_index: number;
  readonly checkpoint_role?: string;
  readonly from_story: number;
  readonly to_story: number;
  readonly stair_kind?: StairKind;
  readonly cost?: number;
  readonly bidirectional?: boolean;
}

export interface StairConnectorMetadata {
  readonly nav_kind: "stair_connector";
  readonly stair_id: string;
  readonly from_story: number;
  readonly to_story: number;
  readonly stair_kind?: StairKind;
  readonly cost?: number;
  readonly bidirectional?: boolean;
}

export interface PickableStoryMetadata {
  readonly storyIndex: number;
}

export interface StairPickMetadata {
  readonly stairId?: string;
  readonly stairKind?: StairKind;
  readonly fromStory?: number;
  readonly toStory?: number;
  readonly isStairLike: boolean;
}

export function parseStairCheckpointMetadata(mesh: AbstractMesh): StairCheckpointMetadata | null {
  const metadata = resolveNavigationMetadata(mesh);
  if (!metadata || metadata.nav_kind !== "stair_checkpoint") {
    return null;
  }

  const stairId = normalizeString(metadata.stair_id);
  const checkpointIndex = normalizeInteger(metadata.checkpoint_index);
  const fromStory = normalizeInteger(metadata.from_story);
  const toStory = normalizeInteger(metadata.to_story);

  if (!stairId || checkpointIndex === null || fromStory === null || toStory === null) {
    return null;
  }

  return {
    nav_kind: "stair_checkpoint",
    stair_id: stairId,
    checkpoint_index: checkpointIndex,
    checkpoint_role: normalizeString(metadata.checkpoint_role) ?? undefined,
    from_story: fromStory,
    to_story: toStory,
    stair_kind: normalizeStairKind(metadata.stair_kind) ?? undefined,
    cost: normalizeFiniteNumber(metadata.cost) ?? undefined,
    bidirectional: normalizeBoolean(metadata.bidirectional) ?? undefined
  };
}

export function parseStairConnectorMetadata(mesh: AbstractMesh): StairConnectorMetadata | null {
  const metadata = resolveNavigationMetadata(mesh);
  if (!metadata || metadata.nav_kind !== "stair_connector") {
    return null;
  }

  const stairId = normalizeString(metadata.stair_id);
  const fromStory = normalizeInteger(metadata.from_story);
  const toStory = normalizeInteger(metadata.to_story);

  if (!stairId || fromStory === null || toStory === null) {
    return null;
  }

  return {
    nav_kind: "stair_connector",
    stair_id: stairId,
    from_story: fromStory,
    to_story: toStory,
    stair_kind: normalizeStairKind(metadata.stair_kind) ?? undefined,
    cost: normalizeFiniteNumber(metadata.cost) ?? undefined,
    bidirectional: normalizeBoolean(metadata.bidirectional) ?? undefined
  };
}

export function parseStairPickMetadata(mesh: AbstractMesh): StairPickMetadata | null {
  const metadata = resolveNavigationMetadata(mesh);
  const stairId = metadata ? normalizeString(metadata.stair_id) : null;
  const stairKind = metadata ? normalizeStairKind(metadata.stair_kind) : null;
  const navKind = metadata ? normalizeString(metadata.nav_kind) : null;
  const part = metadata ? normalizeString(metadata.part) ?? normalizeString(metadata.building_part) : null;
  const stairPart = metadata ? normalizeString(metadata.stair_part) : null;
  const isMetadataStairLike = Boolean(
    navKind === "stair_connector" ||
    navKind === "stair_checkpoint" ||
    navKind === "stair_pick_proxy" ||
    stairId ||
    stairKind ||
    stairPart ||
    part === "stair" ||
    part === "external_stair"
  );
  const isNameStairLike = /\b(external[_ -]?stair|stairs?|staircase)\b/i.test(mesh.name);

  if (!isMetadataStairLike && !isNameStairLike) {
    return null;
  }

  return {
    stairId: stairId ?? undefined,
    stairKind: stairKind ?? undefined,
    fromStory: metadata ? normalizeInteger(metadata.from_story) ?? undefined : undefined,
    toStory: metadata ? normalizeInteger(metadata.to_story) ?? undefined : undefined,
    isStairLike: true
  };
}

export function isNavigationPickableSurface(mesh: AbstractMesh): boolean {
  if (parseStairPickMetadata(mesh)) {
    return true;
  }

  const metadata = resolveNavigationMetadata(mesh);
  const part = metadata
    ? normalizeString(metadata.part) ?? normalizeString(metadata.building_part) ?? normalizeString(metadata.role)
    : null;
  if ((part && isBlockedSurfaceName(part)) || isBlockedSurfaceName(mesh.name)) {
    return false;
  }

  if (parsePickableStoryMetadata(mesh)) {
    return true;
  }

  if (part && isWalkableSurfaceName(part) && !isBlockedSurfaceName(part)) {
    return true;
  }

  return isWalkableSurfaceName(mesh.name) && !isBlockedSurfaceName(mesh.name);
}

export function parsePickableStoryMetadata(mesh: AbstractMesh): PickableStoryMetadata | null {
  const metadata = resolveNavigationMetadata(mesh);
  if (!metadata) {
    return null;
  }

  const storyIndex =
    normalizeInteger(metadata.storyIndex) ??
    normalizeInteger(metadata.story_index) ??
    normalizeInteger(metadata.floorIndex) ??
    normalizeInteger(metadata.game_story_index);

  return storyIndex === null ? null : { storyIndex };
}

function resolveNavigationMetadata(mesh: AbstractMesh): Record<string, unknown> | null {
  let currentNode: Node | null = mesh;

  while (currentNode) {
    const metadata = currentNode.metadata;
    if (metadata && typeof metadata === "object") {
      const record = resolveExtrasRecord(metadata as Record<string, unknown>);
      if (hasNavigationMetadata(record)) {
        return record;
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

function hasNavigationMetadata(record: Record<string, unknown>): boolean {
  return (
    "nav_kind" in record ||
    "stair_id" in record ||
    "stair_kind" in record ||
    "stair_part" in record ||
    "part" in record ||
    "building_part" in record ||
    "storyIndex" in record ||
    "story_index" in record ||
    "floorIndex" in record ||
    "game_story_index" in record
  );
}

function normalizeString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeInteger(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.trunc(value);
  }

  if (typeof value === "string") {
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function normalizeFiniteNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function normalizeBoolean(value: unknown): boolean | null {
  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "true") {
      return true;
    }
    if (normalized === "false") {
      return false;
    }
  }

  return null;
}

function normalizeStairKind(value: unknown): StairKind | null {
  const normalized = normalizeString(value);
  if (normalized === "internal" || normalized === "external") {
    return normalized;
  }

  return null;
}

function isWalkableSurfaceName(name: string): boolean {
  return /(story[_ -]?floor|room[_ -]?floor|roof[_ -]?floor|floor|platform|landing|balcony|walkway|roof[_ -]?platform|stair[_ -]?landing|terrace|external[_ -]?stair[_ -]?landing)/i.test(name);
}

function isBlockedSurfaceName(name: string): boolean {
  return /(wall|railing|rail|window|door|glass|frame|sill|reveal)/i.test(name);
}
