import { Vector3, type AbstractMesh, type Node, type Scene } from "@babylonjs/core";
import { GridCell } from "../grid/GridCell";
import type { RectGrid } from "../grid/RectGrid";
import { parseGameNavigationMetadata, parseStairCheckpointMetadata } from "./BuildingNavigationMetadata";
import { mapGridNavigationContractsToRuntime } from "./GridNavigationContract";

export interface WalkableFloorSurface {
  readonly mesh: AbstractMesh;
  readonly storyIndex: number;
  readonly boundsMin: Vector3;
  readonly boundsMax: Vector3;
}

export interface FloorNavigationCell {
  readonly cell: GridCell;
  readonly storyIndex: number;
}

export interface FloorNavigationSurfaceRegistryRebuildOptions {
  readonly forcedGroundMesh?: AbstractMesh;
}

export function makeStoryCellKey(storyIndex: number, cell: GridCell): string {
  return `${storyIndex}:${cell.x}:${cell.z}`;
}

export class FloorNavigationSurfaceRegistry {
  private readonly surfaces: WalkableFloorSurface[];
  private readonly cellsByStory: Map<number, Map<string, GridCell>>;
  private readonly storyYByStory: Map<number, number>;
  private grid: RectGrid | null;
  private hasExplicitSurfaces: boolean;

  public constructor() {
    this.surfaces = [];
    this.cellsByStory = new Map();
    this.storyYByStory = new Map();
    this.grid = null;
    this.hasExplicitSurfaces = false;
  }

  public rebuild(scene: Scene, grid: RectGrid, options: FloorNavigationSurfaceRegistryRebuildOptions = {}): void {
    this.surfaces.length = 0;
    this.cellsByStory.clear();
    this.storyYByStory.clear();
    this.grid = grid;
    this.hasExplicitSurfaces = false;

    const knownStoryY = this.collectKnownStoryY(scene);
    const gridContracts = mapGridNavigationContractsToRuntime(scene, grid);
    let contractCellCount = 0;
    let contractSkippedOutOfBounds = 0;
    for (const contract of gridContracts) {
      for (const story of contract.stories) {
        this.hasExplicitSurfaces = true;
        this.recordStoryY(story.storyIndex, story.storyY);
        contractCellCount += story.walkableCells.length;
        for (const cell of story.walkableCells) {
          if (grid.contains(cell)) {
            this.addWalkableCell(cell, story.storyIndex);
            continue;
          }
          contractSkippedOutOfBounds += 1;
        }
      }
    }
    if (gridContracts.length > 0 && contractSkippedOutOfBounds > 0) {
      console.warn(
        `[FloorNavigationSurfaceRegistry] skipped ${contractSkippedOutOfBounds}/${contractCellCount} contract walkable cells because they are outside RectGrid bounds.`,
      );
    }

    if (options.forcedGroundMesh && !options.forcedGroundMesh.isDisposed() && options.forcedGroundMesh.getTotalVertices() > 0) {
      this.addWalkableSurface(grid, options.forcedGroundMesh, 0, getWorldBounds(options.forcedGroundMesh));
    }

    for (const mesh of scene.meshes) {
      if (mesh.isDisposed() || mesh.getTotalVertices() <= 0) {
        continue;
      }

      if (!this.isWalkableFloorSurface(mesh)) {
        continue;
      }

      const bounds = getWorldBounds(mesh);
      const storyIndex = this.resolveSurfaceStoryIndex(mesh, bounds, knownStoryY);
      if (storyIndex === null) {
        console.warn(`[FloorNavigationSurfaceRegistry] skipped walkable-looking mesh '${mesh.name}': story metadata missing and story could not be inferred.`);
        continue;
      }

      this.addWalkableSurface(grid, mesh, storyIndex, bounds);
    }

    if (!this.hasExplicitSurfaces) {
      for (const cell of grid.getCellsWithinBounds()) {
        this.addWalkableCell(cell, 0);
      }
      this.recordStoryY(0, grid.getOrigin().y);
    }

    this.logStats();
  }

  public isWalkableCell(cell: GridCell, storyIndex: number): boolean {
    if (!this.hasExplicitSurfaces && storyIndex === 0) {
      return true;
    }

    return this.cellsByStory.get(storyIndex)?.has(makeStoryCellKey(storyIndex, cell)) ?? false;
  }

  public getWalkableCells(storyIndex: number): readonly GridCell[] {
    return [...(this.cellsByStory.get(storyIndex)?.values() ?? [])];
  }

  public getWalkableCellEntries(): readonly FloorNavigationCell[] {
    const entries: FloorNavigationCell[] = [];
    for (const [storyIndex, cells] of this.cellsByStory) {
      for (const cell of cells.values()) {
        entries.push({ cell, storyIndex });
      }
    }
    return entries;
  }

  public getStoryIndices(): readonly number[] {
    return [...this.cellsByStory.keys()].sort((a, b) => a - b);
  }

  public getStoryY(storyIndex: number): number | null {
    return this.storyYByStory.get(storyIndex) ?? null;
  }

  public getStoryYByStory(): ReadonlyMap<number, number> {
    return this.storyYByStory;
  }

  public findClosestWalkableCell(input: {
    readonly point: Vector3;
    readonly storyIndex: number;
    readonly maxDistance?: number;
  }): GridCell | null {
    const maxDistance = input.maxDistance ?? 2;
    const cells = this.getWalkableCells(input.storyIndex);
    const storyY = this.getStoryY(input.storyIndex) ?? input.point.y;
    let bestCell: GridCell | null = null;
    let bestDistanceSquared = maxDistance * maxDistance;

    for (const cell of cells) {
      const world = this.grid?.cellToWorld(cell, storyY) ?? new Vector3(input.point.x, storyY, input.point.z);
      const distanceSquared = Vector3.DistanceSquared(input.point, world);
      if (distanceSquared <= bestDistanceSquared) {
        bestDistanceSquared = distanceSquared;
        bestCell = cell;
      }
    }

    return bestCell;
  }

  public addForcedWalkableCell(cell: GridCell, storyIndex: number): void {
    this.addWalkableCell(cell, storyIndex);
  }

  private addWalkableSurface(
    grid: RectGrid,
    mesh: AbstractMesh,
    storyIndex: number,
    bounds: { readonly min: Vector3; readonly max: Vector3 }
  ): void {
    this.hasExplicitSurfaces = true;
    this.surfaces.push({
      mesh,
      storyIndex,
      boundsMin: bounds.min.clone(),
      boundsMax: bounds.max.clone()
    });
    this.recordStoryY(storyIndex, bounds.max.y);
    this.addCellsForBounds(grid, storyIndex, bounds.min, bounds.max);
  }

  private addCellsForBounds(grid: RectGrid, storyIndex: number, min: Vector3, max: Vector3): void {
    const tileSize = grid.getTileSize();
    const padX = Math.min(tileSize * 0.25, Math.max(0, (max.x - min.x) * 0.12));
    const padZ = Math.min(tileSize * 0.25, Math.max(0, (max.z - min.z) * 0.12));
    const storyY = this.storyYByStory.get(storyIndex) ?? (min.y + max.y) / 2;

    for (const cell of grid.getCellsWithinBounds()) {
      const center = grid.cellToWorld(cell, storyY);
      if (
        center.x < min.x + padX ||
        center.x > max.x - padX ||
        center.z < min.z + padZ ||
        center.z > max.z - padZ
      ) {
        continue;
      }

      this.addWalkableCell(cell, storyIndex);
    }
  }

  private addWalkableCell(cell: GridCell, storyIndex: number): void {
    const cells = this.cellsByStory.get(storyIndex) ?? new Map<string, GridCell>();
    cells.set(makeStoryCellKey(storyIndex, cell), new GridCell(cell.x, cell.z));
    this.cellsByStory.set(storyIndex, cells);
  }

  private collectKnownStoryY(scene: Scene): Map<number, number> {
    const result = new Map<number, number>();
    for (const mesh of scene.meshes) {
      const checkpoint = parseStairCheckpointMetadata(mesh);
      if (!checkpoint) {
        continue;
      }
      const position = mesh.getAbsolutePosition();
      if (!result.has(checkpoint.from_story)) {
        result.set(checkpoint.from_story, position.y);
      }
      if (!result.has(checkpoint.to_story)) {
        result.set(checkpoint.to_story, position.y);
      }
    }
    return result;
  }

  private resolveSurfaceStoryIndex(
    mesh: AbstractMesh,
    bounds: { readonly min: Vector3; readonly max: Vector3; readonly center: Vector3 },
    knownStoryY: ReadonlyMap<number, number>
  ): number | null {
    const metadata = resolveMetadata(mesh);
    const explicitStory =
      normalizeInteger(metadata?.game_nav_story_index) ??
      normalizeInteger(metadata?.storyIndex) ??
      normalizeInteger(metadata?.story_index) ??
      normalizeInteger(metadata?.floorIndex) ??
      normalizeInteger(metadata?.game_story_index);
    if (explicitStory !== null) {
      return explicitStory;
    }

    if (this.isGroundLike(mesh)) {
      return 0;
    }

    let bestStory: number | null = null;
    let bestDistance = Number.POSITIVE_INFINITY;
    for (const [storyIndex, storyY] of knownStoryY) {
      const distance = Math.abs(bounds.center.y - storyY);
      if (distance < bestDistance) {
        bestDistance = distance;
        bestStory = storyIndex;
      }
    }

    return bestDistance <= 1.25 ? bestStory : null;
  }

  private isWalkableFloorSurface(mesh: AbstractMesh): boolean {
    const gameNavigationMetadata = parseGameNavigationMetadata(mesh);
    if (gameNavigationMetadata?.kind === "floor") {
      return true;
    }
    if (gameNavigationMetadata) {
      return false;
    }

    const metadata = resolveMetadata(mesh);
    const navKind = normalizeString(metadata?.nav_kind);
    if (navKind === "stair_checkpoint" || navKind === "stair_pick_proxy") {
      return false;
    }

    const part = normalizeString(metadata?.part) ?? normalizeString(metadata?.building_part) ?? normalizeString(metadata?.role);
    const name = mesh.name;
    if (isBlockedSurfaceName(part ?? name) || isBlockedSurfaceName(name)) {
      return false;
    }

    if (part && isWalkableSurfaceName(part)) {
      return true;
    }

    return isWalkableSurfaceName(name) || this.isGroundLike(mesh);
  }

  private isGroundLike(mesh: AbstractMesh): boolean {
    const metadata = mesh.metadata as { isGround?: unknown } | null | undefined;
    if (metadata?.isGround === true) {
      return true;
    }
    return /^(ground|grid-ground|terrain|floor)$/i.test(mesh.name.replace(/\.[0-9]+$/u, ""));
  }

  private recordStoryY(storyIndex: number, y: number): void {
    if (!Number.isFinite(y) || this.storyYByStory.has(storyIndex)) {
      return;
    }
    this.storyYByStory.set(storyIndex, y);
  }

  private logStats(): void {
    const stories = this.getStoryIndices();
    console.info(
      `FloorNavigationSurfaceRegistry: loaded walkable surfaces=${this.surfaces.length} stories=${stories.join(",") || "none"}`
    );
    for (const storyIndex of stories) {
      console.info(
        `- story ${storyIndex} cells=${this.getWalkableCells(storyIndex).length} y=${(this.getStoryY(storyIndex) ?? 0).toFixed(2)}`
      );
    }
  }
}

function getWorldBounds(mesh: AbstractMesh): { readonly min: Vector3; readonly max: Vector3; readonly center: Vector3 } {
  mesh.computeWorldMatrix(true);
  const boundingBox = mesh.getBoundingInfo().boundingBox;
  return {
    min: boundingBox.minimumWorld.clone(),
    max: boundingBox.maximumWorld.clone(),
    center: boundingBox.centerWorld.clone()
  };
}

function resolveMetadata(mesh: AbstractMesh): Record<string, unknown> | null {
  let currentNode: Node | null = mesh;
  while (currentNode) {
    const metadata = currentNode.metadata;
    if (metadata && typeof metadata === "object") {
      const record = resolveExtrasRecord(metadata as Record<string, unknown>);
      if (Object.keys(record).length > 0) {
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

function isWalkableSurfaceName(name: string): boolean {
  return /(story[_ -]?floor|room[_ -]?floor|roof[_ -]?floor|floor|platform|landing|balcony|walkway|roof[_ -]?platform|stair[_ -]?landing|terrace|external[_ -]?stair[_ -]?landing)/i.test(name);
}

function isBlockedSurfaceName(name: string): boolean {
  return /(wall|railing|rail|window|door|glass|frame|sill|reveal|border|fence|stair[_ -]?(tread|run)|checkpoint|pick[_ -]?proxy)/i.test(name);
}
