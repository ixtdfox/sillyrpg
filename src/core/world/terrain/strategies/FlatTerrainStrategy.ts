import type { TerrainGenerationStrategy } from "../TerrainGenerationStrategy";
import type { TerrainGenerationContext } from "../TerrainGenerationContext";
import { TerrainHeightField } from "../TerrainHeightField";

/**
 * Стратегия почти плоского terrain с минимальной noise-вариацией.
 */
export class FlatTerrainStrategy implements TerrainGenerationStrategy {
  public readonly id = "flat";

  /**
   * Генерирует высоты вокруг baseHeight, оставляя поверхность удобной для placement.
   */
  public generate(context: TerrainGenerationContext): TerrainHeightField {
    const heights = new Float32Array(context.resolutionX * context.resolutionZ);
    for (let iz = 0; iz < context.resolutionZ; iz += 1) {
      for (let ix = 0; ix < context.resolutionX; ix += 1) {
        const { x, z } = context.getCenteredNoiseCoordinates(ix, iz, 0.75);
        const noise = context.noise.sampleFractal2D(x, z, Math.min(2, context.octaves), 0.35, 2);
        heights[context.getIndex(ix, iz)] = context.clampHeight(context.baseHeight + noise * context.amplitude * 0.18);
      }
    }

    return new TerrainHeightField(context.width, context.depth, context.resolutionX, context.resolutionZ, heights);
  }
}
