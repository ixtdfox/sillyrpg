import type { Component } from "../Component";

export type GroundAttachmentMode = "snap" | "smooth";

export class GroundAttachmentComponent implements Component {
  public enabled: boolean;
  public footOffset: number;
  public mode: GroundAttachmentMode;
  public maxSnapDistance: number;
  public allowDuringMovement: boolean;

  public constructor(options: Partial<GroundAttachmentComponent> = {}) {
    this.enabled = options.enabled ?? true;
    this.footOffset = options.footOffset ?? 0;
    this.mode = options.mode ?? "snap";
    this.maxSnapDistance = options.maxSnapDistance ?? 8;
    this.allowDuringMovement = options.allowDuringMovement ?? true;
  }
}
