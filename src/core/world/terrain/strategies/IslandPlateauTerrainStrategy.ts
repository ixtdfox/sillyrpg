import type { TerrainGenerationStrategy } from "../TerrainGenerationStrategy";
import type { TerrainGenerationContext } from "../TerrainGenerationContext";
import { TerrainHeightField } from "../TerrainHeightField";
import { TerrainScalarMath } from "../TerrainMath";

/**
 * Стратегия островного плато с приподнятым центром и мягкими краями.
 */
export class IslandPlateauTerrainStrategy implements TerrainGenerationStrategy {
  public readonly id = "islandPlateau";
  private readonly scalarMath: TerrainScalarMath;

  public constructor(scalarMath = new TerrainScalarMath()) {
    this.scalarMath = scalarMath;
  }

  /**
   * Генерирует heightfield, где центр пригоден под игру, а края уходят вниз.
   */
  public generate(context: TerrainGenerationContext): TerrainHeightField {
    const heights = new Float32Array(context.resolutionX * context.resolutionZ);
    for (let iz = 0; iz < context.resolutionZ; iz += 1) {
      for (let ix = 0; ix < context.resolutionX; ix += 1) {
        const { x, z } = context.getCenteredNoiseCoordinates(ix, iz);
        const primary = context.noise.sampleFractal2D(x, z, context.octaves, context.persistence, context.lacunarity);
        const detail = context.noise.sample2D(x * 2.1, z * 2.1) * 0.32;
        const distance = context.getNormalizedCenterDistance(ix, iz);
        const plateauLift = 1 - this.scalarMath.smoothstep(0.16, 0.64, distance);
        const shoulder = this.scalarMath.smoothstep(0.24, 0.74, distance);
        const shape = primary * 0.9 + detail + plateauLift * 0.48 - shoulder * 0.12;
        heights[context.getIndex(ix, iz)] = context.clampHeight(context.baseHeight + shape * context.amplitude);
      }
    }

    return new TerrainHeightField(context.width, context.depth, context.resolutionX, context.resolutionZ, heights);
  }
}
