import { Scene as BabylonScene } from "@babylonjs/core";
import type { Entity } from "../../Entity";
import type { EntityManager } from "../../EntityManager";
import type { System } from "../../System";
import { CombatStatsComponent } from "../../components/CombatStatsComponent";
import { GridPositionComponent } from "../../components/GridPositionComponent";
import { LocalPlayerComponent } from "../../components/LocalPlayerComponent";
import { getInGameSceneRuntimeContext, type InGameSceneRuntimeContext } from "../../../scene/in-game/InGameSceneRuntimeContext";
import { CombatInputController } from "../../../game/CombatInputController";
import { CombatInputMode } from "../../../game/CombatInputMode";
import { TurnBasedCombatState } from "../../../game/TurnBasedCombatState";
import { WorldModeController } from "../../../game/WorldModeController";
import { GridMovementCostResolver } from "../grid/GridMovementCostResolver";
import { GridSpatialIndex } from "../grid/GridSpatialIndex";
import { CombatMoveRangeResolver } from "./CombatMoveRangeResolver";
import { GridCell } from "../../../grid/GridCell";
import { GridNavigationPathService, RectNavigationDebugFlag } from "../../../navigation/GridNavigationPathService";
import type { MovementSegment, NavigationNode } from "../../../navigation/NavigationGraph";

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
    this.moveRangeResolver = new CombatMoveRangeResolver();
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
    const navigationPathService = GridNavigationPathService.fromGridRuntime(this.runtimeContext.gridRuntime);

    const rangeResolution = this.moveRangeResolver.resolveReachableCells(
      navigationPathService,
      gridPosition.currentCell,
      combatStats.currentMp,
      gridPosition.currentStoryIndex,
      (node) => this.isBlockedNode(entityId, gridPosition.currentCell, gridPosition.currentStoryIndex, node),
      entityId
    );

    this.runtimeContext.gridRuntime.setMoveRangeNavigationCells(
      rangeResolution.reachableCells.map(({ cell, storyIndex }) => ({ cell, storyIndex }))
    );

    const pickedNavigationCell = this.runtimeContext.gridRuntime.getHoveredNavigationCell(gridPosition.currentStoryIndex);
    if (
      !pickedNavigationCell ||
      pickedNavigationCell.cell.equals(gridPosition.currentCell)
    ) {
      this.runtimeContext.gridRuntime.setMovePathNavigationCells([]);
      return;
    }
    const hoveredCell = pickedNavigationCell.cell;
    const hoveredStoryIndex = pickedNavigationCell.storyIndex;

    if (!rangeResolution.costByCellKey.has(navigationPathService.makeTargetKey(hoveredCell, hoveredStoryIndex))) {
      this.runtimeContext.gridRuntime.setMovePathNavigationCells([]);
      return;
    }

    const path = navigationPathService.findPath({
      fromCell: gridPosition.currentCell,
      fromStoryIndex: gridPosition.currentStoryIndex,
      toCell: hoveredCell,
      toStoryIndex: hoveredStoryIndex,
      activeEntityId: entityId,
      movementPoints: combatStats.currentMp,
      occupied: (node) => this.isBlockedNode(entityId, gridPosition.currentCell, gridPosition.currentStoryIndex, node)
    });
    if (!path || path.length === 0 || this.getPathCost(path) > combatStats.currentMp) {
      this.runtimeContext.gridRuntime.setMovePathNavigationCells([]);
      return;
    }

    const movePath = this.toPreviewCells(path);

    this.runtimeContext.gridRuntime.setMovePathNavigationCells(movePath);
    this.logDebugMoveRange(entityId, gridPosition, combatStats.currentMp, rangeResolution);
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

  private isBlockedNode(entityId: string, startCell: GridCell, startStoryIndex: number, node: NavigationNode): boolean {
    if (node.cell.equals(startCell) && node.storyIndex === startStoryIndex) {
      return false;
    }

    if (!this.runtimeContext?.gridRuntime.isWalkableCell(node.cell, node.storyIndex)) {
      return true;
    }

    const entitiesAtCell = this.spatialIndex.getEntitiesAt(node.cell, node.storyIndex);
    return entitiesAtCell.some((occupantEntityId) => occupantEntityId !== entityId);
  }

  private toPreviewCells(path: readonly MovementSegment[]): { readonly cell: GridCell; readonly storyIndex: number }[] {
    return path.map((segment) => ({
      cell: segment.toCell,
      storyIndex: segment.toStoryIndex
    }));
  }

  private getPathCost(path: readonly MovementSegment[]): number {
    return path.reduce((total, segment) => total + segment.cost, 0);
  }

  private logDebugMoveRange(
    entityId: string,
    gridPosition: GridPositionComponent,
    movementPoints: number,
    rangeResolution: ReturnType<CombatMoveRangeResolver["resolveReachableCells"]>
  ): void {
    if (!new RectNavigationDebugFlag().isEnabled()) {
      return;
    }

    const countsByStory = new Map<number, number>();
    for (const reachableCell of rangeResolution.reachableCells) {
      countsByStory.set(reachableCell.storyIndex, (countsByStory.get(reachableCell.storyIndex) ?? 0) + 1);
    }

    console.debug(
      `[CombatMoveRange] entity=${entityId} current=${gridPosition.currentStoryIndex}:${gridPosition.currentCell.x}:${gridPosition.currentCell.z} ` +
      `mp=${movementPoints} countByStory=${[...countsByStory.entries()].map(([story, count]) => `${story}:${count}`).join(",") || "none"} ` +
      `consideredStairs=${rangeResolution.consideredStairConnector}`
    );
  }

  private clearPreview(): void {
    this.runtimeContext?.gridRuntime.clearCombatMovementPreview();
  }
}
