import { Archetype } from "./Archetype";
import type { NormalizationConfig } from "../model/normalization";

/**
 * Represents a normalized character template used at runtime.
 */
export interface CharacterTemplate {
  /** Archetype represented by this template. */
  archetype: Archetype;

  /** Default model path for spawned characters. */
  model: string;

  /** Optional model size normalization settings. */
  normalization?: NormalizationConfig;
}
