/**
 * Represents raw district data loaded from JSON.
 */
export interface DistrictDefinition {
  /** Unique district identifier inside its location. */
  id: string;

  /** Localization key for district title. */
  title: string;

  /** Relative model path for Babylon scene loading. */
  model: string;
}
