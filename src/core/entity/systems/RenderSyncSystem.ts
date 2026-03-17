import type { EntityManager } from "../EntityManager";
import type { System } from "../System";
import { TransformComponent } from "../components/TransformComponent";
import { RenderableComponent } from "../components/RenderableComponent";

/**
 * Synchronizes ECS transform data into render transforms.
 */
export class RenderSyncSystem implements System {
  private readonly entityManager: EntityManager;

  public constructor(entityManager: EntityManager) {
    this.entityManager = entityManager;
  }

  public update(_deltaSeconds: number): void {
    const renderableEntities = this.entityManager.query(TransformComponent, RenderableComponent);

    for (const entity of renderableEntities) {
      const transform = entity.getComponent(TransformComponent);
      const renderable = entity.getComponent(RenderableComponent);

      renderable.binding.position.copyFrom(transform.value);
      renderable.binding.rotation.copyFrom(transform.rotation);
    }
  }
}
