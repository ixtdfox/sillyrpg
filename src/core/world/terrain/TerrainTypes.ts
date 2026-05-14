import type {
  SceneGeneratedTerrainDescriptor,
  SceneGeneratedTerrainMaterialDescriptor,
  SceneTerrainGeneratorDescriptor,
  SceneVector2Tuple,
  SceneVector3Tuple
} from "../scene/SceneDescriptor";
import { TerrainScalarMath } from "./TerrainMath";

export const DEFAULT_TERRAIN_SIZE: SceneVector2Tuple = [40, 40];
export const DEFAULT_TERRAIN_RESOLUTION: SceneVector2Tuple = [65, 65];
export const MAX_TERRAIN_RESOLUTION = 257;
export const MIN_TERRAIN_RESOLUTION = 9;
export const DEFAULT_TERRAIN_ID = "terrain-0";
export const DEFAULT_TERRAIN_PRESET = "urban-pad";
export const DEFAULT_TERRAIN_POSITION: SceneVector3Tuple = [0, 0, 0];
export const DEFAULT_TERRAIN_ROTATION: SceneVector3Tuple = [0, 0, 0];
export const DEFAULT_TERRAIN_SCALE: SceneVector3Tuple = [1, 1, 1];

/**
 * Сводная статистика generated heightfield для UI и диагностических панелей.
 */
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

/**
 * Политика нормализации resolution generated terrain.
 *
 * Terrain mesh ожидает нечетное количество вершин: так центр карты попадает в
 * реальную вершину, а quadtree LOD получает симметричные деления.
 */
export class TerrainResolutionNormalizer {
  /**
   * Приводит resolution к допустимому нечетному количеству вершин.
   */
  public normalize(value: number): number {
    const rounded = Math.max(MIN_TERRAIN_RESOLUTION, Math.min(MAX_TERRAIN_RESOLUTION, Math.round(value)));
    return rounded % 2 === 0 ? Math.min(MAX_TERRAIN_RESOLUTION, rounded + 1) : rounded;
  }
}

/**
 * Сервис глубокого клонирования terrain descriptors.
 *
 * Descriptor'ы приходят из редактора и runtime scene loader. Клонирование через
 * JSON здесь допустимо, потому что эти DTO состоят только из JSON-совместимых
 * данных; зато внешний код не получает ссылку на mutable draft.
 */
export class TerrainDescriptorCloner {
  /**
   * Клонирует generator descriptor без сохранения ссылок на исходный DTO.
   */
  public cloneGenerator(generator: SceneTerrainGeneratorDescriptor): SceneTerrainGeneratorDescriptor {
    return JSON.parse(JSON.stringify(generator)) as SceneTerrainGeneratorDescriptor;
  }

  /**
   * Клонирует optional material descriptor, сохраняя undefined как отсутствие материала.
   */
  public cloneMaterial(
    material: SceneGeneratedTerrainMaterialDescriptor | undefined
  ): SceneGeneratedTerrainMaterialDescriptor | undefined {
    return material ? (JSON.parse(JSON.stringify(material)) as SceneGeneratedTerrainMaterialDescriptor) : undefined;
  }

  /**
   * Клонирует полный generated terrain descriptor.
   */
  public cloneDescriptor(descriptor: SceneGeneratedTerrainDescriptor): SceneGeneratedTerrainDescriptor {
    return JSON.parse(JSON.stringify(descriptor)) as SceneGeneratedTerrainDescriptor;
  }
}

/**
 * Нормализатор числовых параметров генератора terrain.
 */
export class TerrainGeneratorValueNormalizer {
  private readonly scalarMath: TerrainScalarMath;
  private readonly resolutionNormalizer: TerrainResolutionNormalizer;

  public constructor(
    scalarMath = new TerrainScalarMath(),
    resolutionNormalizer = new TerrainResolutionNormalizer()
  ) {
    this.scalarMath = scalarMath;
    this.resolutionNormalizer = resolutionNormalizer;
  }

  /**
   * Нормализует resolution через общую политику terrain mesh.
   */
  public normalizeResolution(value: number): number {
    return this.resolutionNormalizer.normalize(value);
  }

  /**
   * Ограничивает world size terrain безопасным диапазоном.
   */
  public normalizeSize(value: number): number {
    return this.scalarMath.clampFinite(value, 1, 4096, 40);
  }

  /**
   * Ограничивает базовую высоту генератора.
   */
  public normalizeBaseHeight(value: number): number {
    return this.scalarMath.clampFinite(value, -1000, 1000, 0);
  }

  /**
   * Ограничивает амплитуду noise/shape генератора.
   */
  public normalizeAmplitude(value: number): number {
    return this.scalarMath.clampFinite(value, 0, 1000, 0);
  }

  /**
   * Ограничивает частоту sampling'а noise.
   */
  public normalizeFrequency(value: number): number {
    return this.scalarMath.clampFinite(value, 0.0001, 100, 0.1);
  }

  /**
   * Приводит число октав к целочисленному диапазону генератора.
   */
  public normalizeOctaves(value: number): number {
    return Math.max(1, Math.min(8, Math.round(value)));
  }

  /**
   * Ограничивает persistence для fractal noise.
   */
  public normalizePersistence(value: number): number {
    return this.scalarMath.clampFinite(value, 0, 1, 0.5);
  }

  /**
   * Ограничивает lacunarity для fractal noise.
   */
  public normalizeLacunarity(value: number): number {
    return this.scalarMath.clampFinite(value, 1, 8, 2);
  }
}
