import { Vector3, type AbstractMesh, type Scene } from "@babylonjs/core";
import { HexCell } from "../hex/HexCell";
import type { HexGrid } from "../hex/HexGrid";
import {
  parseGameNavigationMetadata,
  type GameNavFootprint,
  type GameNavKind
} from "./BuildingNavigationMetadata";
import { makeStoryCellKey } from "./FloorNavigationSurfaceRegistry";

export interface NavigationBlockerRecord {
  readonly mesh: AbstractMesh;
  readonly meshName: string;
  readonly storyIndex: number;
  readonly kind: GameNavKind;
  readonly blocksMovement: boolean;
  readonly blocksVision: boolean;
  readonly footprint: GameNavFootprint;
  readonly boundsMin: Vector3;
  readonly boundsMax: Vector3;
}

export interface NavigationDoorOpeningRecord {
  readonly mesh: AbstractMesh;
  readonly meshName: string;
  readonly storyIndex: number;
  readonly boundsMin: Vector3;
  readonly boundsMax: Vector3;
  readonly tileX?: number;
  readonly tileY?: number;
  readonly edgeSide?: string;
  readonly wallOrientation?: string;
  readonly doorType?: string;
}

interface Bounds2D {
  readonly minX: number;
  readonly maxX: number;
  readonly minZ: number;
  readonly maxZ: number;
}

interface Point2D {
  readonly x: number;
  readonly z: number;
}

export class NavigationBlockerRegistry {
  private readonly blockers: NavigationBlockerRecord[];
  private readonly blockersByStory: Map<number, NavigationBlockerRecord[]>;
  private readonly doorOpenings: NavigationDoorOpeningRecord[];
  private readonly doorOpeningsByStory: Map<number, NavigationDoorOpeningRecord[]>;
  private readonly blockedCellsByStory: Map<number, Map<string, HexCell>>;
  private readonly blockersByCellKey: Map<string, NavigationBlockerRecord[]>;
  private readonly blockedEdgeKeys: Set<string>;
  private readonly doorOpenedEdgeKeys: Set<string>;
  private grid: HexGrid | null;
  private storyYByStory: ReadonlyMap<number, number>;

  public constructor() {
    this.blockers = [];
    this.blockersByStory = new Map();
    this.doorOpenings = [];
    this.doorOpeningsByStory = new Map();
    this.blockedCellsByStory = new Map();
    this.blockersByCellKey = new Map();
    this.blockedEdgeKeys = new Set();
    this.doorOpenedEdgeKeys = new Set();
    this.grid = null;
    this.storyYByStory = new Map();
  }

  public rebuild(scene: Scene, grid: HexGrid, storyYByStory: ReadonlyMap<number, number> = new Map()): void {
    this.clear();
    this.grid = grid;
    this.storyYByStory = new Map(storyYByStory);

    for (const mesh of scene.meshes) {
      if (mesh.isDisposed() || mesh.getTotalVertices() <= 0) {
        continue;
      }

      const metadata = parseGameNavigationMetadata(mesh);
      if (!metadata?.game_nav) {
        continue;
      }

      const storyIndex = metadata.game_nav_story_index ?? metadata.storyIndex ?? this.inferStoryIndex(mesh);
      if (storyIndex === null) {
        console.warn(`[NavigationBlockerRegistry] skipped '${mesh.name}': story metadata missing and story could not be inferred.`);
        continue;
      }

      const bounds = getWorldBounds(mesh);
      if ((metadata.game_nav_kind ?? metadata.kind) === "door") {
        this.addDoorOpening(mesh, storyIndex, bounds, metadata);
        continue;
      }

      if (!metadata.game_nav_blocks_movement || !this.isMovementBlockingKind(metadata.game_nav_kind ?? metadata.kind)) {
        continue;
      }

      const blocker: NavigationBlockerRecord = {
        mesh,
        meshName: mesh.name,
        storyIndex,
        kind: metadata.game_nav_kind ?? metadata.kind,
        blocksMovement: metadata.game_nav_blocks_movement,
        blocksVision: metadata.game_nav_blocks_vision ?? false,
        footprint: metadata.game_nav_footprint ?? metadata.footprint,
        boundsMin: bounds.min,
        boundsMax: bounds.max
      };

      this.blockers.push(blocker);
      const storyBlockers = this.blockersByStory.get(storyIndex) ?? [];
      storyBlockers.push(blocker);
      this.blockersByStory.set(storyIndex, storyBlockers);
    }

    this.projectBlockedCells();
    this.projectBlockedEdges();
    this.logStats();
  }

  public isCellBlocked(cell: HexCell, storyIndex: number): boolean {
    return this.blockedCellsByStory.get(storyIndex)?.has(makeStoryCellKey(storyIndex, cell)) ?? false;
  }

  public isEdgeBlocked(fromCell: HexCell, toCell: HexCell, storyIndex: number): boolean {
    return this.blockedEdgeKeys.has(makeEdgeKey(storyIndex, fromCell, toCell));
  }

  public getBlockedCells(storyIndex: number): readonly HexCell[] {
    return [...(this.blockedCellsByStory.get(storyIndex)?.values() ?? [])];
  }

  public getBlockedCellEntries(): readonly { readonly cell: HexCell; readonly storyIndex: number }[] {
    const entries: { cell: HexCell; storyIndex: number }[] = [];
    for (const [storyIndex, cells] of this.blockedCellsByStory) {
      for (const cell of cells.values()) {
        entries.push({ cell, storyIndex });
      }
    }
    return entries;
  }

  public getBlockers(): readonly NavigationBlockerRecord[] {
    return this.blockers;
  }

  public getDoorOpenings(): readonly NavigationDoorOpeningRecord[] {
    return this.doorOpenings;
  }

  public getDoorOpeningsForStory(storyIndex: number): readonly NavigationDoorOpeningRecord[] {
    return this.doorOpeningsByStory.get(storyIndex) ?? [];
  }

  public getBlockedEdgeCount(): number {
    return this.blockedEdgeKeys.size;
  }

  public isEdgeOpenedByDoor(fromCell: HexCell, toCell: HexCell, storyIndex: number): boolean {
    return this.doorOpenedEdgeKeys.has(makeEdgeKey(storyIndex, fromCell, toCell));
  }

  public getDebugInfoForMove(fromCell: HexCell, toCell: HexCell, storyIndex: number): {
    readonly cellBlocked: boolean;
    readonly edgeBlocked: boolean;
    readonly edgeOpenedByDoor: boolean;
    readonly blockersForTargetCell: readonly string[];
    readonly blockedEdgeCount: number;
  } {
    return {
      cellBlocked: this.isCellBlocked(toCell, storyIndex),
      edgeBlocked: this.isEdgeBlocked(fromCell, toCell, storyIndex),
      edgeOpenedByDoor: this.isEdgeOpenedByDoor(fromCell, toCell, storyIndex),
      blockersForTargetCell: this.getBlockersForCell(toCell, storyIndex).map((blocker) => blocker.meshName),
      blockedEdgeCount: this.getBlockedEdgeCount()
    };
  }

  public getBlockersForCell(cell: HexCell, storyIndex: number): readonly NavigationBlockerRecord[] {
    return this.blockersByCellKey.get(makeStoryCellKey(storyIndex, cell)) ?? [];
  }

  private clear(): void {
    this.blockers.length = 0;
    this.blockersByStory.clear();
    this.doorOpenings.length = 0;
    this.doorOpeningsByStory.clear();
    this.blockedCellsByStory.clear();
    this.blockersByCellKey.clear();
    this.blockedEdgeKeys.clear();
    this.doorOpenedEdgeKeys.clear();
  }

  private addDoorOpening(
    mesh: AbstractMesh,
    storyIndex: number,
    bounds: { readonly min: Vector3; readonly max: Vector3 },
    metadata: NonNullable<ReturnType<typeof parseGameNavigationMetadata>>
  ): void {
    const doorOpening: NavigationDoorOpeningRecord = {
      mesh,
      meshName: mesh.name,
      storyIndex,
      boundsMin: bounds.min,
      boundsMax: bounds.max,
      tileX: metadata.tileX,
      tileY: metadata.tileY,
      edgeSide: metadata.edgeSide,
      wallOrientation: metadata.wallOrientation,
      doorType: metadata.doorType
    };

    this.doorOpenings.push(doorOpening);
    const storyDoors = this.doorOpeningsByStory.get(storyIndex) ?? [];
    storyDoors.push(doorOpening);
    this.doorOpeningsByStory.set(storyIndex, storyDoors);
  }

  private isMovementBlockingKind(kind: GameNavKind): boolean {
    return kind !== "floor" && kind !== "door" && kind !== "decorative" && kind !== "trigger" && kind !== "stairs";
  }

  private shouldProjectAsBlockedCell(blocker: NavigationBlockerRecord): boolean {
    if (!blocker.blocksMovement || blocker.footprint === "none") {
      return false;
    }

    // Walls are thin separators: they block transitions between cells, not the floor cells beside them.
    if (blocker.kind === "wall") {
      return false;
    }

    return blocker.kind === "blocking" || blocker.kind === "obstacle" || blocker.kind === "cover";
  }

  private shouldProjectAsBlockedEdge(blocker: NavigationBlockerRecord): boolean {
    if (!blocker.blocksMovement || blocker.footprint === "none") {
      return false;
    }

    return blocker.kind === "wall" || blocker.kind === "blocking" || blocker.kind === "obstacle";
  }

  private projectBlockedCells(): void {
    if (!this.grid) {
      return;
    }

    const epsilon = this.grid.getHexSize() * 0.05;

    for (const blocker of this.blockers) {
      if (!this.shouldProjectAsBlockedCell(blocker)) {
        continue;
      }

      const inflatedBounds = inflateBounds(toBounds2D(blocker), epsilon);
      const storyY = this.storyYByStory.get(blocker.storyIndex) ?? blocker.boundsMin.y;
      for (const cell of this.grid.getCellsWithinBounds()) {
        const center = this.grid.cellToWorld(cell, storyY);
        if (!pointInsideAabb2D({ x: center.x, z: center.z }, inflatedBounds)) {
          continue;
        }

        const key = makeStoryCellKey(blocker.storyIndex, cell);
        const cells = this.blockedCellsByStory.get(blocker.storyIndex) ?? new Map<string, HexCell>();
        cells.set(key, new HexCell(cell.q, cell.r));
        this.blockedCellsByStory.set(blocker.storyIndex, cells);

        const cellBlockers = this.blockersByCellKey.get(key) ?? [];
        cellBlockers.push(blocker);
        this.blockersByCellKey.set(key, cellBlockers);
      }
    }
  }

  private projectBlockedEdges(): void {
    if (!this.grid) {
      return;
    }

    // Render-mesh AABBs are a compatibility fallback for current GLBs. The robust exporter contract should emit
    // dedicated nav wall blockers and nav door openings so merged visual wall meshes do not over-block doorways.
    const hexSize = this.grid.getHexSize();
    const wallEpsilon = Math.max(0.08, hexSize * 0.08);
    const doorEpsilon = Math.max(0.20, hexSize * 0.35);
    let carvedEdgesLogged = 0;
    const maxCarvedEdgeLogs = 25;

    for (const [storyIndex, blockers] of this.blockersByStory) {
      const edgeBlockers = blockers.filter((blocker) => this.shouldProjectAsBlockedEdge(blocker));
      if (edgeBlockers.length === 0) {
        continue;
      }

      const doorOpenings = this.doorOpeningsByStory.get(storyIndex) ?? [];
      const storyY = this.storyYByStory.get(storyIndex) ?? this.grid.getOrigin().y;
      for (const fromCell of this.grid.getCellsWithinBounds()) {
        const from = this.grid.cellToWorld(fromCell, storyY);
        for (const toCell of this.grid.getNeighbors(fromCell)) {
          if (!this.grid.contains(toCell)) {
            continue;
          }

          const to = this.grid.cellToWorld(toCell, storyY);
          const fromPoint = { x: from.x, z: from.z };
          const toPoint = { x: to.x, z: to.z };
          const blockedByWall = edgeBlockers.some((blocker) =>
            segmentIntersectsAabb2D(fromPoint, toPoint, inflateBounds(toBounds2D(blocker), wallEpsilon))
          );
          if (!blockedByWall) {
            continue;
          }

          const openingDoor = doorOpenings.find((door) =>
            segmentIntersectsAabb2D(fromPoint, toPoint, inflateBounds(toDoorBounds2D(door), doorEpsilon))
          );
          const edgeKey = makeEdgeKey(storyIndex, fromCell, toCell);
          if (openingDoor) {
            this.doorOpenedEdgeKeys.add(edgeKey);
            if (carvedEdgesLogged < maxCarvedEdgeLogs) {
              console.debug(
                `[NavigationBlockerRegistry] carved door edge story=${storyIndex} from=${fromCell.q}:${fromCell.r} to=${toCell.q}:${toCell.r} door='${openingDoor.meshName}'`
              );
              carvedEdgesLogged += 1;
            }
            continue;
          }

          this.blockedEdgeKeys.add(edgeKey);
        }
      }
    }
  }

  private inferStoryIndex(mesh: AbstractMesh): number | null {
    const bounds = getWorldBounds(mesh);
    let bestStory: number | null = null;
    let bestDistance = Number.POSITIVE_INFINITY;

    for (const [storyIndex, storyY] of this.storyYByStory) {
      const distance = Math.abs(bounds.center.y - storyY);
      if (distance < bestDistance) {
        bestDistance = distance;
        bestStory = storyIndex;
      }
    }

    return bestDistance <= 1.25 ? bestStory : null;
  }

  private logStats(): void {
    const stories = [...new Set([...this.blockersByStory.keys(), ...this.doorOpeningsByStory.keys()])].sort((a, b) => a - b);
    const blockedCellCount = [...this.blockedCellsByStory.values()].reduce((total, cells) => total + cells.size, 0);
    const wallBlockers = this.blockers.filter((blocker) => blocker.kind === "wall").length;
    const cellBlockers = this.blockers.filter((blocker) => this.shouldProjectAsBlockedCell(blocker)).length;
    const hexSize = this.grid?.getHexSize() ?? 0;
    const wallEpsilon = this.grid ? Math.max(0.08, hexSize * 0.08) : 0;
    const doorEpsilon = this.grid ? Math.max(0.20, hexSize * 0.35) : 0;
    console.info(
      `[NavigationBlockerRegistry] blockers=${this.blockers.length} walls=${wallBlockers} doors=${this.doorOpenings.length} cellBlockers=${cellBlockers} blockedCells=${blockedCellCount} blockedEdges=${this.blockedEdgeKeys.size} hexSize=${hexSize.toFixed(3)} wallEpsilon=${wallEpsilon.toFixed(3)} doorEpsilon=${doorEpsilon.toFixed(3)} stories=${stories.join(",") || "none"}`
    );
  }
}

export function circleIntersectsAabb2D(center: Point2D, radius: number, bounds: Bounds2D): boolean {
  const closestX = clamp(center.x, bounds.minX, bounds.maxX);
  const closestZ = clamp(center.z, bounds.minZ, bounds.maxZ);
  const dx = center.x - closestX;
  const dz = center.z - closestZ;
  return dx * dx + dz * dz <= radius * radius;
}

export function segmentIntersectsAabb2D(from: Point2D, to: Point2D, bounds: Bounds2D): boolean {
  if (pointInsideAabb2D(from, bounds) || pointInsideAabb2D(to, bounds)) {
    return true;
  }

  let tMin = 0;
  let tMax = 1;
  const dx = to.x - from.x;
  const dz = to.z - from.z;

  const clip = (p: number, q: number): boolean => {
    if (Math.abs(p) <= Number.EPSILON) {
      return q >= 0;
    }

    const t = q / p;
    if (p < 0) {
      if (t > tMax) {
        return false;
      }
      if (t > tMin) {
        tMin = t;
      }
      return true;
    }

    if (t < tMin) {
      return false;
    }
    if (t < tMax) {
      tMax = t;
    }
    return true;
  };

  return clip(-dx, from.x - bounds.minX) &&
    clip(dx, bounds.maxX - from.x) &&
    clip(-dz, from.z - bounds.minZ) &&
    clip(dz, bounds.maxZ - from.z);
}

function pointInsideAabb2D(point: Point2D, bounds: Bounds2D): boolean {
  return point.x >= bounds.minX && point.x <= bounds.maxX && point.z >= bounds.minZ && point.z <= bounds.maxZ;
}

function inflateBounds(bounds: Bounds2D, epsilon: number): Bounds2D {
  return {
    minX: bounds.minX - epsilon,
    maxX: bounds.maxX + epsilon,
    minZ: bounds.minZ - epsilon,
    maxZ: bounds.maxZ + epsilon
  };
}

function toBounds2D(blocker: NavigationBlockerRecord): Bounds2D {
  return {
    minX: blocker.boundsMin.x,
    maxX: blocker.boundsMax.x,
    minZ: blocker.boundsMin.z,
    maxZ: blocker.boundsMax.z
  };
}

function toDoorBounds2D(door: NavigationDoorOpeningRecord): Bounds2D {
  return {
    minX: door.boundsMin.x,
    maxX: door.boundsMax.x,
    minZ: door.boundsMin.z,
    maxZ: door.boundsMax.z
  };
}

function makeEdgeKey(storyIndex: number, first: HexCell, second: HexCell): string {
  const firstKey = `${first.q}:${first.r}`;
  const secondKey = `${second.q}:${second.r}`;
  return firstKey < secondKey
    ? `${storyIndex}:${firstKey}->${secondKey}`
    : `${storyIndex}:${secondKey}->${firstKey}`;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
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
