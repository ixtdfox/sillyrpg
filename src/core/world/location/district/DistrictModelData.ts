import type {
  DistrictChunkSize,
  DistrictSceneCoord,
  DistrictStreamingDefinition
} from "./DistrictDefinition";

export interface DistrictSceneData {
  readonly id: string;
  readonly coord: DistrictSceneCoord;
  readonly model: string;
}

/**
 * Defines Babylon scene-related data for one district.
 */
export interface DistrictModelData {
  readonly chunkSize: DistrictChunkSize;
  readonly streaming: DistrictStreamingDefinition;
  readonly scenes: DistrictSceneData[];
}
