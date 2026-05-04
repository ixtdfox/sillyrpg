import type { AbstractMesh, Node } from "@babylonjs/core";

export type StairKind = "internal" | "external";
export type GameNavKind =
  | "floor"
  | "wall"
  | "door"
  | "stairs"
  | "blocking"
  | "cover"
  | "decorative"
  | "trigger"
  | "obstacle"
  | "ignore";
export type GameNavigationKind = GameNavKind;
export type GameNavFootprint = "bounds" | "bbox" | "tile" | "none";
export type GameNavigationFootprint = GameNavFootprint;
export type GameNavigationCover = "none" | "low" | "high";

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

export interface GameNavigationMetadata {
  readonly gameNav: boolean;
  readonly game_nav: boolean;
  readonly kind: GameNavigationKind;
  readonly game_nav_kind?: GameNavKind;
  readonly storyIndex: number | null;
  readonly game_nav_story_index?: number;
  readonly footprint: GameNavigationFootprint;
  readonly game_nav_footprint?: GameNavFootprint;
  readonly blocksMovement: boolean;
  readonly game_nav_blocks_movement?: boolean;
  readonly blocksVision: boolean;
  readonly game_nav_blocks_vision?: boolean;
  readonly cover: GameNavigationCover;
  readonly game_nav_cover?: GameNavigationCover;
  readonly movementCost: number;
  readonly game_nav_movement_cost?: number;
  readonly sourcePart?: string;
  readonly game_nav_source_part?: string;
  readonly tileX?: number;
  readonly tileY?: number;
  readonly edgeSide?: string;
  readonly wallOrientation?: string;
  readonly doorType?: string;
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

export function parseGameNavigationMetadata(mesh: AbstractMesh): GameNavigationMetadata | null {
  const metadata = resolveGameNavigationMetadata(mesh) ?? resolveNavigationMetadata(mesh);
  if (!metadata) {
    return null;
  }

  const explicitGameNav = normalizeBoolean(metadata.game_nav);
  const explicitBlocksMovement = normalizeBoolean(metadata.game_nav_blocks_movement);
  const navKind = normalizeString(metadata.nav_kind);
  if (
    (navKind === "stair_connector" || navKind === "stair_checkpoint" || navKind === "stair_pick_proxy") &&
    !(explicitGameNav === true && explicitBlocksMovement === true)
  ) {
    return null;
  }

  const explicitKind = normalizeGameNavigationKind(metadata.game_nav_kind);
  const sourcePart =
    normalizeString(metadata.game_nav_source_part) ??
    normalizeString(metadata.game_part) ??
    normalizeString(metadata.building_part) ??
    normalizeString(metadata.part);
  const fallbackKind = resolveFallbackGameNavigationKind(sourcePart);
  if (explicitGameNav !== true && !explicitKind && !fallbackKind) {
    return null;
  }

  const kind = explicitKind ?? fallbackKind ?? "obstacle";
  const movementCost = Math.max(1, normalizeFiniteNumber(metadata.game_nav_movement_cost) ?? 1);
  const blocksMovement = explicitBlocksMovement ?? (kind === "obstacle" || kind === "blocking" || kind === "wall");
  const storyIndex = resolveGameNavigationStoryIndex(metadata);
  const footprint = normalizeGameNavigationFootprint(metadata.game_nav_footprint) ?? resolveDefaultFootprint(kind, movementCost);
  const blocksVision = normalizeBoolean(metadata.game_nav_blocks_vision) ?? kind === "wall";
  const cover = normalizeGameNavigationCover(metadata.game_nav_cover) ?? "none";

  return {
    gameNav: explicitGameNav ?? Boolean(explicitKind),
    game_nav: explicitGameNav ?? Boolean(explicitKind),
    kind,
    game_nav_kind: kind,
    storyIndex,
    game_nav_story_index: storyIndex ?? undefined,
    footprint,
    game_nav_footprint: footprint,
    blocksMovement,
    game_nav_blocks_movement: blocksMovement,
    blocksVision,
    game_nav_blocks_vision: blocksVision,
    cover,
    game_nav_cover: cover,
    movementCost,
    game_nav_movement_cost: movementCost,
    sourcePart: sourcePart ?? undefined,
    game_nav_source_part: sourcePart ?? undefined,
    tileX: normalizeInteger(metadata.game_nav_tile_x) ?? normalizeInteger(metadata.tile_x) ?? undefined,
    tileY: normalizeInteger(metadata.game_nav_tile_y) ?? normalizeInteger(metadata.tile_y) ?? undefined,
    edgeSide: normalizeString(metadata.edge_side) ?? undefined,
    wallOrientation: normalizeString(metadata.wallOrientation) ?? normalizeString(metadata.wall_orientation) ?? undefined,
    doorType: normalizeString(metadata.door_type) ?? normalizeString(metadata.doorType) ?? undefined
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

function resolveGameNavigationMetadata(mesh: AbstractMesh): Record<string, unknown> | null {
  let currentNode: Node | null = mesh;

  while (currentNode) {
    const metadata = currentNode.metadata;
    if (metadata && typeof metadata === "object") {
      const record = resolveExtrasRecord(metadata as Record<string, unknown>);
      if (hasGameNavigationMetadata(record)) {
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
    hasGameNavigationMetadata(record) ||
    "game_part" in record ||
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

function hasGameNavigationMetadata(record: Record<string, unknown>): boolean {
  return (
    "game_nav" in record ||
    "game_nav_kind" in record ||
    "game_nav_blocks_movement" in record ||
    "game_nav_blocks_vision" in record ||
    "game_nav_footprint" in record ||
    "game_nav_story_index" in record ||
    "game_nav_movement_cost" in record ||
    "game_nav_source_part" in record ||
    "game_nav_cover" in record
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

  if (typeof value === "number" && Number.isFinite(value)) {
    if (value === 1) {
      return true;
    }
    if (value === 0) {
      return false;
    }
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

function normalizeGameNavigationKind(value: unknown): GameNavigationKind | null {
  const normalized = normalizeString(value);
  if (
    normalized === "floor" ||
    normalized === "obstacle" ||
    normalized === "blocking" ||
    normalized === "cover" ||
    normalized === "wall" ||
    normalized === "door" ||
    normalized === "stairs" ||
    normalized === "decorative" ||
    normalized === "trigger" ||
    normalized === "ignore"
  ) {
    return normalized;
  }

  return null;
}

function normalizeGameNavigationFootprint(value: unknown): GameNavigationFootprint | null {
  const normalized = normalizeString(value);
  if (normalized === "bounds" || normalized === "bbox" || normalized === "tile" || normalized === "none") {
    return normalized;
  }

  return null;
}

function normalizeGameNavigationCover(value: unknown): GameNavigationCover | null {
  const normalized = normalizeString(value);
  if (normalized === "none" || normalized === "low" || normalized === "high") {
    return normalized;
  }

  return null;
}

function resolveGameNavigationStoryIndex(metadata: Record<string, unknown>): number | null {
  return (
    normalizeInteger(metadata.game_nav_story_index) ??
    normalizeInteger(metadata.game_story_index) ??
    normalizeInteger(metadata.storyIndex) ??
    normalizeInteger(metadata.story_index) ??
    normalizeInteger(metadata.floorIndex)
  );
}

function resolveDefaultFootprint(kind: GameNavigationKind, movementCost: number): GameNavigationFootprint {
  if (kind === "ignore" || kind === "stairs" || kind === "trigger") {
    return "none";
  }

  if (kind === "decorative" && movementCost <= 1) {
    return "none";
  }

  return "bounds";
}

function resolveFallbackGameNavigationKind(sourcePart: string | null): GameNavigationKind | null {
  if (!sourcePart) {
    return null;
  }

  if (/^(stair|external_stair|decal|visibility_volume|room_metadata|floor|roof|terrace)$/i.test(sourcePart)) {
    return null;
  }

  if (/^(outer_wall|inner_wall|roof_railing|terrace_railing|border)$/i.test(sourcePart)) {
    return "wall";
  }

  return null;
}

function isWalkableSurfaceName(name: string): boolean {
  return /(story[_ -]?floor|room[_ -]?floor|roof[_ -]?floor|floor|platform|landing|balcony|walkway|roof[_ -]?platform|stair[_ -]?landing|terrace|external[_ -]?stair[_ -]?landing)/i.test(name);
}

function isBlockedSurfaceName(name: string): boolean {
  return /(wall|railing|rail|window|door|glass|frame|sill|reveal)/i.test(name);
}
