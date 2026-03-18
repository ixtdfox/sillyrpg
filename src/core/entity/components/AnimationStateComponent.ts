import type { Component } from "../Component";

/**
 * Logical animation states driven by gameplay state.
 *
 * Keep this union small for now and extend as needed (attack/hit/dead/etc).
 */
export type AnimationState = "idle" | "walk";

/**
 * Stores desired logical animation state for an entity.
 */
export class AnimationStateComponent implements Component {
  public state: AnimationState;

  public constructor(initialState: AnimationState = "idle") {
    this.state = initialState;
  }
}
