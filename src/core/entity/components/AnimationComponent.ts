import type { AnimationGroup } from "@babylonjs/core";
import type { Component } from "../Component";

export type AnimationState = "idle" | "walk" | "attack";

/**
 * Binds logical animation states to Babylon animation groups.
 */
export class AnimationComponent implements Component {
  /** Mapping from logical state to source animation group name. */
  public readonly stateToGroupName: Partial<Record<AnimationState, string>>;

  /** Available imported animation groups indexed by name. */
  public readonly availableGroupsByName: ReadonlyMap<string, AnimationGroup>;

  /** Last logical state applied by AnimationSystem. */
  public activeState: AnimationState | null;

  /** Last Babylon animation group name started by AnimationSystem. */
  public activeGroupName: string | null;

  /** One-shot animation request that should preempt locomotion state. */
  public requestedOneShotState: AnimationState | null;

  /** One-shot state currently being played. */
  public activeOneShotState: AnimationState | null;

  public constructor(
    stateToGroupName: Partial<Record<AnimationState, string>>,
    availableGroupsByName: ReadonlyMap<string, AnimationGroup>
  ) {
    this.stateToGroupName = stateToGroupName;
    this.availableGroupsByName = availableGroupsByName;
    this.activeState = null;
    this.activeGroupName = null;
    this.requestedOneShotState = null;
    this.activeOneShotState = null;
  }
}
