import { Archetype } from "./Archetype";
import type { ModelDefinition } from "../model/ModelDefinition";

/**
 * Represents a normalized character template used at runtime.
 */
export interface CharacterTemplate {
  /** Archetype represented by this template. */
  archetype: Archetype;

  /** Visual model specification used by spawned characters. */
  model: ModelDefinition;
}
