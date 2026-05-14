export type TerrainBrushShape = "circle" | "square";

export type TerrainEditToolId = "raise" | "lower" | "smooth" | "flatten" | "flattenToHeight" | "paintTexture";

/**
 * Нормализованные параметры кисти terrain editor.
 */
export interface TerrainBrushSettings {
  readonly shape: TerrainBrushShape;
  readonly radius: number;
  readonly strength: number;
  readonly falloff: number;
}

/**
 * Полное состояние выбранного инструмента редактирования terrain.
 */
export interface TerrainToolSettings {
  readonly tool: TerrainEditToolId;
  readonly brush: TerrainBrushSettings;
  readonly targetHeight: number;
  readonly snapHeightStep: number;
}

/**
 * Центр кисти в локальных X/Z координатах terrain.
 */
export interface TerrainBrushCenter {
  readonly x: number;
  readonly z: number;
}
