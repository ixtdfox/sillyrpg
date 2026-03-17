/**
 * Basic contract for ECS update systems.
 */
export interface System {
  update(deltaSeconds: number): void;
}
