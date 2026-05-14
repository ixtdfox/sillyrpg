import type { SceneGeneratedTerrainDescriptor } from "../scene/SceneDescriptor";
import { TerrainNoise } from "./TerrainNoise";
import { TerrainGeneratorValueNormalizer, type TerrainStrategyId } from "./TerrainTypes";

/**
 * Контекст одного запуска terrain generation.
 *
 * Класс нормализует входной descriptor и дает стратегиям безопасный API:
 * размеры, resolution, параметры noise и координатные helper'ы уже очищены от
 * non-finite значений и приведены к доменным ограничениям.
 */
export class TerrainGenerationContext {
  public readonly descriptor: SceneGeneratedTerrainDescriptor;
  public readonly width: number;
  public readonly depth: number;
  public readonly resolutionX: number;
  public readonly resolutionZ: number;
  public readonly baseHeight: number;
  public readonly amplitude: number;
  public readonly frequency: number;
  public readonly octaves: number;
  public readonly persistence: number;
  public readonly lacunarity: number;
  public readonly noise: TerrainNoise;
  public readonly strategyId: TerrainStrategyId;
  private readonly valueNormalizer: TerrainGeneratorValueNormalizer;

  public constructor(
    descriptor: SceneGeneratedTerrainDescriptor,
    strategyId: TerrainStrategyId,
    valueNormalizer = new TerrainGeneratorValueNormalizer()
  ) {
    this.valueNormalizer = valueNormalizer;
    this.descriptor = descriptor;
    this.width = this.valueNormalizer.normalizeSize(descriptor.size[0]);
    this.depth = this.valueNormalizer.normalizeSize(descriptor.size[1]);
    this.resolutionX = this.valueNormalizer.normalizeResolution(descriptor.resolution[0]);
    this.resolutionZ = this.valueNormalizer.normalizeResolution(descriptor.resolution[1]);
    this.baseHeight = this.valueNormalizer.normalizeBaseHeight(descriptor.generator.height.base);
    this.amplitude = this.valueNormalizer.normalizeAmplitude(descriptor.generator.height.amplitude);
    this.frequency = this.valueNormalizer.normalizeFrequency(descriptor.generator.height.frequency);
    this.octaves = this.valueNormalizer.normalizeOctaves(descriptor.generator.height.octaves);
    this.persistence = this.valueNormalizer.normalizePersistence(descriptor.generator.height.persistence);
    this.lacunarity = this.valueNormalizer.normalizeLacunarity(descriptor.generator.height.lacunarity);
    this.noise = new TerrainNoise(descriptor.generator.seed);
    this.strategyId = strategyId;
  }

  /**
   * Возвращает линейный индекс height buffer по координатам вершины.
   */
  public getIndex(ix: number, iz: number): number {
    return iz * this.resolutionX + ix;
  }

  /**
   * Нормализует X-индекс вершины в диапазон [0..1].
   */
  public getNormalizedX(ix: number): number {
    return this.resolutionX <= 1 ? 0 : ix / (this.resolutionX - 1);
  }

  /**
   * Нормализует Z-индекс вершины в диапазон [0..1].
   */
  public getNormalizedZ(iz: number): number {
    return this.resolutionZ <= 1 ? 0 : iz / (this.resolutionZ - 1);
  }

  /**
   * Возвращает центрированные координаты для noise sampling.
   */
  public getCenteredNoiseCoordinates(ix: number, iz: number, frequencyMultiplier = 1): { x: number; z: number } {
    const centeredX = (this.getNormalizedX(ix) - 0.5) * this.width * this.frequency * frequencyMultiplier;
    const centeredZ = (this.getNormalizedZ(iz) - 0.5) * this.depth * this.frequency * frequencyMultiplier;
    return { x: centeredX, z: centeredZ };
  }

  /**
   * Считает расстояние от центра карты в нормализованной диагональной метрике.
   */
  public getNormalizedCenterDistance(ix: number, iz: number): number {
    const dx = this.getNormalizedX(ix) - 0.5;
    const dz = this.getNormalizedZ(iz) - 0.5;
    return Math.min(1, Math.sqrt(dx * dx + dz * dz) / 0.70710678118);
  }

  /**
   * Защищает итоговую высоту от NaN/Infinity и чрезмерных значений.
   */
  public clampHeight(value: number): number {
    if (!Number.isFinite(value)) {
      return this.baseHeight;
    }

    return Math.max(-1000, Math.min(1000, value));
  }
}
