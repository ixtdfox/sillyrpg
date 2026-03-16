import type { Location } from "./location/Location";
import type { World } from "./World";

/**
 * Runtime world implementation storing location list.
 */
export class GameWorld implements World {
  /** Locations available in this world. */
  private readonly locations: Location[];

  /**
   * Creates a world instance from runtime locations.
   *
   * @param locations - Runtime location list.
   */
  public constructor(locations: Location[]) {
    this.locations = locations;
  }

  /**
   * Returns all available locations.
   *
   * @returns Copy of world locations.
   */
  public getLocations(): Location[] {
    return [...this.locations];
  }
}
