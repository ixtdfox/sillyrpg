import type { Component } from "../Component";

/**
 * Stores perception state to avoid repeated detection events each frame.
 */
export class DetectionStateComponent implements Component {
  /** Currently visible hostile entity id, or null when none is visible. */
  public detectedEntityId: string | null;

  /** Convenience flag indicating whether any hostile target is visible. */
  public isAnyHostileVisible: boolean;

  public constructor(detectedEntityId: string | null = null, isAnyHostileVisible = false) {
    this.detectedEntityId = detectedEntityId;
    this.isAnyHostileVisible = isAnyHostileVisible;
  }
}
