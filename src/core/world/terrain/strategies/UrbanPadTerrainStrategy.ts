import type { TerrainGenerationStrategy } from "../TerrainGenerationStrategy";
import type { TerrainGenerationContext } from "../TerrainGenerationContext";
import { TerrainHeightField } from "../TerrainHeightField";

export class UrbanPadTerrainStrategy implements TerrainGenerationStrategy {
  public readonly id = "urbanPad";

  public generate(context: TerrainGenerationContext): TerrainHeightField {
    const heights = new Float32Array(context.resolutionX * context.resolutionZ);
    for (let iz = 0; iz < context.resolutionZ; iz += 1) {
      for (let ix = 0; ix < context.resolutionX; ix += 1) {
        const { x, z } = context.getCenteredNoiseCoordinates(ix, iz, 0.9);
        const primary = context.noise.sampleFractal2D(x, z, Math.min(3, context.octaves), context.persistence, context.lacunarity);
        const detail = context.noise.sample2D(x * 1.8, z * 1.8) * 0.14;
        const distance = context.getNormalizedCenterDistance(ix, iz);
        const centerBias = 1 - smoothstep(0.18, 0.58, distance);
        const edgeWeight = smoothstep(0.42, 1, distance);
        const shape = primary * 0.68 + detail * edgeWeight - centerBias * 0.22;
        heights[context.getIndex(ix, iz)] = context.clampHeight(context.baseHeight + shape * context.amplitude);
      }
    }

    return new TerrainHeightField(context.width, context.depth, context.resolutionX, context.resolutionZ, heights);
  }
}

function smoothstep(edge0: number, edge1: number, value: number): number {
  if (edge0 === edge1) {
    return value < edge0 ? 0 : 1;
  }

  const t = Math.max(0, Math.min(1, (value - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}
