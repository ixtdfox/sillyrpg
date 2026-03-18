import type { EntityManager } from "../EntityManager";
import type { System } from "../System";
import { AnimationStateComponent } from "../components/AnimationStateComponent";
import { HexPathMovementComponent } from "../components/HexPathMovementComponent";

/**
 * Derives desired animation state from gameplay movement state.
 */
export class AnimationStateSystem implements System {
  private readonly entityManager: EntityManager;

  public constructor(entityManager: EntityManager) {
    this.entityManager = entityManager;
  }

  public update(_deltaSeconds: number): void {
    const entities = this.entityManager.query(HexPathMovementComponent, AnimationStateComponent);

    for (const entity of entities) {
      const movement = entity.getComponent(HexPathMovementComponent);
      const animationState = entity.getComponent(AnimationStateComponent);
      animationState.state = movement.isMoving ? "walk" : "idle";
    }
  }
}
