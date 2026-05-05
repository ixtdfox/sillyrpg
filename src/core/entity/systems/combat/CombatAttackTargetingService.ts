import type { Entity } from "../../Entity";
import type { EntityManager } from "../../EntityManager";
import { CombatStatsComponent } from "../../components/CombatStatsComponent";
import { GridPositionComponent } from "../../components/GridPositionComponent";
import { RelationsComponent } from "../../components/RelationsComponent";
import { VitalsComponent } from "../../components/VitalsComponent";
import { AnimationComponent } from "../../components/AnimationComponent";

export interface CombatAttackResult {
  readonly success: boolean;
  readonly reason: string;
}

/**
 * Performs simple MVP melee attacks between hostile combatants.
 */
export class CombatAttackTargetingService {
  private static readonly AP_COST = 1;
  private static readonly BASE_DAMAGE = 5;

  private readonly entityManager: EntityManager;

  public constructor(entityManager: EntityManager) {
    this.entityManager = entityManager;
  }

  public tryPerformMeleeAttack(attackerEntityId: string, targetEntityId: string): CombatAttackResult {
    const attacker = this.entityManager.getEntity(attackerEntityId);
    const target = this.entityManager.getEntity(targetEntityId);

    if (!attacker || !target) {
      return { success: false, reason: "Attacker or target entity not found." };
    }

    if (!this.isValidHostileTarget(attacker, target)) {
      return { success: false, reason: "Selected target is not hostile." };
    }

    const attackerStats = attacker.tryGetComponent(CombatStatsComponent);
    if (!attackerStats || attackerStats.currentAp < CombatAttackTargetingService.AP_COST) {
      return { success: false, reason: "Not enough AP for melee attack." };
    }

    const attackerGridPosition = attacker.tryGetComponent(GridPositionComponent);
    const targetGridPosition = target.tryGetComponent(GridPositionComponent);
    const attackerCell = attackerGridPosition?.currentCell;
    const targetCell = targetGridPosition?.currentCell;
    if (!attackerCell || !targetCell || !attackerGridPosition || !targetGridPosition) {
      return { success: false, reason: "Attacker or target has no grid position." };
    }

    if (attackerGridPosition.currentStoryIndex !== targetGridPosition.currentStoryIndex) {
      return { success: false, reason: "Target is on a different story." };
    }

    if (attackerCell.distance(targetCell) > 1) {
      return { success: false, reason: "Target is out of melee range." };
    }

    const targetVitals = target.tryGetComponent(VitalsComponent);
    if (!targetVitals || targetVitals.hp.current <= 0) {
      return { success: false, reason: "Target is already down." };
    }

    attackerStats.currentAp -= CombatAttackTargetingService.AP_COST;
    targetVitals.hp.current = Math.max(0, targetVitals.hp.current - CombatAttackTargetingService.BASE_DAMAGE);
    this.requestAttackAnimation(attacker);

    return { success: true, reason: "Melee attack resolved." };
  }

  private requestAttackAnimation(attacker: Entity): void {
    const animation = attacker.tryGetComponent(AnimationComponent);
    if (!animation) {
      return;
    }

    animation.requestedOneShotState = "attack";
  }

  private isValidHostileTarget(attacker: Entity, target: Entity): boolean {
    const attackerRelations = attacker.tryGetComponent(RelationsComponent);
    if (!attackerRelations) {
      return false;
    }

    return attackerRelations.isHostileTowards(target.getId());
  }
}
