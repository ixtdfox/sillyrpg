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

/**
 * Reader/Parser для navigation metadata, прикрепленной к Babylon mesh/node.
 *
 * Класс инкапсулирует все правила обхода parent-chain, чтения GLTF `extras`,
 * нормализации loose JSON-значений и fallback-эвристики по naming convention.
 * Внешние registry получают один объектный сервис вместо набора свободных
 * процедурных функций.
 */
export class NavigationMetadataParser {
  private static readonly shared = new NavigationMetadataParser();

  /** Возвращает общий parser для runtime-кода, где не нужен ручной dependency injection. */
  public static getShared(): NavigationMetadataParser {
    return NavigationMetadataParser.shared;
  }

  /** Разбирает checkpoint metadata отдельной точки лестничного polyline. */
  public parseStairCheckpointMetadata(mesh: AbstractMesh): StairCheckpointMetadata | null {
    const metadata = this.resolveNavigationMetadata(mesh);
    if (!metadata || metadata.nav_kind !== "stair_checkpoint") {
      return null;
    }

    const stairId = this.normalizeString(metadata.stair_id);
    const checkpointIndex = this.normalizeInteger(metadata.checkpoint_index);
    const fromStory = this.normalizeInteger(metadata.from_story);
    const toStory = this.normalizeInteger(metadata.to_story);

    if (!stairId || checkpointIndex === null || fromStory === null || toStory === null) {
      return null;
    }

    return {
      nav_kind: "stair_checkpoint",
      stair_id: stairId,
      checkpoint_index: checkpointIndex,
      checkpoint_role: this.normalizeString(metadata.checkpoint_role) ?? undefined,
      from_story: fromStory,
      to_story: toStory,
      stair_kind: this.normalizeStairKind(metadata.stair_kind) ?? undefined,
      cost: this.normalizeFiniteNumber(metadata.cost) ?? undefined,
      bidirectional: this.normalizeBoolean(metadata.bidirectional) ?? undefined
    };
  }

  /** Разбирает metadata корневого connector'а лестницы, если exporter ее предоставил. */
  public parseStairConnectorMetadata(mesh: AbstractMesh): StairConnectorMetadata | null {
    const metadata = this.resolveNavigationMetadata(mesh);
    if (!metadata || metadata.nav_kind !== "stair_connector") {
      return null;
    }

    const stairId = this.normalizeString(metadata.stair_id);
    const fromStory = this.normalizeInteger(metadata.from_story);
    const toStory = this.normalizeInteger(metadata.to_story);

    if (!stairId || fromStory === null || toStory === null) {
      return null;
    }

    return {
      nav_kind: "stair_connector",
      stair_id: stairId,
      from_story: fromStory,
      to_story: toStory,
      stair_kind: this.normalizeStairKind(metadata.stair_kind) ?? undefined,
      cost: this.normalizeFiniteNumber(metadata.cost) ?? undefined,
      bidirectional: this.normalizeBoolean(metadata.bidirectional) ?? undefined
    };
  }

  /**
   * Определяет, является ли mesh pick-proxy или визуальной частью лестницы.
   *
   * Метод намеренно использует и metadata, и имя mesh: старые assets могли иметь
   * неполный metadata contract, но понятные stair/staircase имена.
   */
  public parseStairPickMetadata(mesh: AbstractMesh): StairPickMetadata | null {
    const metadata = this.resolveNavigationMetadata(mesh);
    const stairId = metadata ? this.normalizeString(metadata.stair_id) : null;
    const stairKind = metadata ? this.normalizeStairKind(metadata.stair_kind) : null;
    const navKind = metadata ? this.normalizeString(metadata.nav_kind) : null;
    const part = metadata ? this.normalizeString(metadata.part) ?? this.normalizeString(metadata.building_part) : null;
    const stairPart = metadata ? this.normalizeString(metadata.stair_part) : null;
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
      fromStory: metadata ? this.normalizeInteger(metadata.from_story) ?? undefined : undefined,
      toStory: metadata ? this.normalizeInteger(metadata.to_story) ?? undefined : undefined,
      isStairLike: true
    };
  }

  /**
   * Разбирает gameplay navigation metadata для blockers, doors, cover и floors.
   *
   * Метод поддерживает явный `game_nav_*` contract и fallback по `part`/
   * `building_part`, чтобы старые GLB продолжали работать до полного exporter
   * migration.
   */
  public parseGameNavigationMetadata(mesh: AbstractMesh): GameNavigationMetadata | null {
    const metadata = this.resolveGameNavigationMetadata(mesh) ?? this.resolveNavigationMetadata(mesh);
    if (!metadata) {
      return null;
    }

    const explicitGameNav = this.normalizeBoolean(metadata.game_nav);
    const explicitBlocksMovement = this.normalizeBoolean(metadata.game_nav_blocks_movement);
    const navKind = this.normalizeString(metadata.nav_kind);
    if (
      (navKind === "stair_connector" || navKind === "stair_checkpoint" || navKind === "stair_pick_proxy") &&
      !(explicitGameNav === true && explicitBlocksMovement === true)
    ) {
      return null;
    }

    const explicitKind = this.normalizeGameNavigationKind(metadata.game_nav_kind);
    const sourcePart =
      this.normalizeString(metadata.game_nav_source_part) ??
      this.normalizeString(metadata.game_part) ??
      this.normalizeString(metadata.building_part) ??
      this.normalizeString(metadata.part);
    const fallbackKind = this.resolveFallbackGameNavigationKind(sourcePart);
    if (explicitGameNav !== true && !explicitKind && !fallbackKind) {
      return null;
    }

    const kind = explicitKind ?? fallbackKind ?? "obstacle";
    const movementCost = Math.max(1, this.normalizeFiniteNumber(metadata.game_nav_movement_cost) ?? 1);
    const blocksMovement = explicitBlocksMovement ?? (kind === "obstacle" || kind === "blocking" || kind === "wall");
    const storyIndex = this.resolveGameNavigationStoryIndex(metadata);
    const footprint = this.normalizeGameNavigationFootprint(metadata.game_nav_footprint) ?? this.resolveDefaultFootprint(kind, movementCost);
    const blocksVision = this.normalizeBoolean(metadata.game_nav_blocks_vision) ?? kind === "wall";
    const cover = this.normalizeGameNavigationCover(metadata.game_nav_cover) ?? "none";

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
      tileX: this.normalizeInteger(metadata.game_nav_tile_x) ?? this.normalizeInteger(metadata.tile_x) ?? undefined,
      tileY: this.normalizeInteger(metadata.game_nav_tile_y) ?? this.normalizeInteger(metadata.tile_y) ?? undefined,
      edgeSide: this.normalizeString(metadata.edge_side) ?? undefined,
      wallOrientation: this.normalizeString(metadata.wallOrientation) ?? this.normalizeString(metadata.wall_orientation) ?? undefined,
      doorType: this.normalizeString(metadata.door_type) ?? this.normalizeString(metadata.doorType) ?? undefined
    };
  }

  /** Определяет, можно ли использовать mesh как navigation-pick surface. */
  public isNavigationPickableSurface(mesh: AbstractMesh): boolean {
    if (this.parseStairPickMetadata(mesh)) {
      return true;
    }

    const metadata = this.resolveNavigationMetadata(mesh);
    const part = metadata
      ? this.normalizeString(metadata.part) ?? this.normalizeString(metadata.building_part) ?? this.normalizeString(metadata.role)
      : null;
    if ((part && this.isBlockedSurfaceName(part)) || this.isBlockedSurfaceName(mesh.name)) {
      return false;
    }

    if (this.parsePickableStoryMetadata(mesh)) {
      return true;
    }

    if (part && this.isWalkableSurfaceName(part) && !this.isBlockedSurfaceName(part)) {
      return true;
    }

    return this.isWalkableSurfaceName(mesh.name) && !this.isBlockedSurfaceName(mesh.name);
  }

  /** Читает story metadata с walkable/pickable mesh. */
  public parsePickableStoryMetadata(mesh: AbstractMesh): PickableStoryMetadata | null {
    const metadata = this.resolveNavigationMetadata(mesh);
    if (!metadata) {
      return null;
    }

    const storyIndex =
      this.normalizeInteger(metadata.storyIndex) ??
      this.normalizeInteger(metadata.story_index) ??
      this.normalizeInteger(metadata.floorIndex) ??
      this.normalizeInteger(metadata.game_story_index);

    return storyIndex === null ? null : { storyIndex };
  }

  /** Поднимается по parent-chain и возвращает первый record с navigation metadata. */
  public resolveNavigationMetadata(mesh: AbstractMesh): Record<string, unknown> | null {
    let currentNode: Node | null = mesh;

    while (currentNode) {
      const metadata = currentNode.metadata;
      if (metadata && typeof metadata === "object") {
        const record = this.resolveExtrasRecord(metadata as Record<string, unknown>);
        if (this.hasNavigationMetadata(record)) {
          return record;
        }
      }

      currentNode = currentNode.parent;
    }

    return null;
  }

  /** Поднимается по parent-chain и ищет именно gameplay navigation metadata. */
  public resolveGameNavigationMetadata(mesh: AbstractMesh): Record<string, unknown> | null {
    let currentNode: Node | null = mesh;

    while (currentNode) {
      const metadata = currentNode.metadata;
      if (metadata && typeof metadata === "object") {
        const record = this.resolveExtrasRecord(metadata as Record<string, unknown>);
        if (this.hasGameNavigationMetadata(record)) {
          return record;
        }
      }

      currentNode = currentNode.parent;
    }

    return null;
  }

  /** Возвращает GLTF `extras`, если metadata пришла из imported asset, иначе сам metadata record. */
  public resolveExtrasRecord(metadata: Record<string, unknown>): Record<string, unknown> {
    const gltfPayload = metadata.gltf;
    if (gltfPayload && typeof gltfPayload === "object") {
      const extrasPayload = (gltfPayload as Record<string, unknown>).extras;
      if (extrasPayload && typeof extrasPayload === "object") {
        return extrasPayload as Record<string, unknown>;
      }
    }

    return metadata;
  }

  private hasNavigationMetadata(record: Record<string, unknown>): boolean {
    return (
      "nav_kind" in record ||
      this.hasGameNavigationMetadata(record) ||
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

  private hasGameNavigationMetadata(record: Record<string, unknown>): boolean {
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

  private normalizeString(value: unknown): string | null {
    if (typeof value !== "string") {
      return null;
    }

    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  private normalizeInteger(value: unknown): number | null {
    if (typeof value === "number" && Number.isFinite(value)) {
      return Math.trunc(value);
    }

    if (typeof value === "string") {
      const parsed = Number.parseInt(value, 10);
      return Number.isFinite(parsed) ? parsed : null;
    }

    return null;
  }

  private normalizeFiniteNumber(value: unknown): number | null {
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }

    if (typeof value === "string") {
      const parsed = Number.parseFloat(value);
      return Number.isFinite(parsed) ? parsed : null;
    }

    return null;
  }

  private normalizeBoolean(value: unknown): boolean | null {
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

  private normalizeStairKind(value: unknown): StairKind | null {
    const normalized = this.normalizeString(value);
    if (normalized === "internal" || normalized === "external") {
      return normalized;
    }

    return null;
  }

  private normalizeGameNavigationKind(value: unknown): GameNavigationKind | null {
    const normalized = this.normalizeString(value);
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

  private normalizeGameNavigationFootprint(value: unknown): GameNavigationFootprint | null {
    const normalized = this.normalizeString(value);
    if (normalized === "bounds" || normalized === "bbox" || normalized === "tile" || normalized === "none") {
      return normalized;
    }

    return null;
  }

  private normalizeGameNavigationCover(value: unknown): GameNavigationCover | null {
    const normalized = this.normalizeString(value);
    if (normalized === "none" || normalized === "low" || normalized === "high") {
      return normalized;
    }

    return null;
  }

  private resolveGameNavigationStoryIndex(metadata: Record<string, unknown>): number | null {
    return (
      this.normalizeInteger(metadata.game_nav_story_index) ??
      this.normalizeInteger(metadata.game_story_index) ??
      this.normalizeInteger(metadata.storyIndex) ??
      this.normalizeInteger(metadata.story_index) ??
      this.normalizeInteger(metadata.floorIndex)
    );
  }

  private resolveDefaultFootprint(kind: GameNavigationKind, movementCost: number): GameNavigationFootprint {
    if (kind === "ignore" || kind === "stairs" || kind === "trigger") {
      return "none";
    }

    if (kind === "decorative" && movementCost <= 1) {
      return "none";
    }

    return "bounds";
  }

  private resolveFallbackGameNavigationKind(sourcePart: string | null): GameNavigationKind | null {
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

  private isWalkableSurfaceName(name: string): boolean {
    return /(story[_ -]?floor|room[_ -]?floor|roof[_ -]?floor|floor|platform|landing|balcony|walkway|roof[_ -]?platform|stair[_ -]?landing|terrace|external[_ -]?stair[_ -]?landing)/i.test(name);
  }

  private isBlockedSurfaceName(name: string): boolean {
    return /(wall|railing|rail|window|door|glass|frame|sill|reveal)/i.test(name);
  }
}
