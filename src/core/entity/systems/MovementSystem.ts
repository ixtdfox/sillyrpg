import type { EntityManager } from "../EntityManager";
import type { System } from "../System";
import { MovementComponent } from "../components/MovementComponent";
import { PositionComponent } from "../components/PositionComponent";

/**
 * Applies movement velocity to position components.
 */
export class MovementSystem implements System {
  private readonly entityManager: EntityManager;

  public constructor(entityManager: EntityManager) {
    this.entityManager = entityManager;
  }

  public update(deltaSeconds: number): void {
    const movingEntities = this.entityManager.query(PositionComponent, MovementComponent);

    for (const entity of movingEntities) {
      const position = entity.getComponent(PositionComponent);
      const movement = entity.getComponent(MovementComponent);
      const delta = movement.velocity.scale(deltaSeconds);

      position.value.addInPlace(delta);
    }
  }
}
