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

      if (animation.requestedOneShotState) {
        this.tryStartOneShotAnimation(animation, entity.getId(), animation.requestedOneShotState);
      }

      if (animation.activeOneShotState) {
        continue;
      }

      const desiredState = movement.isMoving ? "walk" : "idle";
      this.tryStartLoopAnimation(animation, entity.getId(), desiredState);
    }
  }

  private tryStartOneShotAnimation(animation: AnimationComponent, entityId: string, state: AnimationComponent["requestedOneShotState"]): void {
    if (state !== "attack") {
      animation.requestedOneShotState = null;
      return;
    }

    const desiredGroupName = animation.stateToGroupName[state];
    animation.requestedOneShotState = null;
    if (!desiredGroupName) {
      console.warn(`No animation group mapping for one-shot state '${state}' on entity '${entityId}'.`);
      return;
    }

    if (animation.activeGroupName) {
      const previousGroup = animation.availableGroupsByName.get(animation.activeGroupName);
      previousGroup?.stop();
    }

    const nextGroup = animation.availableGroupsByName.get(desiredGroupName);
    if (!nextGroup) {
      console.warn(`Mapped one-shot animation group '${desiredGroupName}' not found for entity '${entityId}'.`);
      animation.activeGroupName = null;
      return;
    }

    animation.activeState = state;
    animation.activeOneShotState = state;
    animation.activeGroupName = desiredGroupName;
    const endObserver = nextGroup.onAnimationGroupEndObservable.add(() => {
      if (animation.activeOneShotState !== state) {
        return;
      }

      nextGroup.onAnimationGroupEndObservable.remove(endObserver);
      animation.activeOneShotState = null;
      animation.activeState = null;
      animation.activeGroupName = null;
    });

    nextGroup.start(false);
  }

  private tryStartLoopAnimation(animation: AnimationComponent, entityId: string, desiredState: "idle" | "walk"): void {
    if (animation.activeState === desiredState) {
      return;
    }

    const desiredGroupName = animation.stateToGroupName[desiredState];
    if (!desiredGroupName) {
      console.warn(`No animation group mapping for state '${desiredState}' on entity '${entityId}'.`);
      animation.activeState = desiredState;
      return;
    }

    if (animation.activeGroupName) {
      const previousGroup = animation.availableGroupsByName.get(animation.activeGroupName);
      previousGroup?.stop();
    }

    const nextGroup = animation.availableGroupsByName.get(desiredGroupName);
    if (!nextGroup) {
      console.warn(`Mapped animation group '${desiredGroupName}' not found for state '${desiredState}' on entity '${entityId}'.`);
      animation.activeState = desiredState;
      animation.activeGroupName = null;
      return;
    }

    nextGroup.start(true);
    animation.activeState = desiredState;
    animation.activeGroupName = desiredGroupName;
  }
}
