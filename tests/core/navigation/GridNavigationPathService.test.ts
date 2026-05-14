import { Vector3 } from "@babylonjs/core";
import { GridCell } from "../../../src/core/grid/GridCell";
import { RectGrid } from "../../../src/core/grid/RectGrid";
import { BasicCombatAiService } from "../../../src/core/entity/systems/combat/BasicCombatAiService";
import { GridNavigationPathService, type GridNavigationPathEnvironment } from "../../../src/core/navigation/GridNavigationPathService";
import { BuildingNavigationRegistry, StairTacticalCostPolicy } from "../../../src/core/navigation/BuildingNavigationRegistry";
import type { StairNavigationConnector } from "../../../src/core/navigation/NavigationGraph";

function makeGrid(): RectGrid {
  return new RectGrid(Vector3.Zero(), 1, {
    minX: 0,
    maxX: 4,
    minZ: 0,
    maxZ: 0
  });
}

function makeStair(cost = 2): StairNavigationConnector {
  return {
    stairId: "test-stair",
    fromStoryIndex: 0,
    toStoryIndex: 1,
    fromCell: new GridCell(1, 0),
    toCell: new GridCell(1, 0),
    kind: "internal",
    cost,
    bidirectional: true,
    traversalPathWorld: [new Vector3(1.5, 0, 0.5), new Vector3(1.5, 3, 0.5)]
  };
}

function makeEnvironment(input: {
  readonly stairCost?: number;
  readonly blockedEdges?: readonly string[];
} = {}): { service: GridNavigationPathService; environment: GridNavigationPathEnvironment } {
  const grid = makeGrid();
  const blockedEdges = new Set(input.blockedEdges ?? []);
  const environment: GridNavigationPathEnvironment = {
    grid,
    stairConnectors: [makeStair(input.stairCost ?? 2)],
    storyYByStory: new Map([
      [0, 0],
      [1, 3]
    ]),
    isWalkableCell: (cell) => grid.contains(cell),
    isNavigationEdgeBlocked: (fromCell, toCell, storyIndex) =>
      blockedEdges.has(edgeKey(storyIndex, fromCell, toCell)),
    getMovementCost: () => 1,
    surfaceHeightResolver: {
      resolveGroundedPosition: (input: {
        readonly position: Vector3;
        readonly storyIndex: number;
      }) => new Vector3(input.position.x, environment.storyYByStory.get(input.storyIndex) ?? input.position.y, input.position.z)
    }
  };

  return {
    service: new GridNavigationPathService(environment),
    environment
  };
}

function testReachableCellsIncludeUpperStoryThroughStair(): void {
  const { service } = makeEnvironment();
  const result = service.resolveReachableCells({
    startCell: new GridCell(0, 0),
    startStoryIndex: 0,
    movementPoints: 4
  });

  assert(
    result.reachableCells.some((entry) => entry.storyIndex === 1 && entry.cell.equals(new GridCell(2, 0))),
    "Expected story 1 target cell to be reachable through stair"
  );
}

function testWalkEdgeBuildsSingleGroundedPoint(): void {
  const { service } = makeEnvironment();
  const path = service.findPath({
    fromCell: new GridCell(0, 0),
    fromStoryIndex: 0,
    toCell: new GridCell(1, 0),
    toStoryIndex: 0
  });

  assert(Boolean(path), "Expected walk path to resolve");
  assert(path?.length === 1, "Expected adjacent walk path to contain one segment");
  assert(path?.[0].points.length === 1, "Expected walk segment to contain one route point");
  assert(path?.[0].toCell.equals(new GridCell(1, 0)) === true, "Expected walk segment to target requested cell");
}

function testMovementPointsCanExcludeStairTraversal(): void {
  const { service } = makeEnvironment();
  const result = service.resolveReachableCells({
    startCell: new GridCell(0, 0),
    startStoryIndex: 0,
    movementPoints: 2
  });

  assert(
    !result.reachableCells.some((entry) => entry.storyIndex === 1),
    "Expected upper-story cells to be unreachable when MP is below walk-to-stair plus stair cost"
  );
}

function testOccupiedTargetExcludedButStartAllowed(): void {
  const occupiedCell = new GridCell(1, 0);
  const { service } = makeEnvironment();
  const result = service.resolveReachableCells({
    startCell: new GridCell(0, 0),
    startStoryIndex: 0,
    movementPoints: 3,
    occupied: (node) => node.storyIndex === 0 && (node.cell.equals(new GridCell(0, 0)) || node.cell.equals(occupiedCell))
  });

  assert(
    result.reachableCells.some((entry) => entry.storyIndex === 0 && entry.cell.equals(new GridCell(0, 0))),
    "Expected occupied start cell to remain reachable"
  );
  assert(
    !result.reachableCells.some((entry) => entry.storyIndex === 0 && entry.cell.equals(occupiedCell)),
    "Expected occupied non-start cell to be excluded"
  );
}

function testBlockedAndOpenDoorEdges(): void {
  const blockedEdge = edgeKey(0, new GridCell(0, 0), new GridCell(1, 0));
  const blockedService = makeEnvironment({ blockedEdges: [blockedEdge] }).service;
  const blockedResult = blockedService.resolveReachableCells({
    startCell: new GridCell(0, 0),
    startStoryIndex: 0,
    movementPoints: 1
  });

  assert(
    !blockedResult.reachableCells.some((entry) => entry.storyIndex === 0 && entry.cell.equals(new GridCell(1, 0))),
    "Expected blocked edge to prevent movement"
  );

  const openDoorService = makeEnvironment().service;
  const openResult = openDoorService.resolveReachableCells({
    startCell: new GridCell(0, 0),
    startStoryIndex: 0,
    movementPoints: 1
  });

  assert(
    openResult.reachableCells.some((entry) => entry.storyIndex === 0 && entry.cell.equals(new GridCell(1, 0))),
    "Expected unblocked door edge to allow movement"
  );
}

function testBasicCombatAiCanChooseUpperStoryApproachTarget(): void {
  const { environment } = makeEnvironment();
  const fakeGridRuntime = {
    getGrid: () => environment.grid,
    getBuildingNavigationRegistry: () => ({
      getStairConnectors: () => environment.stairConnectors,
      getShowStairNavigationDebug: () => false
    }),
    getMergedStoryYByStory: () => environment.storyYByStory,
    isWalkableCell: environment.isWalkableCell,
    isNavigationEdgeBlocked: environment.isNavigationEdgeBlocked,
    getMovementCost: environment.getMovementCost,
    getSurfaceHeightResolver: () => environment.surfaceHeightResolver
  };
  const aiService = new BasicCombatAiService({} as never, {} as never, {
    getEntitiesAt: () => []
  } as never);
  (aiService as unknown as { runtimeContext: unknown }).runtimeContext = { gridRuntime: fakeGridRuntime };

  const selected = (aiService as unknown as {
    resolveApproachTarget: (
      activeAiEntityId: string,
      activeCell: GridCell,
      activeStoryIndex: number,
      targetCell: GridCell,
      targetStoryIndex: number,
      movementPoints: number
    ) => { readonly cell: GridCell; readonly storyIndex: number } | null;
  }).resolveApproachTarget(
    "npc",
    new GridCell(0, 0),
    0,
    new GridCell(2, 0),
    1,
    3
  );

  assert(Boolean(selected), "Expected AI to choose an approach target");
  assert(selected?.storyIndex === 1, "Expected AI approach target on player story");
  assert(selected?.cell.equals(new GridCell(1, 0)), "Expected AI to choose attack-adjacent stair endpoint");
}

function testStairEdgeBuildsNormalizedPolyline(): void {
  const { service } = makeEnvironment();
  const path = service.findPath({
    fromCell: new GridCell(0, 0),
    fromStoryIndex: 0,
    toCell: new GridCell(2, 0),
    toStoryIndex: 1
  });

  const stairSegment = path?.find((segment) => segment.kind === "stair");
  assert(Boolean(stairSegment), "Expected stair segment in multi-story path");
  assert((stairSegment?.points.length ?? 0) >= makeStair().traversalPathWorld.length, "Expected stair segment to preserve traversal polyline");
  assert(stairSegment?.metadata?.stairId === "test-stair", "Expected stair metadata to preserve stair id");
  assert(stairSegment?.fromCell.equals(new GridCell(1, 0)) === true, "Expected stair segment to start at stair entry cell");
  assert(stairSegment?.toCell.equals(new GridCell(1, 0)) === true, "Expected stair segment to end at stair exit cell");
  assert(stairSegment?.fromStoryIndex === 0, "Expected stair segment from story 0");
  assert(stairSegment?.toStoryIndex === 1, "Expected stair segment to story 1");
}

function testStairInteractionSelectsConnectorForCurrentStory(): void {
  const registry = new BuildingNavigationRegistry();
  const connectors: StairNavigationConnector[] = [
    {
      stairId: "shared-stair",
      fromStoryIndex: 1,
      toStoryIndex: 2,
      fromCell: new GridCell(1, 0),
      toCell: new GridCell(1, 0),
      kind: "internal",
      cost: 2,
      bidirectional: true,
      traversalPathWorld: [new Vector3(10, 3, 0), new Vector3(10, 6, 0)]
    },
    {
      stairId: "shared-stair",
      fromStoryIndex: 0,
      toStoryIndex: 1,
      fromCell: new GridCell(0, 0),
      toCell: new GridCell(0, 0),
      kind: "internal",
      cost: 2,
      bidirectional: true,
      traversalPathWorld: [new Vector3(0, 0, 0), new Vector3(0, 3, 0)]
    }
  ];
  (registry as unknown as { readonly stairConnectors: StairNavigationConnector[] }).stairConnectors.push(...connectors);

  const target = registry.resolveStairInteractionTarget({
    stairId: "shared-stair",
    pickedPoint: new Vector3(0, 0, 0),
    currentStoryIndex: 0
  });

  assert(Boolean(target), "Expected shared stair id to resolve");
  assert(target?.connector.fromStoryIndex === 0, "Expected connector that starts on the current story");
  assert(target?.targetStoryIndex === 1, "Expected click on story 0 stair to target story 1");
}

function testLegacyPathLengthStairCostFallsBackToTacticalCost(): void {
  const cost = new StairTacticalCostPolicy().normalize(8, 2, {
    id: "legacy-external-stair",
    kind: "external",
    from: { storyIndex: 0, cell: new GridCell(1, 0) },
    to: { storyIndex: 1, cell: new GridCell(1, 0) }
  });

  assert(cost === 2, "Expected oversized legacy stair cost to fall back to tactical cost");
}

function edgeKey(storyIndex: number, a: GridCell, b: GridCell): string {
  const first = a.x < b.x || (a.x === b.x && a.z <= b.z) ? a : b;
  const second = first === a ? b : a;
  return `${storyIndex}:${first.x}:${first.z}->${second.x}:${second.z}`;
}

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

function run(): void {
  testWalkEdgeBuildsSingleGroundedPoint();
  testReachableCellsIncludeUpperStoryThroughStair();
  testMovementPointsCanExcludeStairTraversal();
  testOccupiedTargetExcludedButStartAllowed();
  testBlockedAndOpenDoorEdges();
  testBasicCombatAiCanChooseUpperStoryApproachTarget();
  testStairEdgeBuildsNormalizedPolyline();
  testStairInteractionSelectsConnectorForCurrentStory();
  testLegacyPathLengthStairCostFallsBackToTacticalCost();
}

run();
console.log("GridNavigationPathService tests passed");
