import type { Relations } from "../components/Relations";
import { RelationsComponent } from "../components/RelationsComponent";

/**
 * Centralized hostility rules for perception and AI systems.
 */
export class HostilityResolver {
  /**
   * Returns true when observer has a hostile relationship toward target id.
   */
  public static isHostileTowards(observerRelations: RelationsComponent, targetEntityId: string): boolean {
    return HostilityResolver.isHostileRelationship(observerRelations.relationships[targetEntityId]);
  }

  /**
   * MVP hostility rule: any relationship with positive hate is hostile.
   */
  public static isHostileRelationship(relationship: Relations | null | undefined): boolean {
    return Boolean(relationship && relationship.hate > 0);
  }
}
