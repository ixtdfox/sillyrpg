import type { TerrainGenerationStrategy } from "../TerrainGenerationStrategy";
import type { TerrainGenerationContext } from "../TerrainGenerationContext";
import { TerrainHeightField } from "../TerrainHeightField";

export class IslandPlateauTerrainStrategy implements TerrainGenerationStrategy {
  public readonly id = "islandPlateau";

  public generate(context: TerrainGenerationContext): TerrainHeightField {
    const heights = new Float32Array(context.resolutionX * context.resolutionZ);
    for (let iz = 0; iz < context.resolutionZ; iz += 1) {
      for (let ix = 0; ix < context.resolutionX; ix += 1) {
        const { x, z } = context.getCenteredNoiseCoordinates(ix, iz);
        const primary = context.noise.sampleFractal2D(x, z, context.octaves, context.persistence, context.lacunarity);
        const detail = context.noise.sample2D(x * 2.1, z * 2.1) * 0.32;
        const distance = context.getNormalizedCenterDistance(ix, iz);
        const plateauLift = 1 - smoothstep(0.16, 0.64, distance);
        const shoulder = smoothstep(0.24, 0.74, distance);
        const shape = primary * 0.9 + detail + plateauLift * 0.48 - shoulder * 0.12;
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
