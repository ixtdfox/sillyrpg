import { Vector3, type AbstractMesh, type Scene } from "@babylonjs/core";
import { GridCell } from "../grid/GridCell";
import type { RectGrid } from "../grid/RectGrid";
import {
  parseGameNavigationMetadata,
  parseStairCheckpointMetadata,
  parseStairConnectorMetadata,
  type GameNavFootprint,
  type GameNavKind
} from "./BuildingNavigationMetadata";
import { makeStoryCellKey } from "./FloorNavigationSurfaceRegistry";
import { mapGridNavigationContractsToRuntime } from "./GridNavigationContract";

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

export interface NavigationBlockedEdgeEntry {
  readonly storyIndex: number;
  readonly a: GridCell;
  readonly b: GridCell;
  readonly reason?: string;
}

export interface NavigationDoorEdgeEntry {
  readonly storyIndex: number;
  readonly a: GridCell;
  readonly b: GridCell;
  readonly doorId?: string;
  readonly isOpen: boolean;
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
  private readonly blockedCellsByStory: Map<number, Map<string, GridCell>>;
  private readonly blockedCellReasonByStoryKey: Map<string, string>;
  private readonly blockersByCellKey: Map<string, NavigationBlockerRecord[]>;
  private readonly blockedEdgeKeys: Set<string>;
  private readonly doorOpenedEdgeKeys: Set<string>;
  private readonly blockedEdgeEntries: NavigationBlockedEdgeEntry[];
  private readonly doorEdgeEntries: NavigationDoorEdgeEntry[];
  private grid: RectGrid | null;
  private storyYByStory: ReadonlyMap<number, number>;
  private readonly edgeDebugEnabled: boolean;

  public constructor() {
    this.blockers = [];
    this.blockersByStory = new Map();
    this.doorOpenings = [];
    this.doorOpeningsByStory = new Map();
    this.blockedCellsByStory = new Map();
    this.blockedCellReasonByStoryKey = new Map();
    this.blockersByCellKey = new Map();
    this.blockedEdgeKeys = new Set();
    this.doorOpenedEdgeKeys = new Set();
    this.blockedEdgeEntries = [];
    this.doorEdgeEntries = [];
    this.grid = null;
    this.storyYByStory = new Map();
    this.edgeDebugEnabled = readRectNavDebugFlag();
  }

  public rebuild(scene: Scene, grid: RectGrid, storyYByStory: ReadonlyMap<number, number> = new Map()): void {
    this.clear();
    this.grid = grid;
    this.storyYByStory = new Map(storyYByStory);
    const gridContracts = mapGridNavigationContractsToRuntime(scene, grid);
    const hasGridContract = gridContracts.length > 0;
    let contractBlockedEdgeCount = 0;
    let contractDoorEdgeCount = 0;
    let contractBlockedCellCount = 0;
    let contractStairCount = 0;
    let contractDoorOverrides = 0;
    for (const contract of gridContracts) {
      for (const story of contract.stories) {
        contractBlockedEdgeCount += story.blockedEdges.length;
        contractDoorEdgeCount += story.doorEdges.length;
        contractBlockedCellCount += story.blockedCells.length;
        contractStairCount += story.stairs.length;
        const walkableKeys = new Set(story.walkableCells.map((cell) => makeStoryCellKey(story.storyIndex, cell)));
        const openDoorEndpointKeys = this.collectOpenDoorEndpointKeys(story.storyIndex, story.doorEdges);
        for (const blockedCell of story.blockedCells) {
          const key = makeStoryCellKey(story.storyIndex, blockedCell.cell);
          if (openDoorEndpointKeys.has(key)) {
            console.warn(
              `[RectNavDoorValidation] story=${story.storyIndex} door=unknown edge=unknown endpointBlocked=${blockedCell.cell.x}:${blockedCell.cell.z} reason=${blockedCell.reason ?? "unknown"} action=skippedBlockedCell`
            );
            continue;
          }
          this.addBlockedCell(story.storyIndex, blockedCell.cell, blockedCell.reason);
        }
        for (const edge of story.blockedEdges) {
          const edgeKey = makeEdgeKey(story.storyIndex, edge.a, edge.b);
          this.blockedEdgeKeys.add(edgeKey);
          this.blockedEdgeEntries.push({
            storyIndex: story.storyIndex,
            a: new GridCell(edge.a.x, edge.a.z),
            b: new GridCell(edge.b.x, edge.b.z),
            reason: edge.reason
          });
        }
        for (const edge of story.doorEdges) {
          this.doorEdgeEntries.push({
            storyIndex: story.storyIndex,
            a: new GridCell(edge.a.x, edge.a.z),
            b: new GridCell(edge.b.x, edge.b.z),
            doorId: edge.doorId,
            isOpen: edge.isOpen
          });
          if (edge.isOpen) {
            const edgeKey = makeEdgeKey(story.storyIndex, edge.a, edge.b);
            this.doorOpenedEdgeKeys.add(edgeKey);
            if (this.blockedEdgeKeys.delete(edgeKey)) {
              contractDoorOverrides += 1;
            }
            const blockedEndpoint = this.getBlockedEndpointForDoor(story.storyIndex, edge.a, edge.b);
            const aWalkable = walkableKeys.has(makeStoryCellKey(story.storyIndex, edge.a));
            const bWalkable = walkableKeys.has(makeStoryCellKey(story.storyIndex, edge.b));
            if (blockedEndpoint) {
              const reason = this.blockedCellReasonByStoryKey.get(makeStoryCellKey(story.storyIndex, blockedEndpoint)) ?? "unknown";
              console.warn(
                `[RectNavDoorValidation] story=${story.storyIndex} door=${edge.doorId ?? "unknown"} edge=${edge.a.x}:${edge.a.z}<->${edge.b.x}:${edge.b.z} outsideWalkable=${aWalkable} insideWalkable=${bWalkable} endpointBlocked=true blockedEndpoint=${blockedEndpoint.x}:${blockedEndpoint.z} reason=${reason} ok=false`
              );
            } else {
              console.info(
                `[RectNavDoorValidation] story=${story.storyIndex} door=${edge.doorId ?? "unknown"} edge=${edge.a.x}:${edge.a.z}<->${edge.b.x}:${edge.b.z} outsideWalkable=${aWalkable} insideWalkable=${bWalkable} endpointBlocked=false ok=${aWalkable && bWalkable}`
              );
            }
          }
        }
      }
    }
    if (contractDoorOverrides > 0) {
      console.info(`[NavigationBlockerRegistry] contract door overrides applied: ${contractDoorOverrides} blocked edges reopened.`);
    }

    let wallBlockerMeshCount = 0;
    let obstacleBlockerMeshCount = 0;
    const stairMetadataIds = new Set<string>();

    for (const mesh of scene.meshes) {
      if (mesh.isDisposed() || mesh.getTotalVertices() <= 0) {
        continue;
      }

      const stairConnectorMetadata = parseStairConnectorMetadata(mesh);
      if (stairConnectorMetadata) {
        stairMetadataIds.add(stairConnectorMetadata.stair_id);
      }
      const stairCheckpointMetadata = parseStairCheckpointMetadata(mesh);
      if (stairCheckpointMetadata) {
        stairMetadataIds.add(stairCheckpointMetadata.stair_id);
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

      if (blocker.kind === "wall") {
        wallBlockerMeshCount += 1;
      }
      if (blocker.kind === "blocking" || blocker.kind === "obstacle" || blocker.kind === "cover") {
        obstacleBlockerMeshCount += 1;
      }
    }

    if (!hasGridContract) {
      this.projectBlockedCells();
      this.projectBlockedEdges();
    } else {
      this.validateContractGridAlignment();
      this.logContractDiagnostics({
        contractBlockedEdgeCount,
        contractDoorEdgeCount,
        contractBlockedCellCount,
        contractStairCount,
        wallBlockerMeshCount,
        obstacleBlockerMeshCount,
        stairMetadataCount: stairMetadataIds.size
      });
    }

    this.logStats();
  }

  public isCellBlocked(cell: GridCell, storyIndex: number): boolean {
    return this.blockedCellsByStory.get(storyIndex)?.has(makeStoryCellKey(storyIndex, cell)) ?? false;
  }

  public forceUnblockCell(cell: GridCell, storyIndex: number, reason: string): void {
    const key = makeStoryCellKey(storyIndex, cell);
    const cells = this.blockedCellsByStory.get(storyIndex);
    if (!cells?.delete(key)) {
      return;
    }
    this.blockedCellReasonByStoryKey.delete(key);
    this.blockersByCellKey.delete(key);
    console.warn(`[NavigationBlockerRegistry] force-unblocked cell=${storyIndex}:${cell.x}:${cell.z} reason=${reason}`);
  }

  public isEdgeBlocked(fromCell: GridCell, toCell: GridCell, storyIndex: number): boolean {
    const key = makeEdgeKey(storyIndex, fromCell, toCell);
    const blocked = this.blockedEdgeKeys.has(key);
    const openedByDoor = this.doorOpenedEdgeKeys.has(key);
    if (this.edgeDebugEnabled && blocked) {
      console.debug(
        `[RectNavEdgeCheck] story=${storyIndex} from=${fromCell.x}:${fromCell.z} to=${toCell.x}:${toCell.z} key=${key} blocked=${blocked} openedByDoor=${openedByDoor}`
      );
    }
    return blocked;
  }

  public getEdgeKey(fromCell: GridCell, toCell: GridCell, storyIndex: number): string {
    return makeEdgeKey(storyIndex, fromCell, toCell);
  }

  public getBlockedCells(storyIndex: number): readonly GridCell[] {
    return [...(this.blockedCellsByStory.get(storyIndex)?.values() ?? [])];
  }

  public getBlockedCellEntries(): readonly { readonly cell: GridCell; readonly storyIndex: number }[] {
    const entries: { cell: GridCell; storyIndex: number }[] = [];
    for (const [storyIndex, cells] of this.blockedCellsByStory) {
      for (const cell of cells.values()) {
        entries.push({ cell, storyIndex });
      }
    }
    return entries;
  }

  public getBlockedEdgeEntries(): readonly NavigationBlockedEdgeEntry[] {
    return this.blockedEdgeEntries.map((entry) => ({
      storyIndex: entry.storyIndex,
      a: new GridCell(entry.a.x, entry.a.z),
      b: new GridCell(entry.b.x, entry.b.z),
      reason: entry.reason
    }));
  }

  public getDoorEdgeEntries(): readonly NavigationDoorEdgeEntry[] {
    return this.doorEdgeEntries.map((entry) => ({
      storyIndex: entry.storyIndex,
      a: new GridCell(entry.a.x, entry.a.z),
      b: new GridCell(entry.b.x, entry.b.z),
      doorId: entry.doorId,
      isOpen: entry.isOpen
    }));
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

  public isEdgeOpenedByDoor(fromCell: GridCell, toCell: GridCell, storyIndex: number): boolean {
    return this.doorOpenedEdgeKeys.has(makeEdgeKey(storyIndex, fromCell, toCell));
  }

  public getDebugInfoForMove(fromCell: GridCell, toCell: GridCell, storyIndex: number): {
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

  public getBlockersForCell(cell: GridCell, storyIndex: number): readonly NavigationBlockerRecord[] {
    return this.blockersByCellKey.get(makeStoryCellKey(storyIndex, cell)) ?? [];
  }

  private clear(): void {
    this.blockers.length = 0;
    this.blockersByStory.clear();
    this.doorOpenings.length = 0;
    this.doorOpeningsByStory.clear();
    this.blockedCellsByStory.clear();
    this.blockedCellReasonByStoryKey.clear();
    this.blockersByCellKey.clear();
    this.blockedEdgeKeys.clear();
    this.doorOpenedEdgeKeys.clear();
    this.blockedEdgeEntries.length = 0;
    this.doorEdgeEntries.length = 0;
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

  private addBlockedCell(storyIndex: number, cell: GridCell, reason?: string): void {
    const key = makeStoryCellKey(storyIndex, cell);
    const cells = this.blockedCellsByStory.get(storyIndex) ?? new Map<string, GridCell>();
    cells.set(key, new GridCell(cell.x, cell.z));
    this.blockedCellsByStory.set(storyIndex, cells);
    if (reason) {
      this.blockedCellReasonByStoryKey.set(key, reason);
    }
  }

  private collectOpenDoorEndpointKeys(
    storyIndex: number,
    doorEdges: readonly { readonly a: GridCell; readonly b: GridCell; readonly isOpen: boolean }[]
  ): Set<string> {
    const result = new Set<string>();
    for (const edge of doorEdges) {
      if (!edge.isOpen) {
        continue;
      }
      result.add(makeStoryCellKey(storyIndex, edge.a));
      result.add(makeStoryCellKey(storyIndex, edge.b));
    }
    return result;
  }

  private getBlockedEndpointForDoor(storyIndex: number, a: GridCell, b: GridCell): GridCell | null {
    if (this.isCellBlocked(a, storyIndex)) {
      return a;
    }
    if (this.isCellBlocked(b, storyIndex)) {
      return b;
    }
    return null;
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

    const epsilon = this.grid.getTileSize() * 0.05;

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
        this.addBlockedCell(blocker.storyIndex, cell);

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
    const tileSize = this.grid.getTileSize();
    const wallEpsilon = Math.max(0.08, tileSize * 0.08);
    const doorEpsilon = Math.max(0.20, tileSize * 0.35);
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
                `[NavigationBlockerRegistry] carved door edge story=${storyIndex} from=${fromCell.x}:${fromCell.z} to=${toCell.x}:${toCell.z} door='${openingDoor.meshName}'`
              );
              carvedEdgesLogged += 1;
            }
            continue;
          }

          this.blockedEdgeKeys.add(edgeKey);
          this.blockedEdgeEntries.push({
            storyIndex,
            a: new GridCell(fromCell.x, fromCell.z),
            b: new GridCell(toCell.x, toCell.z),
            reason: "mesh_projection"
          });
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
    const tileSize = this.grid?.getTileSize() ?? 0;
    const wallEpsilon = this.grid ? Math.max(0.08, tileSize * 0.08) : 0;
    const doorEpsilon = this.grid ? Math.max(0.20, tileSize * 0.35) : 0;
    console.info(
      `[NavigationBlockerRegistry] blockers=${this.blockers.length} walls=${wallBlockers} doors=${this.doorOpenings.length} cellBlockers=${cellBlockers} blockedCells=${blockedCellCount} blockedEdges=${this.blockedEdgeKeys.size} tileSize=${tileSize.toFixed(3)} wallEpsilon=${wallEpsilon.toFixed(3)} doorEpsilon=${doorEpsilon.toFixed(3)} stories=${stories.join(",") || "none"}`
    );
  }

  private logContractDiagnostics(input: {
    readonly contractBlockedEdgeCount: number;
    readonly contractDoorEdgeCount: number;
    readonly contractBlockedCellCount: number;
    readonly contractStairCount: number;
    readonly wallBlockerMeshCount: number;
    readonly obstacleBlockerMeshCount: number;
    readonly stairMetadataCount: number;
  }): void {
    console.info(
      `[NavigationBlockerRegistry] using v3 contract blockers: blocked_edges=${input.contractBlockedEdgeCount} door_edges=${input.contractDoorEdgeCount} blocked_cells=${input.contractBlockedCellCount} stairs=${input.contractStairCount}`
    );

    if (input.contractBlockedEdgeCount === 0 && input.wallBlockerMeshCount > 0) {
      console.warn(
        `[NavigationBlockerRegistry] v3 contract has blocked_edges=0 but wall meshes=${input.wallBlockerMeshCount}. Walls will not block movement until exporter data is fixed.`
      );
    }

    if (input.contractStairCount === 0 && input.stairMetadataCount > 0) {
      console.warn(
        `[NavigationBlockerRegistry] v3 contract has stairs=0 but stair metadata entries=${input.stairMetadataCount}. Stair metadata fallback is active.`
      );
    }

    if (input.contractBlockedCellCount === 0 && input.obstacleBlockerMeshCount > 0) {
      console.warn(
        `[NavigationBlockerRegistry] v3 contract has blocked_cells=0 but obstacle meshes=${input.obstacleBlockerMeshCount}. Obstacles will not block cells until exporter data is fixed.`
      );
    }
  }

  private validateContractGridAlignment(): void {
    if (!this.grid) {
      return;
    }
    const blockedOutOfBounds = this.blockedEdgeEntries.filter((edge) =>
      !this.grid!.contains(edge.a) || !this.grid!.contains(edge.b)
    ).length;

    let blockedEdgeOutsideOrNonNeighbor = 0;
    for (const edge of this.blockedEdgeEntries) {
      const aIn = this.grid.contains(edge.a);
      const bIn = this.grid.contains(edge.b);
      const isNeighbor = edge.a.distance(edge.b) === 1;
      if (!aIn || !bIn || !isNeighbor) {
        blockedEdgeOutsideOrNonNeighbor += 1;
      }
    }

    let invalidDoorEdges = 0;
    const blockedKeys = new Set(this.blockedEdgeEntries.map((entry) => makeEdgeKey(entry.storyIndex, entry.a, entry.b)));
    for (const door of this.doorEdgeEntries) {
      const key = makeEdgeKey(door.storyIndex, door.a, door.b);
      const aIn = this.grid.contains(door.a);
      const bIn = this.grid.contains(door.b);
      const isRelevant = blockedKeys.has(key) || (aIn && bIn);
      if (!isRelevant) {
        invalidDoorEdges += 1;
      }
    }

    const bounds = this.grid.getBounds();
    console.info(
      `[RectNavContractValidation] gridBounds=x=[${bounds.minX},${bounds.maxX}] z=[${bounds.minZ},${bounds.maxZ}] blockedEdgeOutOfBounds=${blockedOutOfBounds} blockedEdgeOutsideOrNonNeighbor=${blockedEdgeOutsideOrNonNeighbor} invalidDoorEdges=${invalidDoorEdges}`
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

export function makeEdgeKey(storyIndex: number, first: GridCell, second: GridCell): string {
  const firstKey = `${first.x}:${first.z}`;
  const secondKey = `${second.x}:${second.z}`;
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

function readRectNavDebugFlag(): boolean {
  const g = globalThis as { readonly __RECT_NAV_DEBUG__?: unknown; readonly location?: { readonly search?: string } };
  const raw = typeof g.__RECT_NAV_DEBUG__ === "string" ? g.__RECT_NAV_DEBUG__.toLowerCase() : "";
  if (raw === "1" || raw === "true") {
    return true;
  }
  const query = g.location?.search ?? "";
  return query.includes("rectNavDebug=1") || query.includes("rectNavDebug=true");
}
