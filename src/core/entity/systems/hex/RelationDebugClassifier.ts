import type { Relations } from "../../components/Relations";
import { RelationsComponent } from "../../components/RelationsComponent";
import { HostilityResolver } from "./HostilityResolver";
import type { VisionDebugRelation } from "../../components/VisionDebugComponent";

/**
 * Classifies relation sentiment buckets for debug coloring.
 */
export class RelationDebugClassifier {
  public static classify(observerRelations: RelationsComponent, targetEntityId: string): VisionDebugRelation {
    if (HostilityResolver.isHostileTowards(observerRelations, targetEntityId)) {
      return "hostile";
    }

    const relationship = observerRelations.relationships[targetEntityId];
    if (RelationDebugClassifier.isFriendlyRelationship(relationship)) {
      return "friendly";
    }

    return "neutral";
  }

  private static isFriendlyRelationship(relationship: Relations | null | undefined): boolean {
    if (!relationship) {
      return false;
    }

    return relationship.love > 0 || relationship.affection > 0 || relationship.trust > 0;
  }
}
