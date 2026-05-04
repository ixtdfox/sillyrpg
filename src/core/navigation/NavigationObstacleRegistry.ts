import { Vector3, type AbstractMesh, type Scene } from "@babylonjs/core";
import { HexCell } from "../hex/HexCell";
import type { HexGrid } from "../hex/HexGrid";
import {
  parseGameNavigationMetadata,
  parseStairCheckpointMetadata,
  parseStairConnectorMetadata,
  parseStairPickMetadata,
  type GameNavigationCover,
  type GameNavigationMetadata
} from "./BuildingNavigationMetadata";
import { makeStoryCellKey, type FloorNavigationCell } from "./FloorNavigationSurfaceRegistry";

export type NavigationCover = Exclude<GameNavigationCover, "none">;

export interface NavigationObstacleDebugInfo {
  readonly movementBlocked: boolean;
  readonly visionBlocked: boolean;
  readonly cover: GameNavigationCover;
  readonly movementCost: number;
}

export interface CoverNavigationCell {
  readonly cell: HexCell;
  readonly storyIndex: number;
  readonly cover: NavigationCover;
}

export class NavigationObstacleRegistry {
  private readonly movementBlockedCells: Map<string, FloorNavigationCell>;
  private readonly visionBlockedCells: Map<string, FloorNavigationCell>;
  private readonly coverByCellKey: Map<string, CoverNavigationCell>;
  private readonly movementCostByCellKey: Map<string, number>;

  public constructor() {
    this.movementBlockedCells = new Map();
    this.visionBlockedCells = new Map();
    this.coverByCellKey = new Map();
    this.movementCostByCellKey = new Map();
  }

  public rebuild(scene: Scene, grid: HexGrid, storyYByStory: ReadonlyMap<number, number>): void {
    this.clear();

    for (const mesh of scene.meshes) {
      if (mesh.isDisposed() || mesh.getTotalVertices() <= 0 || this.isStairNavigationMesh(mesh)) {
        continue;
      }

      const metadata = parseGameNavigationMetadata(mesh);
      if (!metadata || this.shouldIgnoreMetadata(metadata)) {
        continue;
      }

      const storyIndex = metadata.storyIndex ?? this.inferStoryIndex(mesh, storyYByStory);
      if (storyIndex === null) {
        console.warn(`[NavigationObstacleRegistry] skipped '${mesh.name}': story metadata missing and story could not be inferred.`);
        continue;
      }

      const footprintCells = this.projectFootprint(mesh, metadata, grid, storyIndex, storyYByStory);
      for (const cell of footprintCells) {
        this.recordCell(cell, storyIndex, metadata);
      }
    }

    this.logStats();
  }

  public clear(): void {
    this.movementBlockedCells.clear();
    this.visionBlockedCells.clear();
    this.coverByCellKey.clear();
    this.movementCostByCellKey.clear();
  }

  public isMovementBlocked(cell: HexCell, storyIndex: number): boolean {
    return this.movementBlockedCells.has(makeStoryCellKey(storyIndex, cell));
  }

  public isVisionBlocked(cell: HexCell, storyIndex: number): boolean {
    return this.visionBlockedCells.has(makeStoryCellKey(storyIndex, cell));
  }

  public getCover(cell: HexCell, storyIndex: number): GameNavigationCover {
    return this.coverByCellKey.get(makeStoryCellKey(storyIndex, cell))?.cover ?? "none";
  }

  public getMovementCost(cell: HexCell, storyIndex: number): number {
    return this.movementCostByCellKey.get(makeStoryCellKey(storyIndex, cell)) ?? 1;
  }

  public getBlockedCells(): readonly FloorNavigationCell[] {
    return [...this.movementBlockedCells.values()];
  }

  public getVisionBlockedCells(): readonly FloorNavigationCell[] {
    return [...this.visionBlockedCells.values()];
  }

  public getCoverCells(): readonly CoverNavigationCell[] {
    return [...this.coverByCellKey.values()];
  }

  public getDebugInfo(cell: HexCell, storyIndex: number): NavigationObstacleDebugInfo {
    return {
      movementBlocked: this.isMovementBlocked(cell, storyIndex),
      visionBlocked: this.isVisionBlocked(cell, storyIndex),
      cover: this.getCover(cell, storyIndex),
      movementCost: this.getMovementCost(cell, storyIndex)
    };
  }

  private shouldIgnoreMetadata(metadata: GameNavigationMetadata): boolean {
    if (metadata.kind === "ignore" || metadata.kind === "floor" || metadata.kind === "stairs") {
      return true;
    }

    if (metadata.footprint === "none") {
      return true;
    }

    return metadata.kind === "decorative" &&
      !metadata.blocksMovement &&
      !metadata.blocksVision &&
      metadata.cover === "none" &&
      metadata.movementCost <= 1;
  }

  private projectFootprint(
    mesh: AbstractMesh,
    metadata: GameNavigationMetadata,
    grid: HexGrid,
    storyIndex: number,
    storyYByStory: ReadonlyMap<number, number>
  ): HexCell[] {
    if (metadata.footprint === "tile" && metadata.tileX !== undefined && metadata.tileY !== undefined) {
      return [new HexCell(metadata.tileX, metadata.tileY)].filter((cell) => grid.contains(cell));
    }

    if (metadata.footprint !== "bounds" && metadata.footprint !== "bbox") {
      return [];
    }

    const bounds = getWorldBounds(mesh);
    const storyY = storyYByStory.get(storyIndex) ?? bounds.center.y;
    const hexSize = grid.getHexSize();
    const halfX = Math.max((bounds.max.x - bounds.min.x) / 2, hexSize * 0.15);
    const halfZ = Math.max((bounds.max.z - bounds.min.z) / 2, hexSize * 0.15);
    const minX = bounds.center.x - halfX;
    const maxX = bounds.center.x + halfX;
    const minZ = bounds.center.z - halfZ;
    const maxZ = bounds.center.z + halfZ;
    const cells: HexCell[] = [];

    for (const cell of grid.getCellsWithinBounds()) {
      const center = grid.cellToWorld(cell, storyY);
      if (center.x >= minX && center.x <= maxX && center.z >= minZ && center.z <= maxZ) {
        cells.push(cell);
      }
    }

    return cells;
  }

  private recordCell(cell: HexCell, storyIndex: number, metadata: GameNavigationMetadata): void {
    const key = makeStoryCellKey(storyIndex, cell);
    const entry = { cell: new HexCell(cell.q, cell.r), storyIndex };

    if (metadata.blocksMovement) {
      this.movementBlockedCells.set(key, entry);
    }

    if (metadata.blocksVision) {
      this.visionBlockedCells.set(key, entry);
    }

    if (metadata.cover === "low" || metadata.cover === "high") {
      const previousCover = this.coverByCellKey.get(key)?.cover;
      const cover = previousCover === "high" || metadata.cover === "high" ? "high" : "low";
      this.coverByCellKey.set(key, { ...entry, cover });
    }

    if (metadata.movementCost > 1) {
      this.movementCostByCellKey.set(key, Math.max(this.movementCostByCellKey.get(key) ?? 1, metadata.movementCost));
    }
  }

  private inferStoryIndex(mesh: AbstractMesh, storyYByStory: ReadonlyMap<number, number>): number | null {
    const bounds = getWorldBounds(mesh);
    let bestStory: number | null = null;
    let bestDistance = Number.POSITIVE_INFINITY;

    for (const [storyIndex, storyY] of storyYByStory) {
      const distance = Math.abs(bounds.center.y - storyY);
      if (distance < bestDistance) {
        bestDistance = distance;
        bestStory = storyIndex;
      }
    }

    return bestDistance <= 1.25 ? bestStory : null;
  }

  private isStairNavigationMesh(mesh: AbstractMesh): boolean {
    const stairPick = parseStairPickMetadata(mesh);
    return Boolean(stairPick || parseStairCheckpointMetadata(mesh) || parseStairConnectorMetadata(mesh));
  }

  private logStats(): void {
    console.info(
      `NavigationObstacleRegistry: blockers=${this.movementBlockedCells.size} visionBlockers=${this.visionBlockedCells.size} cover=${this.coverByCellKey.size} costCells=${this.movementCostByCellKey.size}`
    );
    this.logCellsByStory("blockers", this.getBlockedCells());
    this.logCellsByStory("vision blockers", this.getVisionBlockedCells());
    this.logCellsByStory("cover cells", this.getCoverCells());
  }

  private logCellsByStory(label: string, cells: readonly FloorNavigationCell[]): void {
    const countByStory = new Map<number, number>();
    for (const entry of cells) {
      countByStory.set(entry.storyIndex, (countByStory.get(entry.storyIndex) ?? 0) + 1);
    }

    const summary = [...countByStory.entries()]
      .sort((first, second) => first[0] - second[0])
      .map(([storyIndex, count]) => `${storyIndex}:${count}`)
      .join(", ");
    console.info(`- ${label} by story: ${summary || "none"}`);
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
