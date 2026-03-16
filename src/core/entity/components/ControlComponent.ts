import type { ControlType } from "../../character/ControlType";
import type { Component } from "../Component";

/**
 * Stores character control ownership.
 */
export class ControlComponent implements Component {
  /** Indicates whether the character is player- or NPC-controlled. */
  public type: ControlType;

  /**
   * Creates a control component.
   *
   * @param type - Control type value.
   */
  public constructor(type: ControlType) {
    this.type = type;
  }
}
