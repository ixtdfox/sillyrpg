import type { Component } from "../Component";
import { Archetype } from "../../character/Archetype";

/**
 * Stores character identity values.
 */
export class IdentityComponent implements Component {
  /** Unique character identifier. */
  public id: string;

  /** Display name for dialogs and UI. */
  public name: string;

  /** Character archetype used by game logic. */
  public archetype: Archetype;

  /**
   * Creates an identity component.
   *
   * @param id - Character identifier.
   * @param name - Character display name.
   * @param archetype - Character archetype.
   */
  public constructor(id: string, name: string, archetype: Archetype) {
    this.id = id;
    this.name = name;
    this.archetype = archetype;
  }
}
