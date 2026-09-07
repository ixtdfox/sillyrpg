import { Matrix, Vector3, type Node, type Scene } from "@babylonjs/core";
import type { RectGrid } from "../grid/RectGrid";
import { GridCell } from "../grid/GridCell";

export const GRID_NAVIGATION_CONTRACT = "sillyrpg.grid_navigation.v3";

export interface GridNavigationStoryContract {
  readonly storyIndex: number;
  readonly storyY: number;
  readonly walkableCells: readonly GridCell[];
  readonly blockedCells: readonly { readonly cell: GridCell; readonly reason?: string }[];
  readonly blockedEdges: readonly GridNavigationEdge[];
  readonly doorEdges: readonly GridNavigationDoorEdge[];
  readonly stairs: readonly GridNavigationStair[];
}

export interface GridNavigationEdge {
  readonly a: GridCell;
  readonly b: GridCell;
  readonly reason?: string;
}

export interface GridNavigationDoorEdge {
  readonly a: GridCell;
  readonly b: GridCell;
  readonly doorId?: string;
  readonly isOpen: boolean;
}

export interface GridNavigationStair {
  readonly id: string;
  readonly kind?: "internal" | "external";
  readonly cost?: number;
  readonly bidirectional?: boolean;
  readonly from: { readonly storyIndex: number; readonly cell: GridCell };
  readonly to: { readonly storyIndex: number; readonly cell: GridCell };
  readonly traversalPathWorld?: readonly Vector3[];
}

export interface GridNavigationContract {
  readonly contract: typeof GRID_NAVIGATION_CONTRACT;
  readonly gridType: "rect";
  readonly tileSizeM: 1;
  readonly origin: { readonly x: number; readonly z: number };
  readonly coordinateMapping: "blender_xy_to_game_xz";
  readonly stories: readonly GridNavigationStoryContract[];
}

export interface ParsedGridNavigationContract {
  readonly sourceNode: Node;
  readonly contract: GridNavigationContract;
}

export interface MappedGridNavigationContract extends GridNavigationContract {
  readonly mappingSourceNodeName: string;
}

type RawContract = {
  contract?: unknown;
  grid_type?: unknown;
  tile_size_m?: unknown;
  origin?: unknown;
  coordinate_mapping?: unknown;
  stories?: unknown;
};

type RawStory = {
  story_index?: unknown;
  story_y_m?: unknown;
  walkable_cells?: unknown;
  blocked_cells?: unknown;
  blocked_edges?: unknown;
  door_edges?: unknown;
  stairs?: unknown;
};

/**
 * Object service для v3 rect-grid navigation contract.
 *
 * Сервис выполняет три разные, но связанные роли: достает JSON contract из
 * scene metadata, парсит его в доменную модель и мапит координаты exporter'а в
 * runtime grid. Внутренние helpers оставлены методами класса, чтобы navigation
 * пакет не зависел от процедурных module-level функций.
 */
export class GridNavigationContractService {
  private static readonly shared = new GridNavigationContractService();
  private hasWarnedMissingContract = false;

  /** Возвращает общий contract service для registry/factory слоев. */
  public static getShared(): GridNavigationContractService {
    return GridNavigationContractService.shared;
  }

  /** Извлекает только contracts без source node metadata. */
  public parseContracts(scene: Scene): GridNavigationContract[] {
    return this.parseEntries(scene).map((entry) => entry.contract);
  }

  /** Извлекает contracts вместе с node, из которого они были прочитаны. */
  public parseEntries(scene: Scene): ParsedGridNavigationContract[] {
    const contracts: ParsedGridNavigationContract[] = [];
    for (const node of this.collectSceneNodes(scene)) {
      for (const metadata of this.resolveMetadataCandidates(node)) {
        const rawJson = this.normalizeString(metadata.game_navigation_json);
        if (!rawJson) {
          continue;
        }
        try {
          const raw = JSON.parse(rawJson) as RawContract;
          const contract = this.parseContract(raw);
          if (contract) {
            this.validateContract(contract, node.name);
            this.logContractStats(contract, node.name);
            contracts.push({ sourceNode: node, contract });
          }
        } catch (error) {
          console.warn(`[GridNavigationContract] invalid game_navigation_json on '${node.name}': ${error}`);
        }
      }
    }
    if (contracts.length === 0 && !this.hasWarnedMissingContract) {
      this.hasWarnedMissingContract = true;
      console.warn("[GridNavigation] No v3 contract found; using legacy mesh projection fallback. Rect navigation may be imprecise.");
    }
    return contracts;
  }

  /** Мапит exporter coordinates в runtime RectGrid coordinates. */
  public mapToRuntime(scene: Scene, grid: RectGrid): MappedGridNavigationContract[] {
    const entries = this.parseEntries(scene);
    const mapped = entries.map((entry) => this.mapContractEntryToRuntime(entry, grid));
    this.logMappingDiagnostics(scene, grid, entries, mapped);
    return mapped;
  }

  private mapContractEntryToRuntime(entry: ParsedGridNavigationContract, grid: RectGrid): MappedGridNavigationContract {
    entry.sourceNode.computeWorldMatrix(true);
    const worldMatrix = entry.sourceNode.getWorldMatrix();
    const sourceName = entry.sourceNode.name || "(unnamed)";
    const instanceId = this.resolveSceneObjectInstanceId(entry.sourceNode);
    const storyYByStory = new Map(entry.contract.stories.map((story) => [story.storyIndex, story.storyY]));
    const mappedStories = entry.contract.stories.map((story) => {
      const mappedStoryY = this.mapStoryY(entry.contract, story.storyY, worldMatrix);
      const mappedWalkableCells = story.walkableCells.map((cell) => this.mapCellToRuntime(entry.contract, cell, story.storyY, worldMatrix, grid));
      const mappedBlockedCells = story.blockedCells.map((item) => ({
        cell: this.mapCellToRuntime(entry.contract, item.cell, story.storyY, worldMatrix, grid),
        reason: item.reason
      }));
      const mappedBlockedEdges = story.blockedEdges.map((edge) => ({
        a: this.mapCellToRuntime(entry.contract, edge.a, story.storyY, worldMatrix, grid),
        b: this.mapCellToRuntime(entry.contract, edge.b, story.storyY, worldMatrix, grid),
        reason: edge.reason
      }));
      const mappedDoorEdges = story.doorEdges.map((edge) => ({
        a: this.mapCellToRuntime(entry.contract, edge.a, story.storyY, worldMatrix, grid),
        b: this.mapCellToRuntime(entry.contract, edge.b, story.storyY, worldMatrix, grid),
        doorId: edge.doorId,
        isOpen: edge.isOpen
      }));
      const mappedStairs = story.stairs.map((stair) => ({
        id: instanceId ? `${instanceId}:${stair.id}` : stair.id,
        kind: stair.kind,
        cost: stair.cost,
        bidirectional: stair.bidirectional,
        from: {
          storyIndex: stair.from.storyIndex,
          cell: this.mapCellToRuntime(
            entry.contract,
            stair.from.cell,
            storyYByStory.get(stair.from.storyIndex) ?? story.storyY,
            worldMatrix,
            grid
          )
        },
        to: {
          storyIndex: stair.to.storyIndex,
          cell: this.mapCellToRuntime(
            entry.contract,
            stair.to.cell,
            storyYByStory.get(stair.to.storyIndex) ?? story.storyY,
            worldMatrix,
            grid
          )
        },
        traversalPathWorld: stair.traversalPathWorld?.map((point) => this.mapWorldPointToRuntime(point, worldMatrix))
      }));

      for (let i = 0; i < mappedBlockedEdges.length; i += 1) {
        const mappedEdge = mappedBlockedEdges[i];
        const rawEdge = story.blockedEdges[i];
        this.validateMappedNeighborEdge(mappedEdge.a, mappedEdge.b, rawEdge?.a, rawEdge?.b, sourceName, story.storyIndex, "blocked_edges", worldMatrix);
      }
      for (let i = 0; i < mappedDoorEdges.length; i += 1) {
        const mappedEdge = mappedDoorEdges[i];
        const rawEdge = story.doorEdges[i];
        this.validateMappedNeighborEdge(mappedEdge.a, mappedEdge.b, rawEdge?.a, rawEdge?.b, sourceName, story.storyIndex, "door_edges", worldMatrix);
      }

      return {
        storyIndex: story.storyIndex,
        storyY: mappedStoryY,
        walkableCells: this.dedupeCells(mappedWalkableCells),
        blockedCells: this.dedupeBlockedCells(mappedBlockedCells),
        blockedEdges: this.dedupeEdges(mappedBlockedEdges),
        doorEdges: this.dedupeDoorEdges(mappedDoorEdges),
        stairs: this.dedupeStairs(mappedStairs)
      };
    });

    return {
      ...entry.contract,
      stories: mappedStories,
      mappingSourceNodeName: sourceName
    };
  }

  private resolveSceneObjectInstanceId(sourceNode: Node): string | null {
    let node: Node | null = sourceNode;
    while (node) {
      const metadata = node.metadata && typeof node.metadata === "object"
        ? node.metadata as Record<string, unknown>
        : {};
      const instanceId = this.normalizeString(metadata.buildingVisibilityInstanceId)
        ?? this.normalizeString(metadata.sceneObjectId);
      if (instanceId) {
        return instanceId;
      }
      node = node.parent;
    }

    return null;
  }

  private mapCellToRuntime(
    contract: GridNavigationContract,
    cell: GridCell,
    storyY: number,
    worldMatrix: Matrix,
    grid: RectGrid
  ): GridCell {
    const rawCenter = new Vector3(
      contract.origin.x + (cell.x + 0.5) * contract.tileSizeM,
      storyY,
      contract.origin.z + (cell.z + 0.5) * contract.tileSizeM
    );
    const worldCenter = Vector3.TransformCoordinates(rawCenter, worldMatrix);
    return grid.worldToCell(worldCenter);
  }

  private mapStoryY(contract: GridNavigationContract, rawStoryY: number, worldMatrix: Matrix): number {
    const rawPoint = new Vector3(contract.origin.x, rawStoryY, contract.origin.z);
    return Vector3.TransformCoordinates(rawPoint, worldMatrix).y;
  }

  private mapWorldPointToRuntime(point: Vector3, worldMatrix: Matrix): Vector3 {
    return Vector3.TransformCoordinates(point, worldMatrix);
  }

  private dedupeCells(cells: readonly GridCell[]): GridCell[] {
    const map = new Map<string, GridCell>();
    for (const cell of cells) {
      map.set(cell.key(), new GridCell(cell.x, cell.z));
    }
    return [...map.values()];
  }

  private dedupeBlockedCells(cells: readonly { readonly cell: GridCell; readonly reason?: string }[]): { readonly cell: GridCell; readonly reason?: string }[] {
    const map = new Map<string, { readonly cell: GridCell; readonly reason?: string }>();
    for (const entry of cells) {
      map.set(entry.cell.key(), { cell: new GridCell(entry.cell.x, entry.cell.z), reason: entry.reason });
    }
    return [...map.values()];
  }

  private dedupeEdges(edges: readonly GridNavigationEdge[]): GridNavigationEdge[] {
    const map = new Map<string, GridNavigationEdge>();
    for (const edge of edges) {
      const key = this.edgeKey(edge.a, edge.b);
      map.set(key, { a: new GridCell(edge.a.x, edge.a.z), b: new GridCell(edge.b.x, edge.b.z), reason: edge.reason });
    }
    return [...map.values()];
  }

  private dedupeDoorEdges(edges: readonly GridNavigationDoorEdge[]): GridNavigationDoorEdge[] {
    const map = new Map<string, GridNavigationDoorEdge>();
    for (const edge of edges) {
      const key = this.edgeKey(edge.a, edge.b);
      map.set(key, {
        a: new GridCell(edge.a.x, edge.a.z),
        b: new GridCell(edge.b.x, edge.b.z),
        doorId: edge.doorId,
        isOpen: edge.isOpen
      });
    }
    return [...map.values()];
  }

  private dedupeStairs(stairs: readonly GridNavigationStair[]): GridNavigationStair[] {
    const map = new Map<string, GridNavigationStair>();
    for (const stair of stairs) {
      const key = `${stair.id}:${stair.from.storyIndex}:${stair.from.cell.key()}->${stair.to.storyIndex}:${stair.to.cell.key()}`;
      map.set(key, {
        id: stair.id,
        kind: stair.kind,
        cost: stair.cost,
        bidirectional: stair.bidirectional,
        from: { storyIndex: stair.from.storyIndex, cell: new GridCell(stair.from.cell.x, stair.from.cell.z) },
        to: { storyIndex: stair.to.storyIndex, cell: new GridCell(stair.to.cell.x, stair.to.cell.z) },
        traversalPathWorld: stair.traversalPathWorld?.map((point) => point.clone())
      });
    }
    return [...map.values()];
  }

  private edgeKey(a: GridCell, b: GridCell): string {
    const first = a.key();
    const second = b.key();
    return first < second ? `${first}|${second}` : `${second}|${first}`;
  }

  private validateMappedNeighborEdge(
    a: GridCell,
    b: GridCell,
    rawA: GridCell | undefined,
    rawB: GridCell | undefined,
    sourceName: string,
    storyIndex: number,
    field: string,
    worldMatrix: Matrix
  ): void {
    if (a.distance(b) === 1) {
      return;
    }
    console.warn(
      `[GridNavigationMapping] source=${sourceName} story=${storyIndex} field=${field} non-neighbor mapped edge raw=${rawA?.key() ?? "?"}<->${rawB?.key() ?? "?"} mapped=${a.key()}<->${b.key()} matrix=${this.formatMatrix(worldMatrix)}`
    );
  }

  private logMappingDiagnostics(
    scene: Scene,
    grid: RectGrid,
    rawEntries: readonly ParsedGridNavigationContract[],
    mappedContracts: readonly MappedGridNavigationContract[]
  ): void {
    if (!this.isMappingDebugEnabled()) {
      return;
    }
    const floorsBySource = this.collectFloorWorldBoundsBySource(scene);
    for (let index = 0; index < mappedContracts.length; index += 1) {
      const raw = rawEntries[index];
      const mapped = mappedContracts[index];
      for (const mappedStory of mapped.stories) {
        const rawStory = raw.contract.stories.find((story) => story.storyIndex === mappedStory.storyIndex);
        const rawWalkable = this.computeCellBounds(rawStory?.walkableCells ?? []);
        const mappedWalkable = this.computeCellBounds(mappedStory.walkableCells);
        const rawBlockedEdgeBounds = this.computeEdgeBounds((rawStory?.blockedEdges ?? []).map((edge) => [edge.a, edge.b]));
        const mappedBlockedEdgeBounds = this.computeEdgeBounds(mappedStory.blockedEdges.map((edge) => [edge.a, edge.b]));
        const rawStairPathBounds = this.computeVectorBounds((rawStory?.stairs ?? []).flatMap((stair) => [...(stair.traversalPathWorld ?? [])]));
        const mappedStairPathBounds = this.computeVectorBounds(mappedStory.stairs.flatMap((stair) => [...(stair.traversalPathWorld ?? [])]));
        const floorBounds = floorsBySource.get(mapped.mappingSourceNodeName)?.get(mappedStory.storyIndex) ?? null;
        const delta = this.computeBoundsDelta(mappedWalkable, floorBounds, grid);
        console.info(
          `[GridNavigationMapping] source=${mapped.mappingSourceNodeName} story=${mappedStory.storyIndex} rawWalkable=${this.formatBounds(rawWalkable)} mappedWalkable=${this.formatBounds(mappedWalkable)} rawBlockedEdges=${this.formatBounds(rawBlockedEdgeBounds)} mappedBlockedEdges=${this.formatBounds(mappedBlockedEdgeBounds)} rawStairPath=${this.formatVectorBounds(rawStairPathBounds)} mappedStairPath=${this.formatVectorBounds(mappedStairPathBounds)} floorBoundsWorld=${this.formatWorldBounds(floorBounds)} delta=${delta}`
        );
      }
    }
  }

  private collectFloorWorldBoundsBySource(scene: Scene): Map<string, Map<number, { minX: number; maxX: number; minZ: number; maxZ: number }>> {
    const result = new Map<string, Map<number, { minX: number; maxX: number; minZ: number; maxZ: number }>>();
    for (const mesh of scene.meshes) {
      if (mesh.isDisposed() || mesh.getTotalVertices() <= 0) {
        continue;
      }
      const metadata = this.resolveMetadata(mesh);
      if (this.normalizeString(metadata?.game_nav_kind) !== "floor") {
        continue;
      }
      const sourceName = this.resolveTopParent(mesh).name || "(unnamed)";
      const storyIndex = this.normalizeInteger(metadata?.game_nav_story_index) ?? 0;
      mesh.computeWorldMatrix(true);
      const bounds = mesh.getBoundingInfo().boundingBox;
      const storyMap = result.get(sourceName) ?? new Map<number, { minX: number; maxX: number; minZ: number; maxZ: number }>();
      const current = storyMap.get(storyIndex);
      const next = {
        minX: current ? Math.min(current.minX, bounds.minimumWorld.x) : bounds.minimumWorld.x,
        maxX: current ? Math.max(current.maxX, bounds.maximumWorld.x) : bounds.maximumWorld.x,
        minZ: current ? Math.min(current.minZ, bounds.minimumWorld.z) : bounds.minimumWorld.z,
        maxZ: current ? Math.max(current.maxZ, bounds.maximumWorld.z) : bounds.maximumWorld.z
      };
      storyMap.set(storyIndex, next);
      result.set(sourceName, storyMap);
    }
    return result;
  }

  private resolveTopParent(node: Node): Node {
    let current: Node = node;
    while (current.parent) {
      current = current.parent;
    }
    return current;
  }

  private computeBoundsDelta(
    mappedWalkable: { minX: number; maxX: number; minZ: number; maxZ: number } | null,
    floorBounds: { minX: number; maxX: number; minZ: number; maxZ: number } | null,
    grid: RectGrid
  ): string {
    if (!mappedWalkable || !floorBounds) {
      return "n/a";
    }
    const tile = grid.getTileSize();
    const minFloorCell = grid.worldToCell(new Vector3(floorBounds.minX + tile * 0.5, grid.getOrigin().y, floorBounds.minZ + tile * 0.5));
    const maxFloorCell = grid.worldToCell(new Vector3(floorBounds.maxX - tile * 0.5, grid.getOrigin().y, floorBounds.maxZ - tile * 0.5));
    return `x=[${mappedWalkable.minX - minFloorCell.x},${mappedWalkable.maxX - maxFloorCell.x}] z=[${mappedWalkable.minZ - minFloorCell.z},${mappedWalkable.maxZ - maxFloorCell.z}]`;
  }

  private formatWorldBounds(bounds: { minX: number; maxX: number; minZ: number; maxZ: number } | null): string {
    if (!bounds) {
      return "n/a";
    }
    return `x=[${bounds.minX.toFixed(2)},${bounds.maxX.toFixed(2)}] z=[${bounds.minZ.toFixed(2)},${bounds.maxZ.toFixed(2)}]`;
  }

  private computeVectorBounds(points: readonly Vector3[]): { minX: number; maxX: number; minY: number; maxY: number; minZ: number; maxZ: number } | null {
    if (points.length === 0) {
      return null;
    }
    let minX = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY;
    let minY = Number.POSITIVE_INFINITY;
    let maxY = Number.NEGATIVE_INFINITY;
    let minZ = Number.POSITIVE_INFINITY;
    let maxZ = Number.NEGATIVE_INFINITY;
    for (const point of points) {
      minX = Math.min(minX, point.x);
      maxX = Math.max(maxX, point.x);
      minY = Math.min(minY, point.y);
      maxY = Math.max(maxY, point.y);
      minZ = Math.min(minZ, point.z);
      maxZ = Math.max(maxZ, point.z);
    }
    return { minX, maxX, minY, maxY, minZ, maxZ };
  }

  private formatVectorBounds(bounds: { minX: number; maxX: number; minY: number; maxY: number; minZ: number; maxZ: number } | null): string {
    if (!bounds) {
      return "n/a";
    }
    return `x=[${bounds.minX.toFixed(2)},${bounds.maxX.toFixed(2)}] y=[${bounds.minY.toFixed(2)},${bounds.maxY.toFixed(2)}] z=[${bounds.minZ.toFixed(2)},${bounds.maxZ.toFixed(2)}]`;
  }

  private formatMatrix(matrix: Matrix): string {
    const values = matrix.asArray();
    return `[${values.map((value) => value.toFixed(3)).join(",")}]`;
  }

  private isMappingDebugEnabled(): boolean {
    const g = globalThis as { readonly __RECT_NAV_DEBUG__?: unknown; readonly location?: { readonly search?: string } };
    const raw = typeof g.__RECT_NAV_DEBUG__ === "string" ? g.__RECT_NAV_DEBUG__.toLowerCase() : "";
    if (raw === "1" || raw === "true") {
      return true;
    }
    const query = g.location?.search ?? "";
    return query.includes("rectNavDebug=1") || query.includes("rectNavDebug=true");
  }

  private parseContract(raw: RawContract): GridNavigationContract | null {
    if (raw.contract !== GRID_NAVIGATION_CONTRACT || raw.grid_type !== "rect" || raw.tile_size_m !== 1) {
      return null;
    }
    if (raw.coordinate_mapping !== "blender_xy_to_game_xz" || !Array.isArray(raw.stories)) {
      return null;
    }

    const stories = raw.stories
      .map((story) => this.parseStory(story as RawStory))
      .filter((story): story is GridNavigationStoryContract => story !== null);
    if (stories.length === 0) {
      return null;
    }

    const origin = this.parseOrigin(raw.origin);
    return {
      contract: GRID_NAVIGATION_CONTRACT,
      gridType: "rect",
      tileSizeM: 1,
      origin,
      coordinateMapping: "blender_xy_to_game_xz",
      stories
    };
  }

  private parseStory(raw: RawStory): GridNavigationStoryContract | null {
    const storyIndex = this.normalizeInteger(raw.story_index);
    if (storyIndex === null) {
      return null;
    }

    return {
      storyIndex,
      storyY: this.normalizeNumber(raw.story_y_m) ?? 0,
      walkableCells: this.parseCells(raw.walkable_cells),
      blockedCells: this.parseBlockedCells(raw.blocked_cells),
      blockedEdges: this.parseEdges(raw.blocked_edges),
      doorEdges: this.parseDoorEdges(raw.door_edges),
      stairs: this.parseStairs(raw.stairs)
    };
  }

  private parseCells(raw: unknown): GridCell[] {
    if (!Array.isArray(raw)) {
      return [];
    }
    return raw.map((item) => this.parseCellObject(item)).filter((cell): cell is GridCell => cell !== null);
  }

  private parseBlockedCells(raw: unknown): { readonly cell: GridCell; readonly reason?: string }[] {
    if (!Array.isArray(raw)) {
      return [];
    }
    return raw.flatMap((item) => {
      const record = item as Record<string, unknown>;
      const cell = this.parseCellObject(record);
      return cell ? [{ cell, reason: this.normalizeString(record.reason) ?? undefined }] : [];
    });
  }

  private parseEdges(raw: unknown): GridNavigationEdge[] {
    if (!Array.isArray(raw)) {
      return [];
    }
    return raw.flatMap((item) => {
      const record = item as Record<string, unknown>;
      const a = this.parseCellObject(record.a);
      const b = this.parseCellObject(record.b);
      return a && b ? [{ a, b, reason: this.normalizeString(record.reason) ?? undefined }] : [];
    });
  }

  private parseDoorEdges(raw: unknown): GridNavigationDoorEdge[] {
    if (!Array.isArray(raw)) {
      return [];
    }
    return raw.flatMap((item) => {
      const record = item as Record<string, unknown>;
      const a = this.parseCellObject(record.a);
      const b = this.parseCellObject(record.b);
      return a && b ? [{
        a,
        b,
        doorId: this.normalizeString(record.door_id) ?? undefined,
        isOpen: record.is_open !== false
      }] : [];
    });
  }

  private parseStairs(raw: unknown): GridNavigationStair[] {
    if (!Array.isArray(raw)) {
      return [];
    }
    return raw.flatMap((item) => {
      const record = item as Record<string, unknown>;
      const from = this.parseStoryCell(record.from);
      const to = this.parseStoryCell(record.to);
      const id = this.normalizeString(record.id) ?? "stair";
      const kind = this.normalizeStairKind(record.kind ?? record.stair_kind);
      const cost = this.normalizePositiveNumber(record.combat_cost ?? record.movement_cost ?? record.cost);
      const bidirectional = this.normalizeBoolean(record.bidirectional);
      const traversalPathWorld = this.parseStairPath(record.traversal_path_world ?? record.traversalPathWorld);
      return from && to ? [{ id, kind, cost, bidirectional, from, to, traversalPathWorld }] : [];
    });
  }

  private parseStairPath(raw: unknown): Vector3[] | undefined {
    if (!Array.isArray(raw)) {
      return undefined;
    }
    const points = raw.map((item) => this.parseWorldPointObject(item)).filter((point): point is Vector3 => point !== null);
    return points.length > 0 ? points : undefined;
  }

  private parseWorldPointObject(raw: unknown): Vector3 | null {
    const record = raw as Record<string, unknown>;
    const x = this.normalizeNumber(record?.x);
    const y = this.normalizeNumber(record?.y);
    const z = this.normalizeNumber(record?.z);
    return x === null || y === null || z === null ? null : new Vector3(x, y, z);
  }

  private normalizeStairKind(value: unknown): "internal" | "external" | undefined {
    const normalized = this.normalizeString(value)?.toLowerCase();
    return normalized === "internal" || normalized === "external" ? normalized : undefined;
  }

  private normalizePositiveNumber(value: unknown): number | undefined {
    const normalized = this.normalizeNumber(value);
    return normalized !== null && normalized > 0 ? normalized : undefined;
  }

  private normalizeBoolean(value: unknown): boolean | undefined {
    if (typeof value === "boolean") {
      return value;
    }
    if (typeof value === "number") {
      return value !== 0;
    }
    const normalized = this.normalizeString(value)?.toLowerCase();
    if (normalized === "true" || normalized === "1" || normalized === "yes" || normalized === "on") {
      return true;
    }
    if (normalized === "false" || normalized === "0" || normalized === "no" || normalized === "off") {
      return false;
    }
    return undefined;
  }

  private parseStoryCell(raw: unknown): { readonly storyIndex: number; readonly cell: GridCell } | null {
    const record = raw as Record<string, unknown>;
    const storyIndex = this.normalizeInteger(record?.story_index);
    const cell = this.parseCellObject(record?.cell);
    return storyIndex === null || !cell ? null : { storyIndex, cell };
  }

  private parseCellObject(raw: unknown): GridCell | null {
    const record = raw as Record<string, unknown>;
    const x = this.normalizeInteger(record?.x);
    const z = this.normalizeInteger(record?.z);
    return x === null || z === null ? null : new GridCell(x, z);
  }

  private parseOrigin(raw: unknown): { readonly x: number; readonly z: number } {
    const record = raw as Record<string, unknown>;
    return {
      x: this.normalizeNumber(record?.x) ?? 0,
      z: this.normalizeNumber(record?.z) ?? 0
    };
  }

  private validateContract(contract: GridNavigationContract, sourceName: string): void {
    for (const story of contract.stories) {
      for (const edge of story.blockedEdges) {
        this.validateNeighborEdge(edge.a, edge.b, sourceName, "blocked_edges");
      }
      for (const edge of story.doorEdges) {
        this.validateNeighborEdge(edge.a, edge.b, sourceName, "door_edges");
      }
    }
  }

  private validateNeighborEdge(a: GridCell, b: GridCell, sourceName: string, field: string): void {
    if (a.distance(b) !== 1) {
      console.warn(`[GridNavigationContract] ${sourceName} ${field} has non-neighbor edge ${a.key()} <-> ${b.key()}`);
    }
  }

  private logContractStats(contract: GridNavigationContract, sourceNodeName: string): void {
    const stats = contract.stories.reduce((total, story) => ({
      walkable: total.walkable + story.walkableCells.length,
      blockedEdges: total.blockedEdges + story.blockedEdges.length,
      doorEdges: total.doorEdges + story.doorEdges.length,
      stairs: total.stairs + story.stairs.length
    }), { walkable: 0, blockedEdges: 0, doorEdges: 0, stairs: 0 });
    console.info(
      `[GridNavigation] Loaded rect contract v3 from node='${sourceNodeName || "(unnamed)"}' stories=${contract.stories.length} walkable=${stats.walkable} blocked_edges=${stats.blockedEdges} door_edges=${stats.doorEdges} stairs=${stats.stairs} origin=(${contract.origin.x.toFixed(2)},${contract.origin.z.toFixed(2)}) tile=${contract.tileSizeM.toFixed(2)}`
    );
    for (const story of contract.stories) {
      const walkableBounds = this.computeCellBounds(story.walkableCells);
      const blockedBounds = this.computeEdgeBounds(story.blockedEdges.map((edge) => [edge.a, edge.b]));
      const doorBounds = this.computeEdgeBounds(story.doorEdges.map((edge) => [edge.a, edge.b]));
      console.info(
        `[GridNavigation] story=${story.storyIndex} y=${story.storyY.toFixed(2)} walkable=${story.walkableCells.length} bounds=${this.formatBounds(walkableBounds)} blocked_edges=${story.blockedEdges.length} blocked_bounds=${this.formatBounds(blockedBounds)} door_edges=${story.doorEdges.length} door_bounds=${this.formatBounds(doorBounds)}`
      );
    }
  }

  private computeCellBounds(cells: readonly GridCell[]): { minX: number; maxX: number; minZ: number; maxZ: number } | null {
    if (cells.length === 0) {
      return null;
    }
    let minX = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY;
    let minZ = Number.POSITIVE_INFINITY;
    let maxZ = Number.NEGATIVE_INFINITY;
    for (const cell of cells) {
      minX = Math.min(minX, cell.x);
      maxX = Math.max(maxX, cell.x);
      minZ = Math.min(minZ, cell.z);
      maxZ = Math.max(maxZ, cell.z);
    }
    return { minX, maxX, minZ, maxZ };
  }

  private computeEdgeBounds(edges: readonly (readonly [GridCell, GridCell])[]): { minX: number; maxX: number; minZ: number; maxZ: number } | null {
    if (edges.length === 0) {
      return null;
    }
    const cells: GridCell[] = [];
    for (const [a, b] of edges) {
      cells.push(a, b);
    }
    return this.computeCellBounds(cells);
  }

  private formatBounds(bounds: { minX: number; maxX: number; minZ: number; maxZ: number } | null): string {
    if (!bounds) {
      return "n/a";
    }
    return `x=[${bounds.minX},${bounds.maxX}] z=[${bounds.minZ},${bounds.maxZ}]`;
  }

  private collectSceneNodes(scene: Scene): Node[] {
    const nodes: Node[] = [];
    const seen = new Set<Node>();
    const add = (node: Node): void => {
      if (seen.has(node)) {
        return;
      }
      seen.add(node);
      nodes.push(node);
    };
    for (const root of scene.rootNodes) {
      this.visit(root, add);
    }
    for (const transform of scene.transformNodes) {
      this.visit(transform, add);
    }
    for (const mesh of scene.meshes) {
      this.visit(mesh, add);
    }
    return nodes;
  }

  private visit(node: Node, add: (node: Node) => void): void {
    add(node);
    for (const child of node.getChildren()) {
      this.visit(child, add);
    }
  }

  private resolveMetadata(node: Node): Record<string, unknown> | null {
    const candidates = this.resolveMetadataCandidates(node);
    return candidates.find((candidate) => this.hasNavigationMetadataKey(candidate)) ?? candidates[0] ?? null;
  }

  private resolveMetadataCandidates(node: Node): Record<string, unknown>[] {
    const metadata = node.metadata;
    if (!metadata || typeof metadata !== "object") {
      return [];
    }
    const candidates: Record<string, unknown>[] = [];
    const record = metadata as Record<string, unknown>;
    candidates.push(record);
    const gltf = record.gltf;
    if (gltf && typeof gltf === "object") {
      const extras = (gltf as Record<string, unknown>).extras;
      if (extras && typeof extras === "object") {
        candidates.push(extras as Record<string, unknown>);
      }
    }
    const extras = record.extras;
    if (extras && typeof extras === "object") {
      candidates.push(extras as Record<string, unknown>);
    }
    return candidates;
  }

  private hasNavigationMetadataKey(metadata: Record<string, unknown>): boolean {
    return "game_navigation_json" in metadata ||
      "game_nav_kind" in metadata ||
      "building_part" in metadata ||
      "part" in metadata;
  }

  private normalizeString(value: unknown): string | null {
    return typeof value === "string" && value.length > 0 ? value : null;
  }

  private normalizeInteger(value: unknown): number | null {
    return typeof value === "number" && Number.isInteger(value) ? value : null;
  }

  private normalizeNumber(value: unknown): number | null {
    return typeof value === "number" && Number.isFinite(value) ? value : null;
  }
}
