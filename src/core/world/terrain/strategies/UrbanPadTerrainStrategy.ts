import type { TerrainGenerationStrategy } from "../TerrainGenerationStrategy";
import type { TerrainGenerationContext } from "../TerrainGenerationContext";
import { TerrainHeightField } from "../TerrainHeightField";
import { TerrainScalarMath } from "../TerrainMath";

/**
 * Стратегия мягкой городской площадки: почти плоский центр и шумные края.
 */
export class UrbanPadTerrainStrategy implements TerrainGenerationStrategy {
  public readonly id = "urbanPad";
  private readonly scalarMath: TerrainScalarMath;

  public constructor(scalarMath = new TerrainScalarMath()) {
    this.scalarMath = scalarMath;
  }

  /**
   * Генерирует heightfield с bias к ровному центру под городскую застройку.
   */
  public generate(context: TerrainGenerationContext): TerrainHeightField {
    const heights = new Float32Array(context.resolutionX * context.resolutionZ);
    for (let iz = 0; iz < context.resolutionZ; iz += 1) {
      for (let ix = 0; ix < context.resolutionX; ix += 1) {
        const { x, z } = context.getCenteredNoiseCoordinates(ix, iz, 0.9);
        const primary = context.noise.sampleFractal2D(x, z, Math.min(3, context.octaves), context.persistence, context.lacunarity);
        const detail = context.noise.sample2D(x * 1.8, z * 1.8) * 0.14;
        const distance = context.getNormalizedCenterDistance(ix, iz);
        const centerBias = 1 - this.scalarMath.smoothstep(0.18, 0.58, distance);
        const edgeWeight = this.scalarMath.smoothstep(0.42, 1, distance);
        const shape = primary * 0.68 + detail * edgeWeight - centerBias * 0.22;
        heights[context.getIndex(ix, iz)] = context.clampHeight(context.baseHeight + shape * context.amplitude);
      }
    }

    return new TerrainHeightField(context.width, context.depth, context.resolutionX, context.resolutionZ, heights);
  }
}
