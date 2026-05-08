import { GridCell } from "../grid/GridCell";
import {
  makeNavigationNodeId,
  type NavigationEdge,
  type NavigationGraph,
  type NavigationNode
} from "./NavigationGraph";

export class MultiFloorPathfinder {
  private readonly graph: NavigationGraph;
  private readonly debugEnabled: boolean;

  public constructor(graph: NavigationGraph, debugEnabled = false) {
    this.graph = graph;
    this.debugEnabled = debugEnabled;
  }

  public findPathEdges(input: {
    fromCell: GridCell;
    fromStoryIndex: number;
    toCell: GridCell;
    toStoryIndex: number;
    blocked?: (node: NavigationNode) => boolean;
    occupied?: (node: NavigationNode) => boolean;
  }): NavigationEdge[] | null {
    const start = this.graph.getNodeForCell(input.fromStoryIndex, input.fromCell);
    const goal = this.graph.getNodeForCell(input.toStoryIndex, input.toCell);
    if (!start || !goal) {
      return null;
    }

    const blocked = (node: NavigationNode): boolean => {
      if (node.id === start.id) {
        return false;
      }

      return Boolean(input.blocked?.(node) || input.occupied?.(node));
    };

    const pathEdges = this.findEdgePath(start, goal, blocked);
    if (!pathEdges) {
      return null;
    }

    if (this.debugEnabled && start.storyIndex !== goal.storyIndex) {
      this.logPath(start, goal, pathEdges);
    }

    return pathEdges;
  }

  public findPath(input: {
    fromCell: GridCell;
    fromStoryIndex: number;
    toCell: GridCell;
    toStoryIndex: number;
    blocked?: (node: NavigationNode) => boolean;
    occupied?: (node: NavigationNode) => boolean;
  }): NavigationEdge[] | null {
    return this.findPathEdges(input);
  }

  private findEdgePath(
    start: NavigationNode,
    goal: NavigationNode,
    blocked: (node: NavigationNode) => boolean
  ): NavigationEdge[] | null {
    const openIds = new Set<string>([start.id]);
    const gScore = new Map<string, number>([[start.id, 0]]);
    const fScore = new Map<string, number>([[start.id, this.heuristic(start, goal)]]);
    const cameFrom = new Map<string, NavigationEdge>();

    while (openIds.size > 0) {
      const currentId = this.lowestScoreNodeId(openIds, fScore);
      if (!currentId) {
        break;
      }

      if (currentId === goal.id) {
        return this.reconstructEdges(start.id, goal.id, cameFrom);
      }

      openIds.delete(currentId);
      const current = this.graph.getNode(currentId);
      if (!current) {
        continue;
      }

      for (const edge of this.graph.getNeighbors(current, blocked)) {
        const neighbor = this.graph.getNode(edge.toNodeId);
        if (!neighbor) {
          continue;
        }

        const tentativeGScore = (gScore.get(current.id) ?? Number.POSITIVE_INFINITY) + edge.cost;
        if (tentativeGScore >= (gScore.get(neighbor.id) ?? Number.POSITIVE_INFINITY)) {
          continue;
        }

        cameFrom.set(neighbor.id, edge);
        gScore.set(neighbor.id, tentativeGScore);
        fScore.set(neighbor.id, tentativeGScore + this.heuristic(neighbor, goal));
        openIds.add(neighbor.id);
      }
    }

    return null;
  }

  private reconstructEdges(startNodeId: string, goalNodeId: string, cameFrom: ReadonlyMap<string, NavigationEdge>): NavigationEdge[] {
    const edges: NavigationEdge[] = [];
    let currentNodeId = goalNodeId;

    while (currentNodeId !== startNodeId) {
      const edge = cameFrom.get(currentNodeId);
      if (!edge) {
        return [];
      }

      edges.push(edge);
      currentNodeId = edge.fromNodeId;
    }

    edges.reverse();
    return edges;
  }

  private lowestScoreNodeId(openIds: ReadonlySet<string>, fScore: ReadonlyMap<string, number>): string | null {
    let bestId: string | null = null;
    let bestScore = Number.POSITIVE_INFINITY;

    for (const nodeId of openIds) {
      const score = fScore.get(nodeId) ?? Number.POSITIVE_INFINITY;
      if (score < bestScore) {
        bestId = nodeId;
        bestScore = score;
      }
    }

    return bestId;
  }

  private heuristic(node: NavigationNode, goal: NavigationNode): number {
    void node;
    void goal;
    return 0;
  }

  private logPath(start: NavigationNode, goal: NavigationNode, edges: readonly NavigationEdge[]): void {
    console.debug(
      [
        "MultiFloorPathfinder:",
        `from story ${start.storyIndex} cell ${start.cell.x}:${start.cell.z}`,
        `to story ${goal.storyIndex} cell ${goal.cell.x}:${goal.cell.z}`,
        "path:",
        ...edges.map((edge) => {
          const targetNode = this.graph.getNode(edge.toNodeId);
          if (!targetNode) {
            return `missing ${edge.id}`;
          }

          if (edge.kind === "walk") {
            return `walk ${targetNode.storyIndex}:${targetNode.cell.x}:${targetNode.cell.z}`;
          }

          return `${edge.kind} ${edge.stairId ?? "unknown"} ${edge.fromNodeId} -> ${edge.toNodeId} checkpoints=${edge.traversalPath?.length ?? 0}`;
        })
      ].join("\n")
    );
  }
}

export function makeMovementTargetKey(cell: GridCell, storyIndex: number): string {
  return makeNavigationNodeId(storyIndex, cell);
}
