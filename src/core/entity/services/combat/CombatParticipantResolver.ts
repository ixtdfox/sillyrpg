import type { EntityManager } from "../../EntityManager";
import { CombatStatsComponent } from "../../components/CombatStatsComponent";
import { HexPositionComponent } from "../../components/HexPositionComponent";
import { RelationsComponent } from "../../components/RelationsComponent";
import { VitalsComponent } from "../../components/VitalsComponent";
import { HostilityResolver } from "../HostilityResolver";

/**
 * Selects alive combat-ready entities for a newly started encounter.
 */
export class CombatParticipantResolver {
  private readonly entityManager: EntityManager;

  public constructor(entityManager: EntityManager) {
    this.entityManager = entityManager;
  }

  public resolveParticipants(initiatorEntityId: string, targetEntityId: string): string[] {
    const allCandidates = this.entityManager.query(CombatStatsComponent, VitalsComponent, HexPositionComponent, RelationsComponent);

    const participants = allCandidates.filter((entity) => {
      const vitals = entity.getComponent(VitalsComponent);
      if (vitals.hp.current <= 0) {
        return false;
      }

      const entityId = entity.getId();
      if (entityId === initiatorEntityId || entityId === targetEntityId) {
        return true;
      }

      return this.hasHostileRelationshipWith(entityId, initiatorEntityId)
        || this.hasHostileRelationshipWith(entityId, targetEntityId)
        || this.hasHostileRelationshipWith(initiatorEntityId, entityId)
        || this.hasHostileRelationshipWith(targetEntityId, entityId);
    });

    return participants
      .sort((a, b) => {
        const aInitiative = a.getComponent(CombatStatsComponent).initiative;
        const bInitiative = b.getComponent(CombatStatsComponent).initiative;
        return bInitiative - aInitiative;
      })
      .map((entity) => entity.getId());
  }

  private hasHostileRelationshipWith(observerEntityId: string, targetEntityId: string): boolean {
    const observerEntity = this.entityManager.getEntity(observerEntityId);
    if (!observerEntity || !observerEntity.hasComponent(RelationsComponent)) {
      return false;
    }

    return HostilityResolver.isHostileTowards(observerEntity.getComponent(RelationsComponent), targetEntityId);
  }
}
