import type { District } from "./district/District";

/**
 * Describes a world location containing districts.
 */
export interface Location {
  /**
   * Returns localized location title.
   *
   * @returns Localized location title.
   */
  getTitle(): string;

  /**
   * Checks whether this location is available.
   *
   * @returns Availability state for future character rules.
   */
  isAvailableFor(): boolean;

  /**
   * Returns all districts for this location.
   *
   * @returns District list.
   */
  getDistricts(): District[];
}
