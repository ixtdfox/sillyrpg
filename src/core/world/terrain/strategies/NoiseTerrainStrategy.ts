import type { TerrainGenerationStrategy } from "../TerrainGenerationStrategy";
import type { TerrainGenerationContext } from "../TerrainGenerationContext";
import { TerrainHeightField } from "../TerrainHeightField";

export class NoiseTerrainStrategy implements TerrainGenerationStrategy {
  public readonly id = "noise";

  public generate(context: TerrainGenerationContext): TerrainHeightField {
    const heights = new Float32Array(context.resolutionX * context.resolutionZ);
    for (let iz = 0; iz < context.resolutionZ; iz += 1) {
      for (let ix = 0; ix < context.resolutionX; ix += 1) {
        const { x, z } = context.getCenteredNoiseCoordinates(ix, iz);
        const primary = context.noise.sampleFractal2D(x, z, context.octaves, context.persistence, context.lacunarity);
        const secondary = context.noise.sampleFractal2D(x * 2.1, z * 2.1, Math.max(2, context.octaves - 1), 0.46, 2.2);
        const shape = primary * 0.86 + secondary * 0.24;
        heights[context.getIndex(ix, iz)] = context.clampHeight(context.baseHeight + shape * context.amplitude);
      }
    }

    return new TerrainHeightField(context.width, context.depth, context.resolutionX, context.resolutionZ, heights);
  }
}
