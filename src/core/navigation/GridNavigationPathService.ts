import { GridCell } from "../grid/GridCell";
import type { RectGrid } from "../grid/RectGrid";
import type { RectGridRuntime } from "../grid/RectGridRuntime";
import { MovementTargetKeyFactory, MultiFloorPathfinder } from "./MultiFloorPathfinder";
import { NavigationRouteBuilder } from "./NavigationRouteBuilder";
import {
  NavigationGraph,
  type MovementSegment,
  type NavigationNode,
  type StairNavigationConnector
} from "./NavigationGraph";
import type { SurfaceHeightResolver } from "../world/surface/SurfaceHeightResolver";

export interface GridNavigationPathEnvironment {
  readonly grid: RectGrid;
  readonly stairConnectors: readonly StairNavigationConnector[];
  readonly storyYByStory: ReadonlyMap<number, number>;
  readonly isWalkableCell: (cell: GridCell, storyIndex: number) => boolean;
  readonly isNavigationEdgeBlocked: (fromCell: GridCell, toCell: GridCell, storyIndex: number) => boolean;
  readonly getMovementCost: (cell: GridCell, storyIndex: number) => number;
  readonly surfaceHeightResolver: Pick<SurfaceHeightResolver, "resolveGroundedPosition">;
  readonly debugEnabled?: boolean;
}

export interface GridNavigationPathRequest {
  readonly fromCell: GridCell;
  readonly fromStoryIndex: number;
  readonly toCell: GridCell;
  readonly toStoryIndex: number;
  readonly activeEntityId?: string;
  readonly movementPoints?: number;
  readonly occupied?: (node: NavigationNode) => boolean;
}

export interface ReachableNavigationCell {
  readonly cell: GridCell;
  readonly storyIndex: number;
  readonly cost: number;
}

export interface ReachableNavigationCellsResult {
  readonly reachableCells: readonly ReachableNavigationCell[];
  readonly costByNodeKey: ReadonlyMap<string, number>;
  readonly consideredStairConnector: boolean;
}

/**
 * Reader для глобального rect navigation debug flag.
 *
 * Debug flag может прийти из тестового globalThis или query string браузера.
 * Класс делает это явной dependency вместо свободной функции.
 */
export class RectNavigationDebugFlag {
  public isEnabled(): boolean {
    const g = globalThis as { readonly __RECT_NAV_DEBUG__?: unknown; readonly location?: { readonly search?: string } };
    const raw = typeof g.__RECT_NAV_DEBUG__ === "string" ? g.__RECT_NAV_DEBUG__.toLowerCase() : "";
    if (raw === "1" || raw === "true") {
      return true;
    }
    const query = g.location?.search ?? "";
    return query.includes("rectNavDebug=1") || query.includes("rectNavDebug=true");
  }
}

/**
 * Formatter для debug-строк path segments.
 *
 * Вынесен в объект, чтобы diagnostics остались зависимостью сервиса, а не
 * процедурной helper-функцией в конце модуля.
 */
export class NavigationSegmentDebugFormatter {
  public format(segments: readonly MovementSegment[]): string {
    return segments.map((segment) => {
      return `${segment.kind} ${segment.fromStoryIndex}:${segment.fromCell.x}:${segment.fromCell.z}->${segment.toStoryIndex}:${segment.toCell.x}:${segment.toCell.z} points=${segment.points.length} stair=${segment.metadata?.stairId ?? "n/a"} cost=${segment.cost}`;
    }).join(" | ");
  }
}

/**
 * Shared rectangular-grid path service for runtime and combat movement.
 *
 * Сервис является фасадом над graph, pathfinder и route builder: runtime code
 * не работает напрямую с алгоритмом поиска и получает готовые movement segments.
 */
export class GridNavigationPathService {
  private readonly environment: GridNavigationPathEnvironment;
  private readonly graph: NavigationGraph;
  private readonly pathfinder: MultiFloorPathfinder;
  private readonly routeBuilder: NavigationRouteBuilder;
  private readonly targetKeyFactory: MovementTargetKeyFactory;
  private readonly debugFlag: RectNavigationDebugFlag;
  private readonly segmentDebugFormatter: NavigationSegmentDebugFormatter;

  public constructor(
    environment: GridNavigationPathEnvironment,
    targetKeyFactory: MovementTargetKeyFactory = new MovementTargetKeyFactory(),
    debugFlag: RectNavigationDebugFlag = new RectNavigationDebugFlag(),
    segmentDebugFormatter: NavigationSegmentDebugFormatter = new NavigationSegmentDebugFormatter()
  ) {
    this.environment = environment;
    this.graph = new NavigationGraph(
      environment.grid,
      environment.stairConnectors,
      environment.storyYByStory,
      environment.isWalkableCell,
      environment.isNavigationEdgeBlocked,
      environment.getMovementCost
    );
    this.pathfinder = new MultiFloorPathfinder(this.graph, environment.debugEnabled === true);
    this.routeBuilder = new NavigationRouteBuilder(this.graph, environment.surfaceHeightResolver);
    this.targetKeyFactory = targetKeyFactory;
    this.debugFlag = debugFlag;
    this.segmentDebugFormatter = segmentDebugFormatter;
  }

  public static fromGridRuntime(gridRuntime: RectGridRuntime): GridNavigationPathService {
    const registry = gridRuntime.getBuildingNavigationRegistry();
    return new GridNavigationPathService({
      grid: gridRuntime.getGrid(),
      stairConnectors: registry.getStairConnectors(),
      storyYByStory: gridRuntime.getMergedStoryYByStory(),
      isWalkableCell: (cell, storyIndex) => gridRuntime.isWalkableCell(cell, storyIndex),
      isNavigationEdgeBlocked: (fromCell, toCell, storyIndex) =>
        gridRuntime.isNavigationEdgeBlocked(fromCell, toCell, storyIndex),
      getMovementCost: (cell, storyIndex) => gridRuntime.getMovementCost(cell, storyIndex),
      surfaceHeightResolver: gridRuntime.getSurfaceHeightResolver(),
      debugEnabled: registry.getShowStairNavigationDebug()
    });
  }

  public findPath(input: GridNavigationPathRequest): MovementSegment[] | null {
    const edgePath = this.pathfinder.findPathEdges({
      fromCell: input.fromCell,
      fromStoryIndex: input.fromStoryIndex,
      toCell: input.toCell,
      toStoryIndex: input.toStoryIndex,
      occupied: (node) => this.isBlockedForRequest(input, node)
    });
    const path = edgePath ? this.routeBuilder.build(edgePath) : null;

    if (this.isDebugEnabled()) {
      this.logPathDiagnostics(input, path);
    }

    return path;
  }

  public resolveReachableCells(input: {
    readonly startCell: GridCell;
    readonly startStoryIndex: number;
    readonly movementPoints: number;
    readonly activeEntityId?: string;
    readonly occupied?: (node: NavigationNode) => boolean;
  }): ReachableNavigationCellsResult {
    if (input.movementPoints <= 0) {
      return {
        reachableCells: [],
        costByNodeKey: new Map<string, number>(),
        consideredStairConnector: false
      };
    }

    const start = this.graph.getNodeForCell(input.startStoryIndex, input.startCell);
    if (!start) {
      return {
        reachableCells: [],
        costByNodeKey: new Map<string, number>(),
        consideredStairConnector: false
      };
    }

    const openIds = new Set<string>([start.id]);
    const costByNodeKey = new Map<string, number>([[start.id, 0]]);
    let consideredStairConnector = false;
    const blocked = (node: NavigationNode): boolean => {
      if (node.id === start.id) {
        return false;
      }

      return Boolean(input.occupied?.(node));
    };

    while (openIds.size > 0) {
      const currentId = this.lowestCostNodeId(openIds, costByNodeKey);
      if (!currentId) {
        break;
      }

      openIds.delete(currentId);
      const current = this.graph.getNode(currentId);
      if (!current) {
        continue;
      }

      const currentCost = costByNodeKey.get(current.id);
      if (currentCost === undefined) {
        continue;
      }

      for (const edge of this.graph.getNeighbors(current, blocked)) {
        if (edge.kind !== "walk") {
          consideredStairConnector = true;
        }

        const nextCost = currentCost + edge.cost;
        if (nextCost > input.movementPoints) {
          continue;
        }

        const knownCost = costByNodeKey.get(edge.toNodeId);
        if (knownCost !== undefined && knownCost <= nextCost) {
          continue;
        }

        costByNodeKey.set(edge.toNodeId, nextCost);
        openIds.add(edge.toNodeId);
      }
    }

    const reachableCells: ReachableNavigationCell[] = [];
    for (const [nodeKey, cost] of costByNodeKey.entries()) {
      const node = this.graph.getNode(nodeKey);
      if (!node) {
        continue;
      }

      reachableCells.push({
        cell: node.cell,
        storyIndex: node.storyIndex,
        cost
      });
    }

    if (this.isDebugEnabled()) {
      this.logReachableDiagnostics(input, reachableCells, consideredStairConnector);
    }

    return {
      reachableCells,
      costByNodeKey,
      consideredStairConnector
    };
  }

  public makeTargetKey(cell: GridCell, storyIndex: number): string {
    return this.targetKeyFactory.make(cell, storyIndex);
  }

  private isBlockedForRequest(input: GridNavigationPathRequest, node: NavigationNode): boolean {
    if (node.cell.equals(input.fromCell) && node.storyIndex === input.fromStoryIndex) {
      return false;
    }

    return Boolean(input.occupied?.(node));
  }

  private lowestCostNodeId(openIds: ReadonlySet<string>, costByNodeKey: ReadonlyMap<string, number>): string | null {
    let bestId: string | null = null;
    let bestCost = Number.POSITIVE_INFINITY;

    for (const nodeId of openIds) {
      const cost = costByNodeKey.get(nodeId) ?? Number.POSITIVE_INFINITY;
      if (cost < bestCost) {
        bestId = nodeId;
        bestCost = cost;
      }
    }

    return bestId;
  }

  private logReachableDiagnostics(
    input: {
      readonly startCell: GridCell;
      readonly startStoryIndex: number;
      readonly movementPoints: number;
      readonly activeEntityId?: string;
    },
    reachableCells: readonly ReachableNavigationCell[],
    consideredStairConnector: boolean
  ): void {
    const countsByStory = new Map<number, number>();
    for (const reachableCell of reachableCells) {
      countsByStory.set(reachableCell.storyIndex, (countsByStory.get(reachableCell.storyIndex) ?? 0) + 1);
    }

    console.debug(
      `[GridNavigationReachable]${input.activeEntityId ? ` entity=${input.activeEntityId}` : ""} ` +
      `start=${input.startStoryIndex}:${input.startCell.x}:${input.startCell.z} mp=${input.movementPoints} ` +
      `countByStory=${[...countsByStory.entries()].map(([story, count]) => `${story}:${count}`).join(",") || "none"} ` +
      `consideredStairs=${consideredStairConnector}`
    );
  }

  private logPathDiagnostics(input: GridNavigationPathRequest, path: readonly MovementSegment[] | null): void {
    const startWalkable = this.environment.isWalkableCell(input.fromCell, input.fromStoryIndex);
    const goalWalkable = this.environment.isWalkableCell(input.toCell, input.toStoryIndex);
    const goalNode = this.graph.getNodeForCell(input.toStoryIndex, input.toCell);
    const goalOccupied = goalNode ? this.isBlockedForRequest(input, goalNode) : false;
    const pathCost = path?.reduce((total, segment) => total + segment.cost, 0) ?? null;
    const budgetText = input.movementPoints === undefined ? "" : ` mp=${input.movementPoints}`;
    const entityText = input.activeEntityId ? ` entity=${input.activeEntityId}` : "";

    console.debug(
      `[GridNavigationPath]${entityText} from=${input.fromStoryIndex}:${input.fromCell.x}:${input.fromCell.z} ` +
      `to=${input.toStoryIndex}:${input.toCell.x}:${input.toCell.z}${budgetText} startWalkable=${startWalkable} ` +
      `goalWalkable=${goalWalkable} goalOccupied=${goalOccupied} cost=${pathCost ?? "n/a"} ` +
      `segments=${path ? this.segmentDebugFormatter.format(path) : "none"}`
    );
  }

  private isDebugEnabled(): boolean {
    return this.environment.debugEnabled === true || this.debugFlag.isEnabled();
  }
}
