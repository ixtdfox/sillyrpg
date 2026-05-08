import { WORLD_VERTICAL_TILE_SIZE } from "../../../grid/WorldGridConstants";
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

export function normalizeTerrainBrushSettings(settings: TerrainBrushSettings): TerrainBrushSettings {
  return {
    shape: settings.shape === "square" ? "square" : "circle",
    radius: clamp(settings.radius, 0.5, 128, DEFAULT_TERRAIN_BRUSH_SETTINGS.radius),
    strength: clamp(settings.strength, 0.1, 128, DEFAULT_TERRAIN_BRUSH_SETTINGS.strength),
    falloff: clamp(settings.falloff, 0, 1, DEFAULT_TERRAIN_BRUSH_SETTINGS.falloff)
  };
}

export function normalizeTerrainToolSettings(settings: TerrainToolSettings): TerrainToolSettings {
  return {
    tool: settings.tool,
    brush: normalizeTerrainBrushSettings(settings.brush),
    targetHeight: clamp(settings.targetHeight, -1000, 1000, DEFAULT_TERRAIN_TOOL_SETTINGS.targetHeight),
    snapHeightStep: clamp(settings.snapHeightStep, 0.01, 100, DEFAULT_TERRAIN_TOOL_SETTINGS.snapHeightStep)
  };
}

function clamp(value: number, min: number, max: number, fallback: number): number {
  if (!Number.isFinite(value)) {
    return fallback;
  }

  return Math.max(min, Math.min(max, value));
}
