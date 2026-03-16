import type { Location } from "./location/Location";

/**
 * Describes runtime world object that owns available locations.
 */
export interface World {
  /**
   * Returns all world locations.
   *
   * @returns List of locations.
   */
  getLocations(): Location[];
}
