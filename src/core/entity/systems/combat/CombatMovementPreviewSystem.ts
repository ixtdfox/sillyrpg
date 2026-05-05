import { Scene as BabylonScene } from "@babylonjs/core";
import type { Entity } from "../../Entity";
import type { EntityManager } from "../../EntityManager";
import type { System } from "../../System";
import { CombatStatsComponent } from "../../components/CombatStatsComponent";
import { GridPositionComponent } from "../../components/GridPositionComponent";
import { LocalPlayerComponent } from "../../components/LocalPlayerComponent";
import { RectPathfinder } from "../../../grid/RectPathfinder";
import { getInGameSceneRuntimeContext, type InGameSceneRuntimeContext } from "../../../scene/in-game/InGameSceneRuntimeContext";
import { CombatInputController } from "../../../game/CombatInputController";
import { CombatInputMode } from "../../../game/CombatInputMode";
import { TurnBasedCombatState } from "../../../game/TurnBasedCombatState";
import { WorldModeController } from "../../../game/WorldModeController";
import { GridMovementCostResolver } from "../grid/GridMovementCostResolver";
import { GridSpatialIndex } from "../grid/GridSpatialIndex";
import { CombatMoveRangeResolver } from "./CombatMoveRangeResolver";
import { GridCell } from "../../../grid/GridCell";

/**
 * Renders combat move range and hovered move path previews through grid overlay runtime.
 */
export class CombatMovementPreviewSystem implements System {
  private readonly entityManager: EntityManager;
  private readonly worldModeController: WorldModeController;
  private readonly combatState: TurnBasedCombatState;
  private readonly combatInputController: CombatInputController;
  private readonly spatialIndex: GridSpatialIndex;
  private readonly movementCostResolver: GridMovementCostResolver;
  private readonly moveRangeResolver: CombatMoveRangeResolver;
  private runtimeContext: InGameSceneRuntimeContext | null;

  public constructor(
    entityManager: EntityManager,
    worldModeController: WorldModeController,
    combatState: TurnBasedCombatState,
    combatInputController: CombatInputController,
    spatialIndex: GridSpatialIndex,
    movementCostResolver: GridMovementCostResolver
  ) {
    this.entityManager = entityManager;
    this.worldModeController = worldModeController;
    this.combatState = combatState;
    this.combatInputController = combatInputController;
    this.spatialIndex = spatialIndex;
    this.movementCostResolver = movementCostResolver;
    this.moveRangeResolver = new CombatMoveRangeResolver(this.movementCostResolver);
    this.runtimeContext = null;
  }

  public setScene(scene: BabylonScene | null): void {
    this.runtimeContext = scene ? getInGameSceneRuntimeContext(scene) : null;
    this.movementCostResolver.setMovementCostProvider(
      this.runtimeContext
        ? (cell, storyIndex) => this.runtimeContext?.gridRuntime.getMovementCost(cell, storyIndex) ?? 1
        : null
    );
    this.clearPreview();
  }

  public update(_deltaSeconds: number): void {
    if (!this.runtimeContext || !this.isMovePreviewActive()) {
      this.clearPreview();
      return;
    }

    const localPlayer = this.resolveLocalPlayer();
    if (!localPlayer) {
      this.clearPreview();
      return;
    }

    const gridPosition = localPlayer.getComponent(GridPositionComponent);
    const combatStats = localPlayer.getComponent(CombatStatsComponent);
    const entityId = localPlayer.getId();
    const grid = this.runtimeContext.gridRuntime.getGrid();

    const rangeResolution = this.moveRangeResolver.resolveReachableCells(
      grid,
      gridPosition.currentCell,
      combatStats.currentMp,
      (cell) => this.isBlockedCell(entityId, gridPosition.currentCell, gridPosition.currentStoryIndex, cell),
      gridPosition.currentStoryIndex,
      (fromCell, toCell) =>
        this.runtimeContext?.gridRuntime.isNavigationEdgeBlocked(fromCell, toCell, gridPosition.currentStoryIndex) ?? false
    );

    this.runtimeContext.gridRuntime.setMoveRangeNavigationCells(
      rangeResolution.reachableCells.map((cell) => ({ cell, storyIndex: gridPosition.currentStoryIndex }))
    );

    const pickedNavigationCell = this.runtimeContext.gridRuntime.getHoveredNavigationCell(gridPosition.currentStoryIndex);
    if (
      !pickedNavigationCell ||
      pickedNavigationCell.storyIndex !== gridPosition.currentStoryIndex ||
      pickedNavigationCell.cell.equals(gridPosition.currentCell)
    ) {
      this.runtimeContext.gridRuntime.setMovePathNavigationCells([]);
      return;
    }
    const hoveredCell = pickedNavigationCell.cell;

    if (!rangeResolution.costByCellKey.has(cellKey(hoveredCell))) {
      this.runtimeContext.gridRuntime.setMovePathNavigationCells([]);
      return;
    }

    const pathfinder = new RectPathfinder(
      grid,
      (cell) => this.isBlockedCell(entityId, gridPosition.currentCell, gridPosition.currentStoryIndex, cell),
      (fromCell, toCell) =>
        this.runtimeContext?.gridRuntime.isNavigationEdgeBlocked(fromCell, toCell, gridPosition.currentStoryIndex) ?? false
    );
    const path = pathfinder.findPath(gridPosition.currentCell, hoveredCell);
    if (!path || path.length < 2) {
      this.runtimeContext.gridRuntime.setMovePathNavigationCells([]);
      return;
    }

    const movePath: GridCell[] = [];
    let totalCost = 0;

    for (let index = 1; index < path.length; index += 1) {
      const stepCost = this.movementCostResolver.getStepCost(path[index - 1], path[index], gridPosition.currentStoryIndex);
      if (!Number.isFinite(stepCost) || stepCost <= 0) {
        this.runtimeContext.gridRuntime.setMovePathNavigationCells([]);
        return;
      }

      totalCost += stepCost;
      if (totalCost > combatStats.currentMp) {
        this.runtimeContext.gridRuntime.setMovePathNavigationCells([]);
        return;
      }

      movePath.push(path[index]);
    }

    this.runtimeContext.gridRuntime.setMovePathNavigationCells(
      movePath.map((cell) => ({ cell, storyIndex: gridPosition.currentStoryIndex }))
    );
  }

  private isMovePreviewActive(): boolean {
    if (!this.worldModeController.isTurnBased() || !this.combatState.isActive()) {
      return false;
    }

    if (this.combatInputController.getMode() !== CombatInputMode.MOVE) {
      return false;
    }

    const localPlayer = this.resolveLocalPlayer();
    return Boolean(localPlayer && this.combatState.isActiveEntity(localPlayer.getId()));
  }

  private resolveLocalPlayer(): Entity | null {
    const localPlayer = this.entityManager.query(LocalPlayerComponent, GridPositionComponent, CombatStatsComponent)[0];
    return localPlayer ?? null;
  }

  private isBlockedCell(entityId: string, startCell: GridCell, storyIndex: number, cell: GridCell): boolean {
    if (cell.equals(startCell)) {
      return false;
    }

    if (!this.runtimeContext?.gridRuntime.isWalkableCell(cell, storyIndex)) {
      return true;
    }

    const entitiesAtCell = this.spatialIndex.getEntitiesAt(cell, storyIndex);
    return entitiesAtCell.some((occupantEntityId) => occupantEntityId !== entityId);
  }

  private clearPreview(): void {
    this.runtimeContext?.gridRuntime.clearCombatMovementPreview();
  }
}

function cellKey(cell: GridCell): string {
  return `${cell.x}:${cell.z}`;
}
