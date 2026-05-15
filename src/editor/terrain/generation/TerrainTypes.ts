import type {
  SceneGeneratedTerrainDescriptor,
  SceneGeneratedTerrainMaterialDescriptor,
  SceneGeneratedTerrainResolutionMode,
  SceneTerrainGeneratorDescriptor,
  SceneVector2Tuple,
  SceneVector3Tuple
} from "../../../core/world/scene/SceneDescriptor";
import { TerrainScalarMath } from "../../../core/world/terrain/TerrainMath";

export const DEFAULT_TERRAIN_SIZE: SceneVector2Tuple = [40, 40];
export const DEFAULT_TERRAIN_GRID_STEP = 1;
export const MAX_TERRAIN_WORLD_SIZE = 4096;
export const MAX_TERRAIN_RESOLUTION = Math.floor(MAX_TERRAIN_WORLD_SIZE / DEFAULT_TERRAIN_GRID_STEP) + 1;
export const RECOMMENDED_MAX_SINGLE_HEIGHTFIELD_RESOLUTION = 1025;
export const MIN_TERRAIN_RESOLUTION = 9;
export const DEFAULT_TERRAIN_RESOLUTION: SceneVector2Tuple = [
  Math.floor(DEFAULT_TERRAIN_SIZE[0] / DEFAULT_TERRAIN_GRID_STEP) + 1,
  Math.floor(DEFAULT_TERRAIN_SIZE[1] / DEFAULT_TERRAIN_GRID_STEP) + 1
];
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

export interface TerrainSourceResolutionDiagnostics {
  readonly desiredGridStep: number;
  readonly resolution: SceneVector2Tuple;
  readonly requestedResolution: SceneVector2Tuple;
  readonly actualQuadSize: SceneVector2Tuple;
  readonly clamped: boolean;
}

export interface TerrainGridAlignedResolutionDiagnostics {
  readonly requestedSize: SceneVector2Tuple;
  readonly snappedSize: SceneVector2Tuple;
  readonly terrainGridStep: number;
  readonly quadCounts: SceneVector2Tuple;
  readonly requestedQuadCounts: SceneVector2Tuple;
  readonly resolution: SceneVector2Tuple;
  readonly actualQuadSize: SceneVector2Tuple;
  readonly sizeSnapped: boolean;
  readonly clamped: boolean;
}

/**
 * Grid-following policy for generated terrain source density and centered-grid alignment.
 */
export class TerrainGridAlignedResolutionPolicy {
  private readonly scalarMath: TerrainScalarMath;

  public constructor(scalarMath = new TerrainScalarMath()) {
    this.scalarMath = scalarMath;
  }

  public resolve(size: SceneVector2Tuple, desiredGridStep = DEFAULT_TERRAIN_GRID_STEP): SceneVector2Tuple {
    return this.resolveWithDiagnostics(size, desiredGridStep).resolution;
  }

  public resolveWithDiagnostics(
    size: SceneVector2Tuple,
    desiredGridStep = DEFAULT_TERRAIN_GRID_STEP
  ): TerrainGridAlignedResolutionDiagnostics {
    const terrainGridStep = this.normalizeGridStep(desiredGridStep);
    const requestedSize: SceneVector2Tuple = [
      this.normalizeSize(size[0]),
      this.normalizeSize(size[1])
    ];
    const requestedQuadCounts: SceneVector2Tuple = [
      requestedSize[0] / terrainGridStep,
      requestedSize[1] / terrainGridStep
    ];
    const quadCounts: SceneVector2Tuple = [
      this.snapEvenQuadCount(requestedQuadCounts[0]),
      this.snapEvenQuadCount(requestedQuadCounts[1])
    ];
    const snappedSize: SceneVector2Tuple = [
      quadCounts[0] * terrainGridStep,
      quadCounts[1] * terrainGridStep
    ];
    const resolution: SceneVector2Tuple = [
      quadCounts[0] + 1,
      quadCounts[1] + 1
    ];

    return {
      requestedSize,
      snappedSize,
      terrainGridStep,
      quadCounts,
      requestedQuadCounts,
      resolution,
      actualQuadSize: [terrainGridStep, terrainGridStep],
      sizeSnapped:
        Math.abs(snappedSize[0] - requestedSize[0]) > 1e-9 ||
        Math.abs(snappedSize[1] - requestedSize[1]) > 1e-9,
      clamped:
        quadCounts[0] !== this.nearestEvenQuadCount(requestedQuadCounts[0]) ||
        quadCounts[1] !== this.nearestEvenQuadCount(requestedQuadCounts[1])
    };
  }

  private normalizeGridStep(value: number): number {
    return this.scalarMath.clampFinite(value, 0.0001, MAX_TERRAIN_WORLD_SIZE, DEFAULT_TERRAIN_GRID_STEP);
  }

  private normalizeSize(value: number): number {
    return this.scalarMath.clampFinite(value, 1, MAX_TERRAIN_WORLD_SIZE, DEFAULT_TERRAIN_SIZE[0]);
  }

  private snapEvenQuadCount(requestedQuadCount: number): number {
    return Math.max(2, Math.min(MAX_TERRAIN_RESOLUTION - 1, this.nearestEvenQuadCount(requestedQuadCount)));
  }

  private nearestEvenQuadCount(requestedQuadCount: number): number {
    return Math.max(2, Math.round(requestedQuadCount / 2) * 2);
  }
}

/**
 * Policy for deriving generated source heightfield density from gameplay grid size.
 */
export class TerrainSourceResolutionPolicy {
  private readonly gridAlignedResolutionPolicy: TerrainGridAlignedResolutionPolicy;

  public constructor(gridAlignedResolutionPolicy = new TerrainGridAlignedResolutionPolicy()) {
    this.gridAlignedResolutionPolicy = gridAlignedResolutionPolicy;
  }

  public resolve(size: SceneVector2Tuple, desiredGridStep = DEFAULT_TERRAIN_GRID_STEP): SceneVector2Tuple {
    return this.resolveWithDiagnostics(size, desiredGridStep).resolution;
  }

  public resolveWithDiagnostics(
    size: SceneVector2Tuple,
    desiredGridStep = DEFAULT_TERRAIN_GRID_STEP
  ): TerrainSourceResolutionDiagnostics {
    const diagnostics = this.gridAlignedResolutionPolicy.resolveWithDiagnostics(size, desiredGridStep);

    return {
      desiredGridStep: diagnostics.terrainGridStep,
      resolution: diagnostics.resolution,
      requestedResolution: [
        Math.floor(diagnostics.requestedSize[0] / diagnostics.terrainGridStep) + 1,
        Math.floor(diagnostics.requestedSize[1] / diagnostics.terrainGridStep) + 1
      ],
      actualQuadSize: diagnostics.actualQuadSize,
      clamped: diagnostics.clamped
    };
  }
}

export interface TerrainEditedMapCompatibilityResult {
  readonly descriptor: SceneGeneratedTerrainDescriptor;
  readonly clearedHeightMap: boolean;
  readonly clearedTextureMap: boolean;
}

/**
 * Keeps edited terrain payloads compatible with the generated source grid.
 */
export class TerrainEditedMapCompatibilityPolicy {
  public clearIncompatibleEditedMaps(
    source: SceneGeneratedTerrainDescriptor,
    normalized: SceneGeneratedTerrainDescriptor
  ): TerrainEditedMapCompatibilityResult {
    const gridChanged =
      source.size[0] !== normalized.size[0] ||
      source.size[1] !== normalized.size[1] ||
      source.resolution[0] !== normalized.resolution[0] ||
      source.resolution[1] !== normalized.resolution[1] ||
      this.resolveGridStep(source.terrainGridStep) !== this.resolveGridStep(normalized.terrainGridStep) ||
      this.resolveMode(source.resolutionMode) !== this.resolveMode(normalized.resolutionMode);

    if (!gridChanged) {
      return {
        descriptor: normalized,
        clearedHeightMap: false,
        clearedTextureMap: false
      };
    }

    return {
      descriptor: {
        ...normalized,
        editedHeightMap: undefined,
        editedTextureMap: undefined
      },
      clearedHeightMap: normalized.editedHeightMap !== undefined,
      clearedTextureMap: normalized.editedTextureMap !== undefined
    };
  }

  private resolveMode(mode: SceneGeneratedTerrainResolutionMode | undefined): SceneGeneratedTerrainResolutionMode {
    return mode ?? "gridStep";
  }

  private resolveGridStep(value: number | undefined): number {
    return value ?? DEFAULT_TERRAIN_GRID_STEP;
  }
}

/**
 * Сервис глубокого клонирования terrain descriptors.
 *
 * Descriptor'ы приходят из editor state и scene loader. Клонирование через
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
    return this.scalarMath.clampFinite(value, 1, MAX_TERRAIN_WORLD_SIZE, 40);
  }

  public normalizeGridStep(value: number): number {
    return this.scalarMath.clampFinite(value, 0.0001, MAX_TERRAIN_WORLD_SIZE, DEFAULT_TERRAIN_GRID_STEP);
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
