import { Scene as BabylonScene } from "@babylonjs/core";
import type { Entity } from "../../Entity";
import type { EntityManager } from "../../EntityManager";
import type { System } from "../../System";
import { CombatStatsComponent } from "../../components/CombatStatsComponent";
import { HexPositionComponent } from "../../components/HexPositionComponent";
import { LocalPlayerComponent } from "../../components/LocalPlayerComponent";
import { HexPathfinder } from "../../../hex/HexPathfinder";
import { getInGameSceneRuntimeContext, type InGameSceneRuntimeContext } from "../../../scene/in-game/InGameSceneRuntimeContext";
import { CombatInputController } from "../../../game/CombatInputController";
import { CombatInputMode } from "../../../game/CombatInputMode";
import { TurnBasedCombatState } from "../../../game/TurnBasedCombatState";
import { WorldModeController } from "../../../game/WorldModeController";
import { HexMovementCostResolver } from "../hex/HexMovementCostResolver";
import { HexSpatialIndex } from "../hex/HexSpatialIndex";
import { CombatMoveRangeResolver } from "./CombatMoveRangeResolver";
import { HexCell } from "../../../hex/HexCell";

/**
 * Renders combat move range and hovered move path previews through hex overlay runtime.
 */
export class CombatMovementPreviewSystem implements System {
  private readonly entityManager: EntityManager;
  private readonly worldModeController: WorldModeController;
  private readonly combatState: TurnBasedCombatState;
  private readonly combatInputController: CombatInputController;
  private readonly spatialIndex: HexSpatialIndex;
  private readonly movementCostResolver: HexMovementCostResolver;
  private readonly moveRangeResolver: CombatMoveRangeResolver;
  private runtimeContext: InGameSceneRuntimeContext | null;

  public constructor(
    entityManager: EntityManager,
    worldModeController: WorldModeController,
    combatState: TurnBasedCombatState,
    combatInputController: CombatInputController,
    spatialIndex: HexSpatialIndex,
    movementCostResolver: HexMovementCostResolver
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
        ? (cell, storyIndex) => this.runtimeContext?.hexGridRuntime.getMovementCost(cell, storyIndex) ?? 1
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

    const hexPosition = localPlayer.getComponent(HexPositionComponent);
    const combatStats = localPlayer.getComponent(CombatStatsComponent);
    const entityId = localPlayer.getId();
    const grid = this.runtimeContext.hexGridRuntime.getGrid();

    const rangeResolution = this.moveRangeResolver.resolveReachableCells(
      grid,
      hexPosition.currentCell,
      combatStats.currentMp,
      (cell) => this.isBlockedCell(entityId, hexPosition.currentCell, hexPosition.currentStoryIndex, cell),
      hexPosition.currentStoryIndex,
      (fromCell, toCell) =>
        this.runtimeContext?.hexGridRuntime.isNavigationEdgeBlocked(fromCell, toCell, hexPosition.currentStoryIndex) ?? false
    );

    this.runtimeContext.hexGridRuntime.setMoveRangeNavigationCells(
      rangeResolution.reachableCells.map((cell) => ({ cell, storyIndex: hexPosition.currentStoryIndex }))
    );

    const pickedNavigationCell = this.runtimeContext.hexGridRuntime.getHoveredNavigationCell(hexPosition.currentStoryIndex);
    if (
      !pickedNavigationCell ||
      pickedNavigationCell.storyIndex !== hexPosition.currentStoryIndex ||
      pickedNavigationCell.cell.equals(hexPosition.currentCell)
    ) {
      this.runtimeContext.hexGridRuntime.setMovePathNavigationCells([]);
      return;
    }
    const hoveredCell = pickedNavigationCell.cell;

    if (!rangeResolution.costByCellKey.has(cellKey(hoveredCell))) {
      this.runtimeContext.hexGridRuntime.setMovePathNavigationCells([]);
      return;
    }

    const pathfinder = new HexPathfinder(
      grid,
      (cell) => this.isBlockedCell(entityId, hexPosition.currentCell, hexPosition.currentStoryIndex, cell),
      (fromCell, toCell) =>
        this.runtimeContext?.hexGridRuntime.isNavigationEdgeBlocked(fromCell, toCell, hexPosition.currentStoryIndex) ?? false
    );
    const path = pathfinder.findPath(hexPosition.currentCell, hoveredCell);
    if (!path || path.length < 2) {
      this.runtimeContext.hexGridRuntime.setMovePathNavigationCells([]);
      return;
    }

    const movePath: HexCell[] = [];
    let totalCost = 0;

    for (let index = 1; index < path.length; index += 1) {
      const stepCost = this.movementCostResolver.getStepCost(path[index - 1], path[index], hexPosition.currentStoryIndex);
      if (!Number.isFinite(stepCost) || stepCost <= 0) {
        this.runtimeContext.hexGridRuntime.setMovePathNavigationCells([]);
        return;
      }

      totalCost += stepCost;
      if (totalCost > combatStats.currentMp) {
        this.runtimeContext.hexGridRuntime.setMovePathNavigationCells([]);
        return;
      }

      movePath.push(path[index]);
    }

    this.runtimeContext.hexGridRuntime.setMovePathNavigationCells(
      movePath.map((cell) => ({ cell, storyIndex: hexPosition.currentStoryIndex }))
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
    const localPlayer = this.entityManager.query(LocalPlayerComponent, HexPositionComponent, CombatStatsComponent)[0];
    return localPlayer ?? null;
  }

  private isBlockedCell(entityId: string, startCell: HexCell, storyIndex: number, cell: HexCell): boolean {
    if (cell.equals(startCell)) {
      return false;
    }

    if (!this.runtimeContext?.hexGridRuntime.isWalkableCell(cell, storyIndex)) {
      return true;
    }

    const entitiesAtCell = this.spatialIndex.getEntitiesAt(cell, storyIndex);
    return entitiesAtCell.some((occupantEntityId) => occupantEntityId !== entityId);
  }

  private clearPreview(): void {
    this.runtimeContext?.hexGridRuntime.clearCombatMovementPreview();
  }
}

function cellKey(cell: HexCell): string {
  return `${cell.q}:${cell.r}`;
}
