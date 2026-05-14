import { MeshBuilder, NullEngine, Ray, Scene, Vector3 } from "@babylonjs/core";
import { GridCell } from "../../../src/core/grid/GridCell";
import {
  GridVisionSectorQuery,
  RectGrid,
  RectGridBoundsFactory,
  RectGridCoordinateMapper,
  RectGridNeighborProvider
} from "../../../src/core/grid/RectGrid";
import {
  GroundMeshFootprintRanker,
  GroundMeshNamePolicy,
  RectGridGroundMeshResolver,
  TerrainVisualOnlyMeshPolicy
} from "../../../src/core/grid/RectGridGroundMeshResolver";
import {
  HorizontalPlaneRayIntersector,
  StairPickStoryPolicy
} from "../../../src/core/grid/RectGroundPickerController";
import { StairEndpointCellRepairService } from "../../../src/core/grid/RectGridRuntime";

class RectGridServicesTestSuite {
  public run(): void {
    this.testBoundsCoordinatesNeighborsAndVision();
    this.testGroundResolverPolicies();
    this.testPickerGeometryPolicies();
    this.testStairEndpointRepairService();
  }

  private testBoundsCoordinatesNeighborsAndVision(): void {
    const origin = Vector3.Zero();
    const boundsFactory = new RectGridBoundsFactory();
    const bounds = boundsFactory.deriveFromWorldRect(origin, 1, -0.2, 2.1, 0, 1.9);

    this.assertEqual(bounds.minX, -2);
    this.assertEqual(bounds.maxX, 3);
    this.assertEqual(bounds.minZ, -1);
    this.assertEqual(bounds.maxZ, 2);

    const coordinateMapper = new RectGridCoordinateMapper(origin, 1);
    this.assert(coordinateMapper.worldToCell(new Vector3(1.2, 0, -0.1)).equals(new GridCell(1, -1)), "Expected world position to map to floored grid cell");
    this.assertVector(coordinateMapper.cellToWorld(new GridCell(1, -1), 2), new Vector3(1.5, 2, -0.5));
    this.assertEqual(coordinateMapper.cellBounds(new GridCell(1, -1)).minZ, -1);

    const neighborProvider = new RectGridNeighborProvider();
    this.assertEqual(neighborProvider.getNeighbors4(new GridCell(0, 0)).length, 4);
    this.assertEqual(neighborProvider.getNeighbors8(new GridCell(0, 0)).length, 8);

    const grid = new RectGrid(origin, 1, { minX: -3, maxX: 3, minZ: -3, maxZ: 3 });
    const visionQuery = new GridVisionSectorQuery(grid);
    const visibleCells = visionQuery.collect(new GridCell(0, 0), new Vector3(1, 0, 0), 2, 90);
    this.assert(visibleCells.some((cell) => cell.equals(new GridCell(1, 0))), "Expected forward cell in vision sector");
    this.assert(!visibleCells.some((cell) => cell.equals(new GridCell(-1, 0))), "Expected backward cell outside vision sector");
  }

  private testGroundResolverPolicies(): void {
    const engine = new NullEngine();
    const scene = new Scene(engine);

    try {
      const visualOnlyMesh = MeshBuilder.CreateBox("terrain", { size: 8 }, scene);
      visualOnlyMesh.metadata = { terrainVisualOnly: true };
      const fallbackMesh = MeshBuilder.CreateGround("decor", { width: 2, height: 2 }, scene);
      const explicitGround = MeshBuilder.CreateGround("author-ground", { width: 4, height: 3 }, scene);
      explicitGround.metadata = { isGround: true };
      const childMesh = MeshBuilder.CreateBox("author-ground-child", { size: 1 }, scene);
      childMesh.parent = explicitGround;

      const visualOnlyPolicy = new TerrainVisualOnlyMeshPolicy();
      this.assert(visualOnlyPolicy.isVisualOnly(visualOnlyMesh), "Expected terrainVisualOnly mesh to be rejected by policy");

      const namePolicy = new GroundMeshNamePolicy();
      this.assert(namePolicy.isExactGroundName("floor.001"), "Expected Blender suffix to be ignored by exact-name policy");
      this.assert(namePolicy.isKeywordGroundName("walkable-tile-strip"), "Expected keyword-name policy to match walkable tile mesh");

      const footprintRanker = new GroundMeshFootprintRanker();
      this.assert(footprintRanker.selectLargestHorizontalMesh([fallbackMesh, explicitGround]) === explicitGround, "Expected footprint ranker to choose larger ground mesh");

      const selection = this.withMutedConsole(["debug"], () => new RectGridGroundMeshResolver().resolve(scene));
      this.assert(selection.groundMesh === explicitGround, "Expected metadata ground mesh to win resolver chain");
      this.assert(selection.isGroundPick(childMesh), "Expected child mesh of selected ground to be accepted by pick predicate");
      this.assert(!selection.groundMeshes.includes(visualOnlyMesh), "Expected visual-only terrain mesh to be excluded from ground selection");
    } finally {
      scene.dispose();
      engine.dispose();
    }
  }

  private testPickerGeometryPolicies(): void {
    const storyPolicy = new StairPickStoryPolicy();
    this.assert(storyPolicy.isConnectedToStory({}, 4), "Expected legacy stair metadata to be accepted on any story");
    this.assert(storyPolicy.isConnectedToStory({ fromStory: 2, toStory: 3 }, 3), "Expected stair connected to current story");
    this.assert(!storyPolicy.isConnectedToStory({ fromStory: 2, toStory: 3 }, 1), "Expected unrelated stair to be skipped");

    const intersector = new HorizontalPlaneRayIntersector();
    const hit = intersector.intersect(new Ray(new Vector3(0, 10, 0), new Vector3(0, -1, 0)), 4);
    this.assertVector(hit, new Vector3(0, 4, 0));
    this.assertEqual(intersector.intersect(new Ray(Vector3.Zero(), new Vector3(1, 0, 0)), 4), null);
    this.assertEqual(intersector.intersect(new Ray(Vector3.Zero(), new Vector3(0, 1, 0)), -1), null);
  }

  private testStairEndpointRepairService(): void {
    const repairedReasons: string[] = [];
    const service = new StairEndpointCellRepairService();

    const repairedCount = this.withMutedConsole(["info", "warn"], () => service.validateAndRepair(
      [
        {
          stairId: "blocked-from",
          fromStoryIndex: 0,
          toStoryIndex: 1,
          fromCell: new GridCell(1, 1),
          toCell: new GridCell(1, 2),
          kind: "internal",
          cost: 1,
          bidirectional: true,
          traversalPathWorld: [new Vector3(1.5, 0, 1.5), new Vector3(1.5, 3, 2.5)]
        }
      ],
      {
        isWalkableCell: () => true
      },
      {
        isCellBlocked: (cell) => cell.equals(new GridCell(1, 1)) && repairedReasons.length === 0,
        forceUnblockCell: (_cell, _storyIndex, reason) => {
          repairedReasons.push(reason);
        }
      }
    ));

    this.assertEqual(repairedCount, 1);
    this.assertEqual(repairedReasons[0], "stairEndpoint:blocked-from:from");
  }

  private assert(condition: unknown, message: string): void {
    if (!condition) {
      throw new Error(message);
    }
  }

  private assertEqual<T>(actual: T, expected: T): void {
    if (actual !== expected) {
      throw new Error(`Expected ${String(expected)}, got ${String(actual)}`);
    }
  }

  private assertVector(actual: Vector3 | null, expected: Vector3): void {
    if (!actual || Math.abs(actual.x - expected.x) > 0.00001 || Math.abs(actual.y - expected.y) > 0.00001 || Math.abs(actual.z - expected.z) > 0.00001) {
      throw new Error(`Expected vector ${expected.toString()}, got ${actual?.toString() ?? "null"}`);
    }
  }

  private withMutedConsole<T>(methods: readonly ("debug" | "info" | "warn")[], action: () => T): T {
    const originals = new Map<"debug" | "info" | "warn", typeof console.debug>();
    for (const method of methods) {
      originals.set(method, console[method]);
      console[method] = () => undefined;
    }

    try {
      return action();
    } finally {
      for (const [method, original] of originals) {
        console[method] = original;
      }
    }
  }
}

new RectGridServicesTestSuite().run();
