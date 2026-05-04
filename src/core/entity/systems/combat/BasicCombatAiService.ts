import { Scene as BabylonScene } from "@babylonjs/core";
import type { Entity } from "../../Entity";
import type { EntityManager } from "../../EntityManager";
import { CombatStatsComponent } from "../../components/CombatStatsComponent";
import { HexPathMovementComponent } from "../../components/HexPathMovementComponent";
import { HexPositionComponent } from "../../components/HexPositionComponent";
import { RelationsComponent } from "../../components/RelationsComponent";
import { VitalsComponent } from "../../components/VitalsComponent";
import { HexCell } from "../../../hex/HexCell";
import { MultiFloorPathfinder } from "../../../navigation/MultiFloorPathfinder";
import { NavigationGraph, type MovementSegment, type NavigationNode } from "../../../navigation/NavigationGraph";
import { getInGameSceneRuntimeContext, type InGameSceneRuntimeContext } from "../../../scene/in-game/InGameSceneRuntimeContext";
import { CombatAttackTargetingService } from "./CombatAttackTargetingService";
import { HexSpatialIndex } from "../hex/HexSpatialIndex";

export type AiTurnStepResult = "in_progress" | "completed";
type AiTurnPhase = "deciding" | "moving";

interface AiTurnContext {
  phase: AiTurnPhase;
  targetEntityId: string;
}

interface ApproachTarget {
  readonly cell: HexCell;
  readonly storyIndex: number;
}

interface ApproachPathOption {
  readonly finalTarget: ApproachTarget;
  readonly selectedTarget: ApproachTarget;
  readonly totalCost: number;
  readonly selectedCost: number;
  readonly isComplete: boolean;
}

/**
 * Basic AI turn handler: try melee attack, else move toward nearest hostile target.
 */
export class BasicCombatAiService {
  private readonly entityManager: EntityManager;
  private readonly attackTargetingService: CombatAttackTargetingService;
  private readonly spatialIndex: HexSpatialIndex;
  private readonly aiTurnContextByEntityId: Map<string, AiTurnContext>;
  private runtimeContext: InGameSceneRuntimeContext | null;

  public constructor(
    entityManager: EntityManager,
    attackTargetingService: CombatAttackTargetingService,
    spatialIndex: HexSpatialIndex
  ) {
    this.entityManager = entityManager;
    this.attackTargetingService = attackTargetingService;
    this.spatialIndex = spatialIndex;
    this.aiTurnContextByEntityId = new Map<string, AiTurnContext>();
    this.runtimeContext = null;
  }

  public setScene(scene: BabylonScene | null): void {
    this.runtimeContext = scene ? getInGameSceneRuntimeContext(scene) : null;
    if (!scene) {
      this.clearAllTurnStates();
    }
  }

  public resolveTurnStep(activeAiEntityId: string, participantIds: readonly string[]): AiTurnStepResult {
    const activeAi = this.entityManager.getEntity(activeAiEntityId);
    if (!activeAi) {
      this.aiTurnContextByEntityId.delete(activeAiEntityId);
      return "completed";
    }

    const existingContext = this.aiTurnContextByEntityId.get(activeAiEntityId);
    const target = this.resolveTurnTarget(activeAi, participantIds, existingContext?.targetEntityId);
    if (!target) {
      this.aiTurnContextByEntityId.delete(activeAiEntityId);
      return "completed";
    }

    const context: AiTurnContext = existingContext ?? { phase: "deciding", targetEntityId: target.getId() };
    context.targetEntityId = target.getId();
    this.aiTurnContextByEntityId.set(activeAiEntityId, context);

    switch (context.phase) {
      case "deciding":
        return this.resolveDecidingPhase(activeAiEntityId, activeAi, target, participantIds);
      case "moving":
        return this.resolveMovingPhase(activeAiEntityId, activeAi);
      default:
        this.aiTurnContextByEntityId.delete(activeAiEntityId);
        return "completed";
    }
  }

  private resolveDecidingPhase(
    activeAiEntityId: string,
    activeAi: Entity,
    target: Entity,
    participantIds: readonly string[]
  ): AiTurnStepResult {
    return this.runDecisionLoop(activeAiEntityId, activeAi, target, participantIds);
  }

  private resolveMovingPhase(activeAiEntityId: string, activeAi: Entity): AiTurnStepResult {
    const context = this.aiTurnContextByEntityId.get(activeAiEntityId);
    if (!context) {
      return "completed";
    }

    const movement = activeAi.tryGetComponent(HexPathMovementComponent);
    if (!movement) {
      this.aiTurnContextByEntityId.delete(activeAiEntityId);
      return "completed";
    }

    if (movement.isMoving) {
      return "in_progress";
    }

    context.phase = "deciding";
    return "in_progress";
  }

  private tryAttack(attackerEntityId: string, targetEntityId: string): boolean {
    const attackResult = this.attackTargetingService.tryPerformMeleeAttack(attackerEntityId, targetEntityId);
    return attackResult.success;
  }

  private tryMoveTowardsTarget(activeAiEntityId: string, activeAi: Entity, target: Entity): boolean {
    const activeStats = activeAi.tryGetComponent(CombatStatsComponent);
    const activeHexPosition = activeAi.tryGetComponent(HexPositionComponent);
    const targetHexPosition = target.tryGetComponent(HexPositionComponent);
    const movement = activeAi.tryGetComponent(HexPathMovementComponent);

    if (!activeStats || !activeHexPosition || !targetHexPosition || !movement || activeStats.currentMp <= 0) {
      return false;
    }

    const approachTarget = this.resolveApproachTarget(
      activeAiEntityId,
      activeHexPosition.currentCell,
      activeHexPosition.currentStoryIndex,
      targetHexPosition.currentCell,
      targetHexPosition.currentStoryIndex,
      activeStats.currentMp
    );
    if (!approachTarget) {
      return false;
    }

    activeHexPosition.targetCell = approachTarget.cell;
    activeHexPosition.targetStoryIndex = approachTarget.storyIndex;
    movement.resetPathState();
    return true;
  }

  private runDecisionLoop(
    activeAiEntityId: string,
    activeAi: Entity,
    fallbackTarget: Entity,
    participantIds: readonly string[]
  ): AiTurnStepResult {
    const MAX_ACTIONS_PER_DECISION = 12;
    let target: Entity | null = fallbackTarget;

    for (let step = 0; step < MAX_ACTIONS_PER_DECISION; step += 1) {
      target = this.resolveTurnTarget(activeAi, participantIds, target?.getId());
      if (!target || !this.isTargetAlive(target)) {
        this.aiTurnContextByEntityId.delete(activeAiEntityId);
        return "completed";
      }

      if (this.tryAttack(activeAiEntityId, target.getId())) {
        continue;
      }

      if (this.tryMoveTowardsTarget(activeAiEntityId, activeAi, target)) {
        const context = this.aiTurnContextByEntityId.get(activeAiEntityId);
        if (context) {
          context.phase = "moving";
        }

        return "in_progress";
      }

      this.aiTurnContextByEntityId.delete(activeAiEntityId);
      return "completed";
    }

    this.aiTurnContextByEntityId.delete(activeAiEntityId);
    return "completed";
  }

  private resolveTurnTarget(activeAi: Entity, participantIds: readonly string[], preferredTargetId?: string): Entity | null {
    if (preferredTargetId) {
      const preferredTarget = this.entityManager.getEntity(preferredTargetId);
      if (preferredTarget && this.isTargetAlive(preferredTarget)) {
        return preferredTarget;
      }
    }

    return this.findNearestHostileTarget(activeAi, participantIds);
  }

  public clearTurnState(entityId: string): void {
    this.aiTurnContextByEntityId.delete(entityId);
  }

  public clearAllTurnStates(): void {
    this.aiTurnContextByEntityId.clear();
  }

  private isTargetAlive(target: Entity): boolean {
    const vitals = target.tryGetComponent(VitalsComponent);
    return Boolean(vitals && vitals.hp.current > 0);
  }

  private findNearestHostileTarget(activeAi: Entity, participantIds: readonly string[]): Entity | null {
    const activeRelations = activeAi.tryGetComponent(RelationsComponent);
    const activeHexPosition = activeAi.tryGetComponent(HexPositionComponent);

    if (!activeRelations || !activeHexPosition) {
      return null;
    }

    const aliveHostiles: Entity[] = [];

    for (const participantId of participantIds) {
      if (participantId === activeAi.getId()) {
        continue;
      }

      const participant = this.entityManager.getEntity(participantId);
      if (!participant) {
        continue;
      }

      if (!activeRelations.isHostileTowards(participantId)) {
        continue;
      }

      const vitals = participant.tryGetComponent(VitalsComponent);
      if (!vitals || vitals.hp.current <= 0) {
        continue;
      }

      if (!participant.hasComponent(HexPositionComponent)) {
        continue;
      }

      aliveHostiles.push(participant);
    }

    if (aliveHostiles.length === 0) {
      return null;
    }

    aliveHostiles.sort((first, second) => {
      const firstCell = first.getComponent(HexPositionComponent).currentCell;
      const secondCell = second.getComponent(HexPositionComponent).currentCell;
      const firstDistance = activeHexPosition.currentCell.distance(firstCell);
      const secondDistance = activeHexPosition.currentCell.distance(secondCell);
      return firstDistance - secondDistance;
    });

    return aliveHostiles[0] ?? null;
  }

  private resolveApproachTarget(
    activeAiEntityId: string,
    activeCell: HexCell,
    activeStoryIndex: number,
    targetCell: HexCell,
    targetStoryIndex: number,
    movementPoints: number
  ): ApproachTarget | null {
    if (!this.runtimeContext || movementPoints <= 0) {
      return null;
    }

    const grid = this.runtimeContext.hexGridRuntime.getGrid();
    const registry = this.runtimeContext.hexGridRuntime.getBuildingNavigationRegistry();
    const graph = new NavigationGraph(
      grid,
      registry.getStairConnectors(),
      this.runtimeContext.hexGridRuntime.getMergedStoryYByStory(),
      (cell, storyIndex) => this.runtimeContext?.hexGridRuntime.isWalkableCell(cell, storyIndex) ?? false,
      (fromCell, toCell, storyIndex) =>
        this.runtimeContext?.hexGridRuntime.isNavigationEdgeBlocked(fromCell, toCell, storyIndex) ?? false,
      (cell, storyIndex) => this.runtimeContext?.hexGridRuntime.getMovementCost(cell, storyIndex) ?? 1
    );
    const pathfinder = new MultiFloorPathfinder(graph, registry.getShowStairNavigationDebug());
    const isOccupiedByOtherEntity = (node: NavigationNode): boolean => {
      if (node.cell.equals(activeCell) && node.storyIndex === activeStoryIndex) {
        return false;
      }

      return this.isOccupiedByOtherEntity(activeAiEntityId, node.cell, node.storyIndex);
    };

    const attackAdjacentTargets = grid
      .getNeighbors(targetCell)
      .filter((cell) => grid.contains(cell))
      .filter((cell) => this.runtimeContext?.hexGridRuntime.isWalkableCell(cell, targetStoryIndex) ?? false)
      .map((cell): ApproachTarget => ({ cell, storyIndex: targetStoryIndex }))
      .filter((candidate) => {
        if (candidate.cell.equals(activeCell) && candidate.storyIndex === activeStoryIndex) {
          return false;
        }

        return !this.isOccupiedByOtherEntity(activeAiEntityId, candidate.cell, candidate.storyIndex);
      });

    let bestCompleteOption: ApproachPathOption | null = null;
    let bestPartialOption: ApproachPathOption | null = null;

    for (const attackTarget of attackAdjacentTargets) {
      const path = pathfinder.findPath({
        fromCell: activeCell,
        fromStoryIndex: activeStoryIndex,
        toCell: attackTarget.cell,
        toStoryIndex: attackTarget.storyIndex,
        occupied: isOccupiedByOtherEntity
      });

      if (!path || path.length === 0) {
        continue;
      }

      const totalCost = this.getPathCost(path);
      const completeOption = this.resolvePathOption(attackTarget, path, totalCost, movementPoints);
      if (!completeOption) {
        continue;
      }

      if (completeOption.isComplete) {
        if (!bestCompleteOption || this.compareCompleteOptions(completeOption, bestCompleteOption, activeCell) < 0) {
          bestCompleteOption = completeOption;
        }

        continue;
      }

      if (!bestPartialOption || this.comparePartialOptions(completeOption, bestPartialOption, targetCell) < 0) {
        bestPartialOption = completeOption;
      }
    }

    const selectedOption = bestCompleteOption ?? bestPartialOption;
    console.debug("[BasicCombatAiService] AI approach", {
      activeAiEntityId,
      fromStory: activeStoryIndex,
      fromCell: `${activeCell.q}:${activeCell.r}`,
      targetStory: targetStoryIndex,
      targetCell: `${targetCell.q}:${targetCell.r}`,
      selectedStory: selectedOption?.selectedTarget.storyIndex,
      selectedCell: selectedOption ? `${selectedOption.selectedTarget.cell.q}:${selectedOption.selectedTarget.cell.r}` : null
    });

    return selectedOption?.selectedTarget ?? null;
  }

  private resolvePathOption(
    finalTarget: ApproachTarget,
    path: readonly MovementSegment[],
    totalCost: number,
    movementPoints: number
  ): ApproachPathOption | null {
    if (totalCost <= movementPoints) {
      return {
        finalTarget,
        selectedTarget: finalTarget,
        totalCost,
        selectedCost: totalCost,
        isComplete: true
      };
    }

    let spentCost = 0;
    let selectedTarget: ApproachTarget | null = null;

    for (const segment of path) {
      const nextCost = spentCost + segment.cost;
      if (nextCost > movementPoints) {
        break;
      }

      spentCost = nextCost;
      selectedTarget = this.getSegmentTarget(segment);
    }

    if (!selectedTarget) {
      return null;
    }

    return {
      finalTarget,
      selectedTarget,
      totalCost,
      selectedCost: spentCost,
      isComplete: false
    };
  }

  private getPathCost(path: readonly MovementSegment[]): number {
    return path.reduce((total, segment) => total + segment.cost, 0);
  }

  private getSegmentTarget(segment: MovementSegment): ApproachTarget {
    if (segment.kind === "walk") {
      return {
        cell: segment.cell,
        storyIndex: segment.storyIndex
      };
    }

    return {
      cell: segment.toCell,
      storyIndex: segment.toStoryIndex
    };
  }

  private compareCompleteOptions(first: ApproachPathOption, second: ApproachPathOption, activeCell: HexCell): number {
    const costDelta = first.totalCost - second.totalCost;
    if (costDelta !== 0) {
      return costDelta;
    }

    return activeCell.distance(first.finalTarget.cell) - activeCell.distance(second.finalTarget.cell);
  }

  private comparePartialOptions(first: ApproachPathOption, second: ApproachPathOption, targetCell: HexCell): number {
    const progressDelta = second.selectedCost - first.selectedCost;
    if (progressDelta !== 0) {
      return progressDelta;
    }

    const distanceDelta = first.selectedTarget.cell.distance(targetCell) - second.selectedTarget.cell.distance(targetCell);
    if (distanceDelta !== 0) {
      return distanceDelta;
    }

    return first.totalCost - second.totalCost;
  }

  private isOccupiedByOtherEntity(activeAiEntityId: string, cell: HexCell, storyIndex: number): boolean {
    const occupants = this.spatialIndex.getEntitiesAt(cell, storyIndex);
    return occupants.some((occupantId) => occupantId !== activeAiEntityId);
  }
}
