import type { TerrainGenerationStrategy } from "../TerrainGenerationStrategy";
import type { TerrainGenerationContext } from "../TerrainGenerationContext";
import { TerrainHeightField } from "../../../../core/world/terrain/TerrainHeightField";
import { TerrainScalarMath } from "../../../../core/world/terrain/TerrainMath";

/**
 * Стратегия крупных горных массивов с ridged noise и долинами.
 */
export class MountainsTerrainStrategy implements TerrainGenerationStrategy {
  public readonly id = "mountains";
  private readonly scalarMath: TerrainScalarMath;

  public constructor(scalarMath = new TerrainScalarMath()) {
    this.scalarMath = scalarMath;
  }

  /**
   * Генерирует высокоамплитудный heightfield с massif mask вокруг центра.
   */
  public generate(context: TerrainGenerationContext): TerrainHeightField {
    const heights = new Float32Array(context.resolutionX * context.resolutionZ);
    for (let iz = 0; iz < context.resolutionZ; iz += 1) {
      for (let ix = 0; ix < context.resolutionX; ix += 1) {
        const broad = context.getCenteredNoiseCoordinates(ix, iz, 0.65);
        const detail = context.getCenteredNoiseCoordinates(ix, iz, 1.6);
        const broadNoise = context.noise.sampleFractal2D(
          broad.x,
          broad.z,
          Math.max(4, context.octaves),
          Math.max(0.38, context.persistence),
          context.lacunarity
        );
        const ridgedBase = context.noise.sampleFractal2D(
          detail.x,
          detail.z,
          Math.max(5, context.octaves),
          Math.max(0.42, context.persistence),
          Math.max(2.1, context.lacunarity)
        );
        const ridge = 1 - Math.abs(ridgedBase);
        const sharp = Math.pow(Math.max(0, ridge), 2.8);
        const valley = context.noise.sampleFractal2D(detail.x * 2.2, detail.z * 2.2, 3, 0.5, 2.35);
        const distance = context.getNormalizedCenterDistance(ix, iz);
        const massif = 1 - this.scalarMath.smoothstep(0.55, 1, distance);
        const shape = broadNoise * 0.5 + (sharp * 2 - 1) * 1.25 + valley * 0.22 + massif * 0.28;
        heights[context.getIndex(ix, iz)] = context.clampHeight(context.baseHeight + shape * context.amplitude);
      }
    }

    return new TerrainHeightField(context.width, context.depth, context.resolutionX, context.resolutionZ, heights);
  }
}
