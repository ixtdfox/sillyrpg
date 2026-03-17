import type { NormalizationConfig } from "./normalization";

/**
 * Full visual model specification used by runtime systems.
 *
 * Future visual settings (LOD, materials, animation defaults, etc.)
 * can be added here without changing spawning contracts.
 */
export interface ModelDefinition {
  /** Relative path to the model asset file. */
  assetPath: string;

  /** Optional model normalization settings. */
  normalization?: NormalizationConfig;
}
