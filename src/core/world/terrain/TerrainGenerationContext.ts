import type { SceneGeneratedTerrainDescriptor } from "../scene/SceneDescriptor";
import { TerrainNoise } from "./TerrainNoise";
import type { TerrainStrategyId } from "./TerrainTypes";

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

  public constructor(descriptor: SceneGeneratedTerrainDescriptor, strategyId: TerrainStrategyId) {
    this.descriptor = descriptor;
    this.width = clampFinite(descriptor.size[0], 1, 4096, 40);
    this.depth = clampFinite(descriptor.size[1], 1, 4096, 40);
    this.resolutionX = clampResolution(descriptor.resolution[0]);
    this.resolutionZ = clampResolution(descriptor.resolution[1]);
    this.baseHeight = clampFinite(descriptor.generator.height.base, -1000, 1000, 0);
    this.amplitude = clampFinite(descriptor.generator.height.amplitude, 0, 1000, 0);
    this.frequency = clampFinite(descriptor.generator.height.frequency, 0.0001, 100, 0.1);
    this.octaves = Math.max(1, Math.min(8, Math.round(descriptor.generator.height.octaves)));
    this.persistence = clampFinite(descriptor.generator.height.persistence, 0, 1, 0.5);
    this.lacunarity = clampFinite(descriptor.generator.height.lacunarity, 1, 8, 2);
    this.noise = new TerrainNoise(descriptor.generator.seed);
    this.strategyId = strategyId;
  }

  public getIndex(ix: number, iz: number): number {
    return iz * this.resolutionX + ix;
  }

  public getNormalizedX(ix: number): number {
    return this.resolutionX <= 1 ? 0 : ix / (this.resolutionX - 1);
  }

  public getNormalizedZ(iz: number): number {
    return this.resolutionZ <= 1 ? 0 : iz / (this.resolutionZ - 1);
  }

  public getCenteredNoiseCoordinates(ix: number, iz: number, frequencyMultiplier = 1): { x: number; z: number } {
    const centeredX = (this.getNormalizedX(ix) - 0.5) * this.width * this.frequency * frequencyMultiplier;
    const centeredZ = (this.getNormalizedZ(iz) - 0.5) * this.depth * this.frequency * frequencyMultiplier;
    return { x: centeredX, z: centeredZ };
  }

  public getNormalizedCenterDistance(ix: number, iz: number): number {
    const dx = this.getNormalizedX(ix) - 0.5;
    const dz = this.getNormalizedZ(iz) - 0.5;
    return Math.min(1, Math.sqrt(dx * dx + dz * dz) / 0.70710678118);
  }

  public clampHeight(value: number): number {
    if (!Number.isFinite(value)) {
      return this.baseHeight;
    }

    return Math.max(-1000, Math.min(1000, value));
  }
}

function clampResolution(value: number): number {
  const rounded = Math.max(3, Math.min(257, Math.round(value)));
  return rounded % 2 === 0 ? rounded + 1 : rounded;
}

function clampFinite(value: number, min: number, max: number, fallback: number): number {
  if (!Number.isFinite(value)) {
    return fallback;
  }

  return Math.max(min, Math.min(max, value));
}
