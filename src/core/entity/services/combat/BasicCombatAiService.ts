import type { Entity } from "../../Entity";
import type { EntityManager } from "../../EntityManager";
import { CombatStatsComponent } from "../../components/CombatStatsComponent";
import { HexPathMovementComponent } from "../../components/HexPathMovementComponent";
import { HexPositionComponent } from "../../components/HexPositionComponent";
import { RelationsComponent } from "../../components/RelationsComponent";
import { VitalsComponent } from "../../components/VitalsComponent";
import { HostilityResolver } from "../HostilityResolver";
import { CombatAttackTargetingService } from "./CombatAttackTargetingService";

export type AiTurnStepResult = "in_progress" | "completed";

/**
 * Basic AI turn handler: try melee attack, else move toward nearest hostile target.
 */
export class BasicCombatAiService {
  private readonly entityManager: EntityManager;
  private readonly attackTargetingService: CombatAttackTargetingService;
  private readonly movingAiEntities: Set<string>;

  public constructor(entityManager: EntityManager, attackTargetingService: CombatAttackTargetingService) {
    this.entityManager = entityManager;
    this.attackTargetingService = attackTargetingService;
    this.movingAiEntities = new Set<string>();
  }

  public resolveTurnStep(activeAiEntityId: string, participantIds: readonly string[]): AiTurnStepResult {
    const activeAi = this.entityManager.getEntity(activeAiEntityId);
    if (!activeAi) {
      return "completed";
    }

    const movement = activeAi.tryGetComponent(HexPathMovementComponent);
    if (this.movingAiEntities.has(activeAiEntityId)) {
      if (movement?.isMoving) {
        return "in_progress";
      }

      this.movingAiEntities.delete(activeAiEntityId);
      return "completed";
    }

    const target = this.findNearestHostileTarget(activeAi, participantIds);
    if (!target) {
      console.log("[CombatAI] No hostile target found. Ending turn.");
      return "completed";
    }

    const attackResult = this.attackTargetingService.tryPerformMeleeAttack(activeAiEntityId, target.getId());
    if (attackResult.success) {
      return "completed";
    }

    const activeStats = activeAi.tryGetComponent(CombatStatsComponent);
    const activeHexPosition = activeAi.tryGetComponent(HexPositionComponent);
    const targetHexPosition = target.tryGetComponent(HexPositionComponent);

    if (!activeStats || !activeHexPosition || !targetHexPosition) {
      return "completed";
    }

    if (activeStats.currentMp <= 0 || !movement) {
      console.log(`[CombatAI] ${attackResult.reason} No MP to reposition. Ending turn.`);
      return "completed";
    }

    activeHexPosition.targetCell = targetHexPosition.currentCell;
    movement.resetPathState();
    this.movingAiEntities.add(activeAiEntityId);
    console.log("[CombatAI] Moving closer to hostile target.");
    return "in_progress";
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

      if (!HostilityResolver.isHostileTowards(activeRelations, participantId)) {
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
      const firstDistance = this.hexDistance(activeHexPosition.currentCell.q, activeHexPosition.currentCell.r, firstCell.q, firstCell.r);
      const secondDistance = this.hexDistance(activeHexPosition.currentCell.q, activeHexPosition.currentCell.r, secondCell.q, secondCell.r);
      return firstDistance - secondDistance;
    });

    return aliveHostiles[0] ?? null;
  }

  private hexDistance(aq: number, ar: number, bq: number, br: number): number {
    const dq = aq - bq;
    const dr = ar - br;
    const ds = -aq - ar - (-bq - br);
    return (Math.abs(dq) + Math.abs(dr) + Math.abs(ds)) / 2;
  }
}
