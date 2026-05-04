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
