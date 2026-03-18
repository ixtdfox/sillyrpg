import type { EntityManager } from "../EntityManager";
import type { System } from "../System";
import { AnimationComponent } from "../components/AnimationComponent";
import { HexPathMovementComponent } from "../components/HexPathMovementComponent";

/**
 * Applies logical animation state changes to Babylon animation groups.
 */
export class AnimationSystem implements System {
  private readonly entityManager: EntityManager;

  public constructor(entityManager: EntityManager) {
    this.entityManager = entityManager;
  }

  public update(_deltaSeconds: number): void {
    const entities = this.entityManager.query(AnimationComponent, HexPathMovementComponent);

    for (const entity of entities) {
      const animation = entity.getComponent(AnimationComponent);
      const movement = entity.getComponent(HexPathMovementComponent);
      const desiredState = movement.isMoving ? "walk" : "idle";

      if (animation.activeState === desiredState) {
        continue;
      }

      const desiredGroupName = animation.stateToGroupName[desiredState];
      if (!desiredGroupName) {
        console.warn(`No animation group mapping for state '${desiredState}' on entity '${entity.getId()}'.`);
        animation.activeState = desiredState;
        continue;
      }

      if (animation.activeGroupName) {
        const previousGroup = animation.availableGroupsByName.get(animation.activeGroupName);
        previousGroup?.stop();
      }

      const nextGroup = animation.availableGroupsByName.get(desiredGroupName);
      if (!nextGroup) {
        console.warn(
          `Mapped animation group '${desiredGroupName}' not found for state '${desiredState}' on entity '${entity.getId()}'.`
        );
        animation.activeState = desiredState;
        animation.activeGroupName = null;
        continue;
      }

      nextGroup.start(true);
      animation.activeState = desiredState;
      animation.activeGroupName = desiredGroupName;
    }
  }
}
