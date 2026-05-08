import { NullEngine, Scene, Vector3 } from "@babylonjs/core";
import { Entity } from "../../../src/core/entity/Entity";
import { EntityManager } from "../../../src/core/entity/EntityManager";
import { GridPathMovementComponent } from "../../../src/core/entity/components/GridPathMovementComponent";
import { GridPositionComponent } from "../../../src/core/entity/components/GridPositionComponent";
import { TransformComponent } from "../../../src/core/entity/components/TransformComponent";
import { MovementSystem } from "../../../src/core/entity/systems/MovementSystem";
import { GridMovementCostResolver } from "../../../src/core/entity/systems/grid/GridMovementCostResolver";
import { GridSpatialIndex } from "../../../src/core/entity/systems/grid/GridSpatialIndex";
import { TurnBasedCombatState } from "../../../src/core/game/TurnBasedCombatState";
import { WorldModeController } from "../../../src/core/game/WorldModeController";
import { GridCell } from "../../../src/core/grid/GridCell";
import { RectGrid } from "../../../src/core/grid/RectGrid";
import { attachInGameSceneRuntimeContext } from "../../../src/core/scene/in-game/InGameSceneRuntimeContext";

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

function makeMovementSystem(entityManager: EntityManager, scene: Scene): MovementSystem {
  const movementSystem = new MovementSystem(
    entityManager,
    new WorldModeController(),
    new TurnBasedCombatState(new WorldModeController()),
    new GridMovementCostResolver(),
    new GridSpatialIndex()
  );
  attachInGameSceneRuntimeContext(scene, {
    gridRuntime: {
      getGrid: () => new RectGrid(Vector3.Zero(), 1, { minX: 0, maxX: 4, minZ: 0, maxZ: 4 }),
      getMovementCost: () => 1
    } as never,
    locationManager: {} as never,
    topPanelUi: {} as never,
    terrainSurfaceRegistry: {} as never,
    surfaceHeightResolver: {} as never
  });
  movementSystem.setScene(scene);
  return movementSystem;
}

function testWalkSegmentCompletesGridState(): void {
  const engine = new NullEngine();
  const scene = new Scene(engine);
  const entityManager = new EntityManager();
  const movementSystem = makeMovementSystem(entityManager, scene);
  const entity = new Entity("walker");
  const pathMovement = new GridPathMovementComponent(10);
  pathMovement.isMoving = true;
  pathMovement.pathSegments = [
    {
      kind: "walk",
      fromCell: new GridCell(0, 0),
      fromStoryIndex: 0,
      toCell: new GridCell(1, 0),
      toStoryIndex: 0,
      points: [{
        position: new Vector3(1.5, 2, 0.5),
        cell: new GridCell(1, 0),
        storyIndex: 0
      }],
      cost: 1
    }
  ];

  entity.addComponent(TransformComponent, new TransformComponent(new Vector3(0.5, 0, 0.5)));
  entity.addComponent(GridPositionComponent, new GridPositionComponent(new GridCell(0, 0), 0));
  entity.addComponent(GridPathMovementComponent, pathMovement);
  entityManager.addEntity(entity);

  movementSystem.update(1);

  const gridPosition = entity.getComponent(GridPositionComponent);
  assert(gridPosition.currentCell.equals(new GridCell(1, 0)), "Expected walk segment to update current cell");
  assert(gridPosition.currentStoryIndex === 0, "Expected walk segment to keep story index");
  assert(pathMovement.currentPointIndex === 0, "Expected point index reset after completed segment");
  assert(!pathMovement.isMoving, "Expected single walk segment to finish movement");

  scene.dispose();
  engine.dispose();
}

function testStairSegmentTraversesAllPoints(): void {
  const engine = new NullEngine();
  const scene = new Scene(engine);
  const entityManager = new EntityManager();
  const movementSystem = makeMovementSystem(entityManager, scene);
  const entity = new Entity("climber");
  const pathMovement = new GridPathMovementComponent(10);
  pathMovement.isMoving = true;
  pathMovement.pathSegments = [
    {
      kind: "stair",
      fromCell: new GridCell(1, 0),
      fromStoryIndex: 0,
      toCell: new GridCell(1, 0),
      toStoryIndex: 1,
      points: [
        { position: new Vector3(1.5, 0, 0.5), cell: new GridCell(1, 0), storyIndex: 0 },
        { position: new Vector3(1.5, 1.5, 0.5), cell: new GridCell(1, 0), storyIndex: 0 },
        { position: new Vector3(1.5, 3, 0.5), cell: new GridCell(1, 0), storyIndex: 1 }
      ],
      cost: 2,
      metadata: { stairId: "stairs-1" }
    }
  ];

  entity.addComponent(TransformComponent, new TransformComponent(new Vector3(1.5, 0, 0.5)));
  entity.addComponent(GridPositionComponent, new GridPositionComponent(new GridCell(1, 0), 0));
  entity.addComponent(GridPathMovementComponent, pathMovement);
  entityManager.addEntity(entity);

  movementSystem.update(1);
  assert(pathMovement.currentPointIndex === 1, "Expected stair movement to advance to second route point");
  movementSystem.update(1);
  assert(pathMovement.currentPointIndex === 2, "Expected stair movement to advance to final route point");
  movementSystem.update(1);

  const gridPosition = entity.getComponent(GridPositionComponent);
  assert(gridPosition.currentCell.equals(new GridCell(1, 0)), "Expected stair segment to end on target cell");
  assert(gridPosition.currentStoryIndex === 1, "Expected stair segment to update story index");
  assert(pathMovement.currentPointIndex === 0, "Expected point index reset after stair completion");
  assert(!pathMovement.isMoving, "Expected stair segment to finish movement");

  scene.dispose();
  engine.dispose();
}

function run(): void {
  testWalkSegmentCompletesGridState();
  testStairSegmentTraversesAllPoints();
}

run();
console.log("MovementSystem tests passed");
