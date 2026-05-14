import type { TerrainGenerationStrategy } from "../TerrainGenerationStrategy";
import type { TerrainGenerationContext } from "../TerrainGenerationContext";
import { TerrainHeightField } from "../../../../core/world/terrain/TerrainHeightField";

/**
 * Стратегия скалистых гряд с ridged noise.
 */
export class RockyRidgesTerrainStrategy implements TerrainGenerationStrategy {
  public readonly id = "rockyRidges";

  /**
   * Генерирует резкие гребни и вторичный шум для каменистого профиля.
   */
  public generate(context: TerrainGenerationContext): TerrainHeightField {
    const heights = new Float32Array(context.resolutionX * context.resolutionZ);
    for (let iz = 0; iz < context.resolutionZ; iz += 1) {
      for (let ix = 0; ix < context.resolutionX; ix += 1) {
        const broad = context.getCenteredNoiseCoordinates(ix, iz, 0.95);
        const detail = context.getCenteredNoiseCoordinates(ix, iz, 1.9);
        const base = context.noise.sampleFractal2D(
          broad.x,
          broad.z,
          context.octaves,
          Math.max(0.4, context.persistence),
          Math.max(2.1, context.lacunarity)
        );
        const ridge = 1 - Math.abs(base);
        const sharp = Math.pow(Math.max(0, ridge), 2.25);
        const secondary = 1 - Math.abs(
          context.noise.sampleFractal2D(detail.x, detail.z, Math.max(3, context.octaves - 1), 0.46, 2.35)
        );
        const valley = context.noise.sampleFractal2D(detail.x * 1.35, detail.z * 1.35, 3, 0.52, 2.2);
        const shape = (sharp * 1.55 + secondary * 0.72 - 1.02) + valley * 0.28;
        heights[context.getIndex(ix, iz)] = context.clampHeight(context.baseHeight + shape * context.amplitude);
      }
    }

    return new TerrainHeightField(context.width, context.depth, context.resolutionX, context.resolutionZ, heights);
  }
}
