import type { Entity } from "../../Entity";
import type { EntityManager } from "../../EntityManager";
import { CombatStatsComponent } from "../../components/CombatStatsComponent";
import { HexPathMovementComponent } from "../../components/HexPathMovementComponent";
import { HexPositionComponent } from "../../components/HexPositionComponent";
import { RelationsComponent } from "../../components/RelationsComponent";
import { VitalsComponent } from "../../components/VitalsComponent";
import { HexCell } from "../../../hex/HexCell";
import { CombatAttackTargetingService } from "./CombatAttackTargetingService";
import { HexSpatialIndex } from "../hex/HexSpatialIndex";

export type AiTurnStepResult = "in_progress" | "completed";
type AiTurnPhase = "deciding" | "moving" | "post_move_attack";

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
  private readonly aiTurnContextByEntityId: Map<string, AiTurnContext>;

  public constructor(
    entityManager: EntityManager,
    attackTargetingService: CombatAttackTargetingService,
    spatialIndex: HexSpatialIndex
  ) {
    this.entityManager = entityManager;
    this.attackTargetingService = attackTargetingService;
    this.spatialIndex = spatialIndex;
    this.aiTurnContextByEntityId = new Map<string, AiTurnContext>();
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
        return this.resolveDecidingPhase(activeAiEntityId, activeAi, target);
      case "moving":
        return this.resolveMovingPhase(activeAiEntityId, activeAi);
      case "post_move_attack":
        return this.resolvePostMoveAttackPhase(activeAiEntityId, target);
      default:
        this.aiTurnContextByEntityId.delete(activeAiEntityId);
        return "completed";
    }
  }

  private resolveDecidingPhase(activeAiEntityId: string, activeAi: Entity, target: Entity): AiTurnStepResult {
    if (this.tryAttack(activeAiEntityId, target.getId())) {
      this.aiTurnContextByEntityId.delete(activeAiEntityId);
      return "completed";
    }

    if (!this.tryMoveTowardsTarget(activeAiEntityId, activeAi, target)) {
      this.aiTurnContextByEntityId.delete(activeAiEntityId);
      return "completed";
    }

    const context = this.aiTurnContextByEntityId.get(activeAiEntityId);
    if (!context) {
      return "completed";
    }

    const movement = activeAi.tryGetComponent(HexPathMovementComponent);
    context.phase = movement?.isMoving ? "moving" : "post_move_attack";
    return "in_progress";
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

    context.phase = "post_move_attack";
    return "in_progress";
  }

  private resolvePostMoveAttackPhase(activeAiEntityId: string, target: Entity): AiTurnStepResult {
    this.tryAttack(activeAiEntityId, target.getId());
    this.aiTurnContextByEntityId.delete(activeAiEntityId);
    return "completed";
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

    const approachCell = this.resolveApproachCell(activeAi.getId(), activeHexPosition.currentCell, targetHexPosition.currentCell);
    if (!approachCell) {
      return false;
    }

    activeHexPosition.targetCell = approachCell;
    movement.resetPathState();
    return true;
  }

  private resolveTurnTarget(activeAi: Entity, participantIds: readonly string[], preferredTargetId?: string): Entity | null {
    if (preferredTargetId) {
      const preferredTarget = this.entityManager.getEntity(preferredTargetId);
      const preferredTargetVitals = preferredTarget?.tryGetComponent(VitalsComponent);
      if (preferredTarget && preferredTargetVitals && preferredTargetVitals.hp.current > 0) {
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

  private resolveApproachCell(activeAiEntityId: string, activeCell: HexCell, targetCell: HexCell): HexCell | null {
    const candidateCells = [
      new HexCell(targetCell.q + 1, targetCell.r),
      new HexCell(targetCell.q - 1, targetCell.r),
      new HexCell(targetCell.q, targetCell.r + 1),
      new HexCell(targetCell.q, targetCell.r - 1),
      new HexCell(targetCell.q + 1, targetCell.r - 1),
      new HexCell(targetCell.q - 1, targetCell.r + 1),
    ];

    const unoccupiedCandidates = candidateCells.filter((cell) => {
      const occupants = this.spatialIndex.getEntitiesAt(cell);
      return occupants.length === 0 || occupants.every((occupantId) => occupantId === activeAiEntityId);
    });

    if (unoccupiedCandidates.length === 0) {
      return null;
    }

    unoccupiedCandidates.sort((first, second) => {
      const firstDistance = activeCell.distance(first);
      const secondDistance = activeCell.distance(second);
      return firstDistance - secondDistance;
    });

    return unoccupiedCandidates[0] ?? null;
  }
}
