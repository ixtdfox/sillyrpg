import type { EntityManager } from "../../EntityManager";
import { IdentityComponent } from "../../components/IdentityComponent";

/**
 * Minimal attack-target flow stub for current combat UX iteration.
 */
export class CombatAttackTargetingService {
  private readonly entityManager: EntityManager;

  public constructor(entityManager: EntityManager) {
    this.entityManager = entityManager;
  }

  public tryHandleAttackSelection(attackerEntityId: string, targetEntityId: string): void {
    const attacker = this.entityManager.getEntity(attackerEntityId);
    const target = this.entityManager.getEntity(targetEntityId);
    if (!attacker || !target) {
      return;
    }

    const attackerName = attacker.tryGetComponent(IdentityComponent)?.name ?? attackerEntityId;
    const targetName = target.tryGetComponent(IdentityComponent)?.name ?? targetEntityId;
    console.log(`[CombatStub] ${attackerName} attacks ${targetName}.`);
  }
}
