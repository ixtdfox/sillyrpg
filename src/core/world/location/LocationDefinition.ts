import type { DistrictDefinition } from "./district/DistrictDefinition";

/**
 * Represents raw location data loaded from JSON.
 */
export interface LocationDefinition {
  /** Unique location identifier. */
  id: string;

  /** Localization key for location title. */
  title: string;

  /** District definitions contained in this location. */
  districts: DistrictDefinition[];
}
