import type {
  SceneGeneratedTerrainDescriptor,
  SceneGeneratedTerrainMaterialDescriptor,
  SceneTerrainGeneratorDescriptor,
  SceneVector2Tuple,
  SceneVector3Tuple
} from "../scene/SceneDescriptor";

export const DEFAULT_TERRAIN_SIZE: SceneVector2Tuple = [40, 40];
export const DEFAULT_TERRAIN_RESOLUTION: SceneVector2Tuple = [65, 65];
export const MAX_TERRAIN_RESOLUTION = 257;
export const MIN_TERRAIN_RESOLUTION = 9;
export const DEFAULT_TERRAIN_ID = "terrain-0";
export const DEFAULT_TERRAIN_PRESET = "urban-pad";
export const DEFAULT_TERRAIN_POSITION: SceneVector3Tuple = [0, 0, 0];
export const DEFAULT_TERRAIN_ROTATION: SceneVector3Tuple = [0, 0, 0];
export const DEFAULT_TERRAIN_SCALE: SceneVector3Tuple = [1, 1, 1];

export interface TerrainGenerationStats {
  readonly minHeight: number;
  readonly maxHeight: number;
  readonly vertexCount: number;
  readonly triangleCount: number;
}

export type TerrainStrategyId =
  | "flat"
  | "noise"
  | "urbanPad"
  | "islandPlateau"
  | "rockyRidges"
  | "mountains";

export function normalizeTerrainResolution(value: number): number {
  const rounded = Math.max(MIN_TERRAIN_RESOLUTION, Math.min(MAX_TERRAIN_RESOLUTION, Math.round(value)));
  return rounded % 2 === 0 ? Math.min(MAX_TERRAIN_RESOLUTION, rounded + 1) : rounded;
}

export function cloneTerrainGeneratorDescriptor(
  generator: SceneTerrainGeneratorDescriptor
): SceneTerrainGeneratorDescriptor {
  return JSON.parse(JSON.stringify(generator)) as SceneTerrainGeneratorDescriptor;
}

export function cloneGeneratedTerrainMaterialDescriptor(
  material: SceneGeneratedTerrainMaterialDescriptor | undefined
): SceneGeneratedTerrainMaterialDescriptor | undefined {
  return material ? (JSON.parse(JSON.stringify(material)) as SceneGeneratedTerrainMaterialDescriptor) : undefined;
}

export function cloneGeneratedTerrainDescriptor(
  descriptor: SceneGeneratedTerrainDescriptor
): SceneGeneratedTerrainDescriptor {
  return JSON.parse(JSON.stringify(descriptor)) as SceneGeneratedTerrainDescriptor;
}
