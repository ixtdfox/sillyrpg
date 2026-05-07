export type DistrictSceneCoord = readonly [number, number];

export interface DistrictChunkSize {
  readonly x: number;
  readonly z: number;
}

export interface DistrictStreamingDefinition {
  readonly enabled: boolean;
  readonly loadMargin: number;
  readonly unloadDistance: number;
}

export interface DistrictSceneDefinition {
  readonly id: string;
  readonly coord: DistrictSceneCoord;
  readonly scene: string;
}

/**
 * Represents raw district data loaded from JSON.
 */
export interface DistrictDefinition {
  /** Unique district identifier inside its location. */
  readonly id: string;

  /** Localization key for district title. */
  readonly title: string;

  /** Streaming chunk dimensions in world units on the X/Z plane. */
  readonly chunkSize: DistrictChunkSize;

  /** Streaming configuration for runtime chunk loading. */
  readonly streaming?: DistrictStreamingDefinition;

  /** Authored district scenes/chunks keyed by chunk-space X/Z coordinates. */
  readonly scenes: DistrictSceneDefinition[];
}
