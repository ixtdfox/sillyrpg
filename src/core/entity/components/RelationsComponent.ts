import type { Component } from "../Component";
import type { Relations } from "./Relations";

/**
 * Stores relationships keyed by target character id.
 */
export class RelationsComponent implements Component {
  /** Relationship map by target character id. */
  public relationships: Record<string, Relations>;

  /**
   * Creates a relations component.
   *
   * @param relationships - Relationship map.
   */
  public constructor(relationships: Record<string, Relations> = {}) {
    this.relationships = relationships;
  }
}
