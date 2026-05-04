import { Vector3 } from "@babylonjs/core";
import { HexCell } from "../hex/HexCell";
import { HexGrid } from "../hex/HexGrid";

export interface NavigationNode {
  readonly id: string;
  readonly cell: HexCell;
  readonly storyIndex: number;
  readonly worldPosition: Vector3;
}

export type NavigationEdgeKind = "walk" | "stair" | "external_stair";

export interface NavigationEdge {
  readonly id: string;
  readonly fromNodeId: string;
  readonly toNodeId: string;
  readonly kind: NavigationEdgeKind;
  readonly cost: number;
  readonly traversalPath?: Vector3[];
  readonly stairId?: string;
}

export type MovementSegment =
  | {
      readonly kind: "walk";
      readonly cell: HexCell;
      readonly storyIndex: number;
      readonly worldPosition: Vector3;
      readonly cost: number;
    }
  | {
      readonly kind: "stair";
      readonly stairId: string;
      readonly fromStoryIndex: number;
      readonly toStoryIndex: number;
      readonly toCell: HexCell;
      readonly traversalPath: Vector3[];
      readonly cost: number;
    };

export interface StairNavigationConnector {
  readonly stairId: string;
  readonly fromStoryIndex: number;
  readonly toStoryIndex: number;
  readonly fromCell: HexCell;
  readonly toCell: HexCell;
  readonly kind: "internal" | "external";
  readonly cost: number;
  readonly bidirectional: boolean;
  readonly traversalPathWorld: Vector3[];
}

export function makeNavigationNodeId(storyIndex: number, cell: HexCell): string {
  return `node:${storyIndex}:${cell.q}:${cell.r}`;
}

export class NavigationGraph {
  private readonly grid: HexGrid;
  private readonly storyIndices: Set<number>;
  private readonly storyYByStory: Map<number, number>;
  private readonly stairEdgesByNodeId: Map<string, NavigationEdge[]>;
  private readonly isWalkableCell: (cell: HexCell, storyIndex: number) => boolean;
  private readonly isEdgeBlocked: (fromCell: HexCell, toCell: HexCell, storyIndex: number) => boolean;
  private readonly getMovementCost: (cell: HexCell, storyIndex: number) => number;

  public constructor(
    grid: HexGrid,
    stairConnectors: readonly StairNavigationConnector[] = [],
    storyYByStory: ReadonlyMap<number, number> = new Map(),
    isWalkableCell?: (cell: HexCell, storyIndex: number) => boolean,
    isEdgeBlocked?: (fromCell: HexCell, toCell: HexCell, storyIndex: number) => boolean,
    getMovementCost?: (cell: HexCell, storyIndex: number) => number
  ) {
    this.grid = grid;
    this.storyIndices = new Set<number>([0]);
    this.storyYByStory = new Map(storyYByStory);
    this.stairEdgesByNodeId = new Map();
    this.isWalkableCell = isWalkableCell ?? ((cell) => this.grid.contains(cell));
    this.isEdgeBlocked = isEdgeBlocked ?? (() => false);
    this.getMovementCost = getMovementCost ?? (() => 1);

    for (const connector of stairConnectors) {
      this.storyIndices.add(connector.fromStoryIndex);
      this.storyIndices.add(connector.toStoryIndex);
      this.registerStairEdge(connector, false);
      if (connector.bidirectional) {
        this.registerStairEdge(connector, true);
      }
    }
  }

  public getNode(nodeId: string): NavigationNode | null {
    const parsed = parseNavigationNodeId(nodeId);
    if (!parsed) {
      return null;
    }

    if (!this.isWalkableCell(parsed.cell, parsed.storyIndex)) {
      return null;
    }

    return this.createNode(parsed.storyIndex, parsed.cell);
  }

  public getNodeForCell(storyIndex: number, cell: HexCell): NavigationNode | null {
    if (!this.grid.contains(cell)) {
      return null;
    }

    if (!this.isWalkableCell(cell, storyIndex)) {
      return null;
    }

    this.storyIndices.add(storyIndex);
    return this.createNode(storyIndex, cell);
  }

  public getNeighbors(node: NavigationNode, blocked: (node: NavigationNode) => boolean): NavigationEdge[] {
    const edges: NavigationEdge[] = [];

    for (const neighborCell of this.grid.getNeighbors(node.cell)) {
      if (!this.grid.contains(neighborCell) || !this.isWalkableCell(neighborCell, node.storyIndex)) {
        continue;
      }

      const neighborNode = this.createNode(node.storyIndex, neighborCell);
      if (blocked(neighborNode)) {
        continue;
      }

      if (this.isEdgeBlocked(node.cell, neighborCell, node.storyIndex)) {
        continue;
      }

      const movementCost = this.getMovementCost(neighborCell, node.storyIndex);
      if (!Number.isFinite(movementCost) || movementCost <= 0) {
        continue;
      }

      edges.push({
        id: `walk:${node.id}->${neighborNode.id}`,
        fromNodeId: node.id,
        toNodeId: neighborNode.id,
        kind: "walk",
        cost: movementCost
      });
    }

    for (const stairEdge of this.stairEdgesByNodeId.get(node.id) ?? []) {
      const targetNode = this.getNode(stairEdge.toNodeId);
      if (!targetNode || blocked(targetNode)) {
        continue;
      }

      edges.push(stairEdge);
    }

    return edges;
  }

  public getStoryY(storyIndex: number): number {
    return this.storyYByStory.get(storyIndex) ?? this.grid.getOrigin().y;
  }

  private registerStairEdge(connector: StairNavigationConnector, reverse: boolean): void {
    const fromStoryIndex = reverse ? connector.toStoryIndex : connector.fromStoryIndex;
    const toStoryIndex = reverse ? connector.fromStoryIndex : connector.toStoryIndex;
    const fromCell = reverse ? connector.toCell : connector.fromCell;
    const toCell = reverse ? connector.fromCell : connector.toCell;
    const fromNodeId = makeNavigationNodeId(fromStoryIndex, fromCell);
    const toNodeId = makeNavigationNodeId(toStoryIndex, toCell);
    const traversalPath = reverse
      ? [...connector.traversalPathWorld].reverse().map((point) => point.clone())
      : connector.traversalPathWorld.map((point) => point.clone());
    const edge: NavigationEdge = {
      id: `${connector.kind === "external" ? "external_stair" : "stair"}:${connector.stairId}:${fromStoryIndex}->${toStoryIndex}`,
      fromNodeId,
      toNodeId,
      kind: connector.kind === "external" ? "external_stair" : "stair",
      cost: connector.cost,
      traversalPath,
      stairId: connector.stairId
    };

    const edges = this.stairEdgesByNodeId.get(fromNodeId) ?? [];
    edges.push(edge);
    this.stairEdgesByNodeId.set(fromNodeId, edges);
  }

  private createNode(storyIndex: number, cell: HexCell): NavigationNode {
    return {
      id: makeNavigationNodeId(storyIndex, cell),
      cell,
      storyIndex,
      worldPosition: this.grid.cellToWorld(cell, this.getStoryY(storyIndex))
    };
  }
}

function parseNavigationNodeId(nodeId: string): { storyIndex: number; cell: HexCell } | null {
  const match = /^node:(-?\d+):(-?\d+):(-?\d+)$/.exec(nodeId);
  if (!match) {
    return null;
  }

  return {
    storyIndex: Number.parseInt(match[1], 10),
    cell: new HexCell(Number.parseInt(match[2], 10), Number.parseInt(match[3], 10))
  };
}
