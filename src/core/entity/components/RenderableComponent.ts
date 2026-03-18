import { Vector3 } from "@babylonjs/core";
import type { Component } from "../Component";

/**
 * Thin render-side binding for an entity.
 */
export interface RenderTransformBinding {
  /** Runtime transform whose position is synchronized from ECS data. */
  position: Vector3;

  /** Runtime transform whose rotation is synchronized from ECS data. */
  rotation: Vector3;
}

/**
 * Stores a render transform reference for ECS synchronization.
 */
export class RenderableComponent implements Component {
  public readonly binding: RenderTransformBinding;

  public constructor(binding: RenderTransformBinding) {
    this.binding = binding;
  }
}
