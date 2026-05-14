import { WORLD_VERTICAL_TILE_SIZE } from "../../../grid/WorldGridConstants";
import { TerrainScalarMath } from "../TerrainMath";
import type { TerrainBrushSettings, TerrainToolSettings } from "./TerrainBrushTypes";

export const DEFAULT_TERRAIN_BRUSH_SETTINGS: TerrainBrushSettings = {
  shape: "circle",
  radius: 4,
  strength: 10,
  falloff: 0.65
};

export const DEFAULT_TERRAIN_TOOL_SETTINGS: TerrainToolSettings = {
  tool: "raise",
  brush: DEFAULT_TERRAIN_BRUSH_SETTINGS,
  targetHeight: 0,
  snapHeightStep: WORLD_VERTICAL_TILE_SIZE
};

/**
 * Нормализатор настроек terrain brush.
 */
export class TerrainBrushSettingsNormalizer {
  private readonly scalarMath: TerrainScalarMath;

  public constructor(scalarMath = new TerrainScalarMath()) {
    this.scalarMath = scalarMath;
  }

  /**
   * Приводит настройки кисти к безопасным значениям editor runtime.
   */
  public normalizeBrush(settings: TerrainBrushSettings): TerrainBrushSettings {
    return {
      shape: settings.shape === "square" ? "square" : "circle",
      radius: this.scalarMath.clampFinite(settings.radius, 0.5, 128, DEFAULT_TERRAIN_BRUSH_SETTINGS.radius),
      strength: this.scalarMath.clampFinite(settings.strength, 0.1, 128, DEFAULT_TERRAIN_BRUSH_SETTINGS.strength),
      falloff: this.scalarMath.clampFinite(settings.falloff, 0, 1, DEFAULT_TERRAIN_BRUSH_SETTINGS.falloff)
    };
  }

  /**
   * Нормализует tool state вместе с вложенной brush settings.
   */
  public normalizeTool(settings: TerrainToolSettings): TerrainToolSettings {
    return {
      tool: settings.tool,
      brush: this.normalizeBrush(settings.brush),
      targetHeight: this.scalarMath.clampFinite(settings.targetHeight, -1000, 1000, DEFAULT_TERRAIN_TOOL_SETTINGS.targetHeight),
      snapHeightStep: this.scalarMath.clampFinite(settings.snapHeightStep, 0.01, 100, DEFAULT_TERRAIN_TOOL_SETTINGS.snapHeightStep)
    };
  }
}
