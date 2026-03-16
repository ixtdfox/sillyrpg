import type { DistrictModelData } from "./DistrictModelData";

/**
 * Describes one playable district in a location.
 */
export interface District {
  /**
   * Returns district localized title.
   *
   * @returns Localized district title.
   */
  getTitle(): string;

  /**
   * Checks whether this district can currently be visited.
   *
   * @returns Availability state for future character rules.
   */
  isAvailableFor(): boolean;

  /**
   * Returns scene initialization data for this district.
   *
   * @returns District scene data.
   */
  getModelData(): DistrictModelData;

  /**
   * Returns runtime characters currently assigned to the district.
   *
   * @returns List of character-like entries.
   */
  getCharacters(): unknown[];
}
