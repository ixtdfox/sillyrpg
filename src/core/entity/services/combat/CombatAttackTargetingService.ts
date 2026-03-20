import type { Entity } from "../../Entity";
import type { EntityManager } from "../../EntityManager";
import { CombatStatsComponent } from "../../components/CombatStatsComponent";
import { HexPositionComponent } from "../../components/HexPositionComponent";
import { IdentityComponent } from "../../components/IdentityComponent";
import { RelationsComponent } from "../../components/RelationsComponent";
import { VitalsComponent } from "../../components/VitalsComponent";
import { HostilityResolver } from "../HostilityResolver";

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

    const attackerCell = attacker.tryGetComponent(HexPositionComponent)?.currentCell;
    const targetCell = target.tryGetComponent(HexPositionComponent)?.currentCell;
    if (!attackerCell || !targetCell) {
      return { success: false, reason: "Attacker or target has no hex position." };
    }

    if (this.hexDistance(attackerCell.q, attackerCell.r, targetCell.q, targetCell.r) > 1) {
      return { success: false, reason: "Target is out of melee range." };
    }

    const targetVitals = target.tryGetComponent(VitalsComponent);
    if (!targetVitals || targetVitals.hp.current <= 0) {
      return { success: false, reason: "Target is already down." };
    }

    attackerStats.currentAp -= CombatAttackTargetingService.AP_COST;
    targetVitals.hp.current = Math.max(0, targetVitals.hp.current - CombatAttackTargetingService.BASE_DAMAGE);

    const attackerName = attacker.tryGetComponent(IdentityComponent)?.name ?? attackerEntityId;
    const targetName = target.tryGetComponent(IdentityComponent)?.name ?? targetEntityId;
    console.log(
      `[Combat] ${attackerName} hits ${targetName} for ${CombatAttackTargetingService.BASE_DAMAGE}. `
      + `HP: ${targetVitals.hp.current}/${targetVitals.hp.max}`
    );

    return { success: true, reason: "Melee attack resolved." };
  }

  private isValidHostileTarget(attacker: Entity, target: Entity): boolean {
    const attackerRelations = attacker.tryGetComponent(RelationsComponent);
    if (!attackerRelations) {
      return false;
    }

    return HostilityResolver.isHostileTowards(attackerRelations, target.getId());
  }

  private hexDistance(aq: number, ar: number, bq: number, br: number): number {
    const dq = aq - bq;
    const dr = ar - br;
    const ds = -aq - ar - (-bq - br);
    return (Math.abs(dq) + Math.abs(dr) + Math.abs(ds)) / 2;
  }
}
