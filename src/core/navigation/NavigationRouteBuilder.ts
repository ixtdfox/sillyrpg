import { Vector3 } from "@babylonjs/core";
import {
  type MovementRoutePoint,
  type MovementRouteSegment,
  type NavigationEdge,
  type NavigationGraph
} from "./NavigationGraph";
import type { SurfaceHeightResolver } from "../world/surface/SurfaceHeightResolver";

export class NavigationRouteBuilder {
  private readonly graph: NavigationGraph;
  private readonly surfaceHeightResolver: Pick<SurfaceHeightResolver, "resolveGroundedPosition">;

  public constructor(
    graph: NavigationGraph,
    surfaceHeightResolver: Pick<SurfaceHeightResolver, "resolveGroundedPosition">
  ) {
    this.graph = graph;
    this.surfaceHeightResolver = surfaceHeightResolver;
  }

  public build(edges: readonly NavigationEdge[]): MovementRouteSegment[] {
    const segments: MovementRouteSegment[] = [];

    for (const edge of edges) {
      const sourceNode = this.graph.getNode(edge.fromNodeId);
      const targetNode = this.graph.getNode(edge.toNodeId);
      if (!sourceNode || !targetNode) {
        continue;
      }

      if (edge.kind === "walk") {
        const pointPosition = this.surfaceHeightResolver.resolveGroundedPosition({
          position: targetNode.worldPosition,
          cell: targetNode.cell,
          storyIndex: targetNode.storyIndex,
          fallbackY: targetNode.worldPosition.y
        });
        segments.push({
          kind: edge.kind,
          fromCell: sourceNode.cell,
          fromStoryIndex: sourceNode.storyIndex,
          toCell: targetNode.cell,
          toStoryIndex: targetNode.storyIndex,
          points: [{
            position: pointPosition,
            cell: targetNode.cell,
            storyIndex: targetNode.storyIndex
          }],
          cost: edge.cost
        });
        continue;
      }

      const points = this.buildTraversalPoints(sourceNode.id, targetNode.id, edge);
      segments.push({
        kind: edge.kind,
        fromCell: sourceNode.cell,
        fromStoryIndex: sourceNode.storyIndex,
        toCell: targetNode.cell,
        toStoryIndex: targetNode.storyIndex,
        points,
        cost: edge.cost,
        metadata: edge.stairId ? { stairId: edge.stairId } : undefined
      });
    }

    return segments;
  }

  private buildTraversalPoints(fromNodeId: string, toNodeId: string, edge: NavigationEdge): readonly MovementRoutePoint[] {
    const sourceNode = this.graph.getNode(fromNodeId);
    const targetNode = this.graph.getNode(toNodeId);
    if (!sourceNode || !targetNode) {
      return [];
    }

    const points: MovementRoutePoint[] = [];
    const sourcePosition = this.surfaceHeightResolver.resolveGroundedPosition({
      position: sourceNode.worldPosition,
      cell: sourceNode.cell,
      storyIndex: sourceNode.storyIndex,
      fallbackY: sourceNode.worldPosition.y
    });
    const targetPosition = this.surfaceHeightResolver.resolveGroundedPosition({
      position: targetNode.worldPosition,
      cell: targetNode.cell,
      storyIndex: targetNode.storyIndex,
      fallbackY: targetNode.worldPosition.y
    });

    appendPointIfFarEnough(points, {
      position: sourcePosition,
      cell: sourceNode.cell,
      storyIndex: sourceNode.storyIndex
    });

    for (const position of edge.traversalPath ?? []) {
      appendPointIfFarEnough(points, {
        position: position.clone(),
        cell: this.graph.getGrid().worldToCell(position),
        storyIndex: sourceNode.storyIndex
      });
    }

    appendPointIfFarEnough(points, {
      position: targetPosition,
      cell: targetNode.cell,
      storyIndex: targetNode.storyIndex
    });

    if (points.length > 0) {
      points[0] = {
        position: sourcePosition,
        cell: sourceNode.cell,
        storyIndex: sourceNode.storyIndex
      };
      points[points.length - 1] = {
        position: targetPosition,
        cell: targetNode.cell,
        storyIndex: targetNode.storyIndex
      };
    }

    return points;
  }
}

export function appendPointIfFarEnough(
  points: MovementRoutePoint[],
  point: MovementRoutePoint,
  epsilon = 0.05
): void {
  const previous = points[points.length - 1];
  if (!previous || Vector3.Distance(previous.position, point.position) > epsilon) {
    points.push({
      position: point.position.clone(),
      cell: point.cell,
      storyIndex: point.storyIndex
    });
  }
}
