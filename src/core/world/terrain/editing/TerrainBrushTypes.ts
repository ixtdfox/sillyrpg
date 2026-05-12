export type TerrainBrushShape = "circle" | "square";

export type TerrainEditToolId = "raise" | "lower" | "smooth" | "flatten" | "flattenToHeight" | "paintTexture";

export interface TerrainBrushSettings {
  readonly shape: TerrainBrushShape;
  readonly radius: number;
  readonly strength: number;
  readonly falloff: number;
}

export interface TerrainToolSettings {
  readonly tool: TerrainEditToolId;
  readonly brush: TerrainBrushSettings;
  readonly targetHeight: number;
  readonly snapHeightStep: number;
}

export interface TerrainBrushCenter {
  readonly x: number;
  readonly z: number;
}
