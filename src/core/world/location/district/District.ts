import type { DistrictModelData } from "./DistrictModelData";
import type { DistrictSceneCoord } from "./DistrictDefinition";
import type { DistrictSceneData } from "./DistrictModelData";

/**
 * Describes one playable district in a location.
 */
export interface District {
  /**
   * Returns district unique id.
   *
   * @returns District id.
   */
  getId(): string;

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
   * Returns a district scene by chunk-space X/Z coordinate.
   *
   * @param coord - Chunk coordinate on the Babylon X/Z plane.
   * @returns District scene data if present.
   */
  getSceneByCoord(coord: DistrictSceneCoord): DistrictSceneData | undefined;

  /**
   * Returns the initial scene chunk for district bootstrap.
   *
   * @returns Initial scene data, preferring coord [0, 0].
   */
  getInitialScene(): DistrictSceneData;

  /**
   * Returns runtime characters currently assigned to the district.
   *
   * @returns List of character-like entries.
   */
  getCharacters(): unknown[];
}
