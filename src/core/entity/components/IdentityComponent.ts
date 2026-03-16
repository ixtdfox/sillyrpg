import type { Component } from "../Component";

/**
 * Stores character identity values.
 */
export class IdentityComponent implements Component {
  /** Unique character identifier. */
  public id: string;

  /** Display name for dialogs and UI. */
  public name: string;

  /**
   * Creates an identity component.
   *
   * @param id - Character identifier.
   * @param name - Character display name.
   */
  public constructor(id: string, name: string) {
    this.id = id;
    this.name = name;
  }
}
