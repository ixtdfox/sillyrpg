import type { Node, Scene } from "@babylonjs/core";
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
  readonly from: { readonly storyIndex: number; readonly cell: GridCell };
  readonly to: { readonly storyIndex: number; readonly cell: GridCell };
}

export interface GridNavigationContract {
  readonly contract: typeof GRID_NAVIGATION_CONTRACT;
  readonly gridType: "rect";
  readonly tileSizeM: 1;
  readonly origin: { readonly x: number; readonly z: number };
  readonly coordinateMapping: "blender_xy_to_game_xz";
  readonly stories: readonly GridNavigationStoryContract[];
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

export function parseGridNavigationContracts(scene: Scene): GridNavigationContract[] {
  const contracts: GridNavigationContract[] = [];
  for (const node of collectSceneNodes(scene)) {
    const metadata = resolveMetadata(node);
    const rawJson = normalizeString(metadata?.game_navigation_json);
    if (!rawJson) {
      continue;
    }
    try {
      const raw = JSON.parse(rawJson) as RawContract;
      const contract = parseContract(raw);
      if (contract) {
        validateContract(contract, node.name);
        logContractStats(contract);
        contracts.push(contract);
      }
    } catch (error) {
      console.warn(`[GridNavigationContract] invalid game_navigation_json on '${node.name}': ${error}`);
    }
  }
  return contracts;
}

function parseContract(raw: RawContract): GridNavigationContract | null {
  if (raw.contract !== GRID_NAVIGATION_CONTRACT || raw.grid_type !== "rect" || raw.tile_size_m !== 1) {
    return null;
  }
  if (raw.coordinate_mapping !== "blender_xy_to_game_xz" || !Array.isArray(raw.stories)) {
    return null;
  }

  const stories = raw.stories
    .map((story) => parseStory(story as RawStory))
    .filter((story): story is GridNavigationStoryContract => story !== null);
  if (stories.length === 0) {
    return null;
  }

  const origin = parseOrigin(raw.origin);
  return {
    contract: GRID_NAVIGATION_CONTRACT,
    gridType: "rect",
    tileSizeM: 1,
    origin,
    coordinateMapping: "blender_xy_to_game_xz",
    stories
  };
}

function parseStory(raw: RawStory): GridNavigationStoryContract | null {
  const storyIndex = normalizeInteger(raw.story_index);
  if (storyIndex === null) {
    return null;
  }

  return {
    storyIndex,
    storyY: normalizeNumber(raw.story_y_m) ?? 0,
    walkableCells: parseCells(raw.walkable_cells),
    blockedCells: parseBlockedCells(raw.blocked_cells),
    blockedEdges: parseEdges(raw.blocked_edges),
    doorEdges: parseDoorEdges(raw.door_edges),
    stairs: parseStairs(raw.stairs)
  };
}

function parseCells(raw: unknown): GridCell[] {
  if (!Array.isArray(raw)) {
    return [];
  }
  return raw.map(parseCellObject).filter((cell): cell is GridCell => cell !== null);
}

function parseBlockedCells(raw: unknown): { readonly cell: GridCell; readonly reason?: string }[] {
  if (!Array.isArray(raw)) {
    return [];
  }
  return raw.flatMap((item) => {
    const record = item as Record<string, unknown>;
    const cell = parseCellObject(record);
    return cell ? [{ cell, reason: normalizeString(record.reason) ?? undefined }] : [];
  });
}

function parseEdges(raw: unknown): GridNavigationEdge[] {
  if (!Array.isArray(raw)) {
    return [];
  }
  return raw.flatMap((item) => {
    const record = item as Record<string, unknown>;
    const a = parseCellObject(record.a);
    const b = parseCellObject(record.b);
    return a && b ? [{ a, b, reason: normalizeString(record.reason) ?? undefined }] : [];
  });
}

function parseDoorEdges(raw: unknown): GridNavigationDoorEdge[] {
  if (!Array.isArray(raw)) {
    return [];
  }
  return raw.flatMap((item) => {
    const record = item as Record<string, unknown>;
    const a = parseCellObject(record.a);
    const b = parseCellObject(record.b);
    return a && b ? [{
      a,
      b,
      doorId: normalizeString(record.door_id) ?? undefined,
      isOpen: record.is_open !== false
    }] : [];
  });
}

function parseStairs(raw: unknown): GridNavigationStair[] {
  if (!Array.isArray(raw)) {
    return [];
  }
  return raw.flatMap((item) => {
    const record = item as Record<string, unknown>;
    const from = parseStoryCell(record.from);
    const to = parseStoryCell(record.to);
    const id = normalizeString(record.id) ?? "stair";
    return from && to ? [{ id, from, to }] : [];
  });
}

function parseStoryCell(raw: unknown): { readonly storyIndex: number; readonly cell: GridCell } | null {
  const record = raw as Record<string, unknown>;
  const storyIndex = normalizeInteger(record?.story_index);
  const cell = parseCellObject(record?.cell);
  return storyIndex === null || !cell ? null : { storyIndex, cell };
}

function parseCellObject(raw: unknown): GridCell | null {
  const record = raw as Record<string, unknown>;
  const x = normalizeInteger(record?.x);
  const z = normalizeInteger(record?.z);
  return x === null || z === null ? null : new GridCell(x, z);
}

function parseOrigin(raw: unknown): { readonly x: number; readonly z: number } {
  const record = raw as Record<string, unknown>;
  return {
    x: normalizeNumber(record?.x) ?? 0,
    z: normalizeNumber(record?.z) ?? 0
  };
}

function validateContract(contract: GridNavigationContract, sourceName: string): void {
  for (const story of contract.stories) {
    for (const edge of story.blockedEdges) {
      validateNeighborEdge(edge.a, edge.b, sourceName, "blocked_edges");
    }
    for (const edge of story.doorEdges) {
      validateNeighborEdge(edge.a, edge.b, sourceName, "door_edges");
    }
  }
}

function validateNeighborEdge(a: GridCell, b: GridCell, sourceName: string, field: string): void {
  if (a.distance(b) !== 1) {
    console.warn(`[GridNavigationContract] ${sourceName} ${field} has non-neighbor edge ${a.key()} <-> ${b.key()}`);
  }
}

function logContractStats(contract: GridNavigationContract): void {
  const stats = contract.stories.reduce((total, story) => ({
    walkable: total.walkable + story.walkableCells.length,
    blockedEdges: total.blockedEdges + story.blockedEdges.length,
    doorEdges: total.doorEdges + story.doorEdges.length,
    stairs: total.stairs + story.stairs.length
  }), { walkable: 0, blockedEdges: 0, doorEdges: 0, stairs: 0 });
  console.info(
    `[GridNavigation] Loaded rect contract v3: stories=${contract.stories.length} walkable=${stats.walkable} blocked_edges=${stats.blockedEdges} door_edges=${stats.doorEdges} stairs=${stats.stairs}`
  );
}

function collectSceneNodes(scene: Scene): Node[] {
  const nodes: Node[] = [];
  for (const root of scene.rootNodes) {
    visit(root, nodes);
  }
  return nodes;
}

function visit(node: Node, nodes: Node[]): void {
  nodes.push(node);
  for (const child of node.getChildren()) {
    visit(child, nodes);
  }
}

function resolveMetadata(node: Node): Record<string, unknown> | null {
  const metadata = node.metadata;
  if (!metadata || typeof metadata !== "object") {
    return null;
  }
  const record = metadata as Record<string, unknown>;
  const gltf = record.gltf;
  if (gltf && typeof gltf === "object") {
    const extras = (gltf as Record<string, unknown>).extras;
    if (extras && typeof extras === "object") {
      return extras as Record<string, unknown>;
    }
  }
  return record;
}

function normalizeString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function normalizeInteger(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) ? value : null;
}

function normalizeNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}
