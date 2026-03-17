import type { Component } from "../Component";


/**
 * Declares who controls a character instance.
 */
export enum ControlType {
  PLAYER = "player",
  NPC = "npc"
}


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
