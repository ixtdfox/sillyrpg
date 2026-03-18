import type { EntityManager } from "../EntityManager";
import type { System } from "../System";
import { AnimationComponent } from "../components/AnimationComponent";
import { AnimationStateComponent } from "../components/AnimationStateComponent";
import { RenderableComponent } from "../components/RenderableComponent";

/**
 * Applies logical animation state changes to Babylon animation groups.
 */
export class AnimationSystem implements System {
  private readonly entityManager: EntityManager;

  public constructor(entityManager: EntityManager) {
    this.entityManager = entityManager;
  }

  public update(_deltaSeconds: number): void {
    const entities = this.entityManager.query(AnimationComponent, AnimationStateComponent, RenderableComponent);

    for (const entity of entities) {
      const animation = entity.getComponent(AnimationComponent);
      const animationState = entity.getComponent(AnimationStateComponent);
      const desiredState = animationState.state;

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
