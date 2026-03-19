import { Vector3 } from "@babylonjs/core";
import type { Component } from "../Component";

/**
 * Describes an entity's cone-based vision settings.
 */
export class VisionComponent implements Component {
  /** Vision range measured in hex cells. */
  public rangeCells: number;

  /** Cone field-of-view angle in degrees. */
  public fovDegrees: number;

  /** Optional local forward override used when transform rotation should be ignored. */
  public forward: Vector3 | null;

  /**
   * Creates a vision component.
   */
  public constructor(rangeCells: number, fovDegrees: number, forward: Vector3 | null = null) {
    this.rangeCells = rangeCells;
    this.fovDegrees = fovDegrees;
    this.forward = forward;
  }
}
