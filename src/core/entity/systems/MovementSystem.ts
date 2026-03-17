import type { EntityManager } from "../EntityManager";
import type { System } from "../System";
import { MovementComponent } from "../components/MovementComponent";
import { TransformComponent } from "../components/TransformComponent";

/**
 * Applies movement velocity to transform components.
 */
export class MovementSystem implements System {
  private readonly entityManager: EntityManager;

  public constructor(entityManager: EntityManager) {
    this.entityManager = entityManager;
  }

  public update(deltaSeconds: number): void {
    const movingEntities = this.entityManager.query(TransformComponent, MovementComponent);

    for (const entity of movingEntities) {
      const transform = entity.getComponent(TransformComponent);
      const movement = entity.getComponent(MovementComponent);
      const delta = movement.velocity.scale(deltaSeconds);

      transform.value.addInPlace(delta);
    }
  }
}
