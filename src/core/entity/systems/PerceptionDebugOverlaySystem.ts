import { Color4, Scene as BabylonScene } from "@babylonjs/core";
import type { EntityManager } from "../EntityManager";
import type { System } from "../System";
import { PatrolComponent } from "../components/PatrolComponent";
import { VisionDebugComponent } from "../components/VisionDebugComponent";
import { GridCell } from "../../grid/GridCell";
import {
  getInGameSceneRuntimeContext,
  type InGameSceneRuntimeContext,
} from "../../scene/in-game/InGameSceneRuntimeContext";
import { WorldModeController } from "../../game/WorldModeController";

/**
 * Feeds gameplay debug state into the grid overlay runtime.
 */
export class PerceptionDebugOverlaySystem implements System {
  private readonly entityManager: EntityManager;
  private readonly worldModeController: WorldModeController;
  private runtimeContext: InGameSceneRuntimeContext | null;

  public constructor(entityManager: EntityManager, worldModeController: WorldModeController) {
    this.entityManager = entityManager;
    this.worldModeController = worldModeController;
    this.runtimeContext = null;
  }

  public setScene(scene: BabylonScene | null): void {
    this.runtimeContext = scene ? getInGameSceneRuntimeContext(scene) : null;
  }

  public update(_deltaSeconds: number): void {
    if (!this.runtimeContext) {
      return;
    }

    const gridRuntime = this.runtimeContext.gridRuntime;
    if (this.worldModeController.isTurnBased()) {
      gridRuntime.clearDebugHighlights();
      return;
    }

    if (!gridRuntime.getIsDebugEnabled()) {
      gridRuntime.clearDebugHighlights();
      return;
    }

    const visionCells = new Map<string, GridCell>();
    const patrolTargetCells = new Map<string, GridCell>();
    const detectedCells = new Map<string, { cell: GridCell; color: Color4; priority: number }>();

    const visionEntities = this.entityManager.query(VisionDebugComponent);
    for (const entity of visionEntities) {
      const visionDebug = entity.getComponent(VisionDebugComponent);

      for (const cell of visionDebug.visibleSectorCells) {
        visionCells.set(cellKey(cell), cell);
      }

      for (const detectedCell of visionDebug.detectedCells) {
        const color = relationToColor(detectedCell.relation);
        const priority = relationPriority(detectedCell.relation);
        const key = cellKey(detectedCell.cell);
        const existing = detectedCells.get(key);

        if (!existing || priority >= existing.priority) {
          detectedCells.set(key, {
            cell: detectedCell.cell,
            color,
            priority,
          });
        }
      }
    }

    const patrolEntities = this.entityManager.query(PatrolComponent);
    for (const entity of patrolEntities) {
      const patrolTarget = entity.getComponent(PatrolComponent).currentPatrolTargetCell;
      if (!patrolTarget) {
        continue;
      }
      patrolTargetCells.set(cellKey(patrolTarget), patrolTarget);
    }

    gridRuntime.setVisionCells(Array.from(visionCells.values()));
    gridRuntime.setPatrolTargetCells(Array.from(patrolTargetCells.values()));
    gridRuntime.setDetectedCells(Array.from(detectedCells.values()).map(({ cell, color }) => ({ cell, color })));
  }
}

function cellKey(cell: GridCell): string {
  return `${cell.x}:${cell.z}`;
}

function relationToColor(relation: "friendly" | "neutral" | "hostile"): Color4 {
  switch (relation) {
    case "friendly":
      return new Color4(0.28, 0.88, 0.4, 0.66);
    case "hostile":
      return new Color4(0.97, 0.3, 0.24, 0.66);
    case "neutral":
    default:
      return new Color4(0.95, 0.84, 0.25, 0.66);
  }
}

function relationPriority(relation: "friendly" | "neutral" | "hostile"): number {
  switch (relation) {
    case "hostile":
      return 3;
    case "friendly":
      return 2;
    case "neutral":
    default:
      return 1;
  }
}
