import { Scene as BabylonScene } from "@babylonjs/core";
import type { Entity } from "../../Entity";
import type { EntityManager } from "../../EntityManager";
import { CombatStatsComponent } from "../../components/CombatStatsComponent";
import { HexPathMovementComponent } from "../../components/HexPathMovementComponent";
import { HexPositionComponent } from "../../components/HexPositionComponent";
import { RelationsComponent } from "../../components/RelationsComponent";
import { VitalsComponent } from "../../components/VitalsComponent";
import { HexCell } from "../../../hex/HexCell";
import { HexPathfinder } from "../../../hex/HexPathfinder";
import { getInGameSceneRuntimeContext, type InGameSceneRuntimeContext } from "../../../scene/in-game/InGameSceneRuntimeContext";
import { CombatAttackTargetingService } from "./CombatAttackTargetingService";
import { CombatMoveRangeResolver } from "./CombatMoveRangeResolver";
import { HexMovementCostResolver } from "../hex/HexMovementCostResolver";
import { HexSpatialIndex } from "../hex/HexSpatialIndex";

export type AiTurnStepResult = "in_progress" | "completed";
type AiTurnPhase = "deciding" | "moving";

interface AiTurnContext {
  phase: AiTurnPhase;
  targetEntityId: string;
}

/**
 * Basic AI turn handler: try melee attack, else move toward nearest hostile target.
 */
export class BasicCombatAiService {
  private readonly entityManager: EntityManager;
  private readonly attackTargetingService: CombatAttackTargetingService;
  private readonly spatialIndex: HexSpatialIndex;
  private readonly moveRangeResolver: CombatMoveRangeResolver;
  private readonly aiTurnContextByEntityId: Map<string, AiTurnContext>;
  private runtimeContext: InGameSceneRuntimeContext | null;

  public constructor(
    entityManager: EntityManager,
    attackTargetingService: CombatAttackTargetingService,
    spatialIndex: HexSpatialIndex,
    movementCostResolver: HexMovementCostResolver
  ) {
    this.entityManager = entityManager;
    this.attackTargetingService = attackTargetingService;
    this.spatialIndex = spatialIndex;
    this.moveRangeResolver = new CombatMoveRangeResolver(movementCostResolver);
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

    const approachCell = this.resolveApproachCell(
      activeAi.getId(),
      activeHexPosition.currentCell,
      targetHexPosition.currentCell,
      activeStats.currentMp
    );
    if (!approachCell) {
      return false;
    }

    activeHexPosition.targetCell = approachCell;
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

  private resolveApproachCell(activeAiEntityId: string, activeCell: HexCell, targetCell: HexCell, movementPoints: number): HexCell | null {
    const grid = this.runtimeContext?.hexGridRuntime.getGrid();
    if (!grid || movementPoints <= 0) {
      return null;
    }

    const isBlockedCell = (cell: HexCell): boolean => {
      if (cell.equals(activeCell)) {
        return false;
      }

      const occupants = this.spatialIndex.getEntitiesAt(cell);
      return occupants.some((occupantId) => occupantId !== activeAiEntityId);
    };

    const pathfinder = new HexPathfinder(grid, isBlockedCell);
    const rangeResolution = this.moveRangeResolver.resolveReachableCells(grid, activeCell, movementPoints, isBlockedCell);
    const reachableByKey = new Set(rangeResolution.reachableCells.map((cell) => this.cellKey(cell)));
    reachableByKey.delete(this.cellKey(activeCell));

    if (reachableByKey.size === 0) {
      return null;
    }

    const attackAdjacentCells = grid
      .getNeighbors(targetCell)
      .filter((cell) => grid.contains(cell))
      .filter((cell) => !isBlockedCell(cell));

    const reachableAttackCells = attackAdjacentCells
      .filter((cell) => reachableByKey.has(this.cellKey(cell)))
      .sort((first, second) => activeCell.distance(first) - activeCell.distance(second));

    if (reachableAttackCells.length > 0) {
      return reachableAttackCells[0] ?? null;
    }

    let bestPartialCell: HexCell | null = null;
    let bestPartialDistance = Number.POSITIVE_INFINITY;

    for (const attackCell of attackAdjacentCells) {
      const path = pathfinder.findPath(activeCell, attackCell);
      if (!path || path.length < 2) {
        continue;
      }

      for (let index = path.length - 1; index >= 1; index -= 1) {
        const candidate = path[index];
        if (!reachableByKey.has(this.cellKey(candidate))) {
          continue;
        }

        const candidateDistance = candidate.distance(targetCell);
        if (candidateDistance < bestPartialDistance) {
          bestPartialDistance = candidateDistance;
          bestPartialCell = candidate;
        }

        break;
      }
    }

    return bestPartialCell;
  }

  private cellKey(cell: HexCell): string {
    return `${cell.q}:${cell.r}`;
  }
}
