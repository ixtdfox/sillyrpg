import type { TerrainHeightModifier } from "../TerrainHeightModifier";
import type { TerrainGenerationContext } from "../TerrainGenerationContext";
import { TerrainHeightField } from "../TerrainHeightField";
import { TerrainScalarMath } from "../TerrainMath";

/**
 * Modifier выравнивания центральной зоны terrain.
 */
export class TerrainCenterFlattenModifier implements TerrainHeightModifier {
  public readonly id = "centerFlatten";
  private readonly scalarMath: TerrainScalarMath;

  public constructor(scalarMath = new TerrainScalarMath()) {
    this.scalarMath = scalarMath;
  }

  /**
   * Мягко смешивает высоты в центре с baseHeight.
   */
  public apply(heightField: TerrainHeightField, context: TerrainGenerationContext): TerrainHeightField {
    const shaping = context.descriptor.generator.shaping;
    if (!shaping?.flattenCenter) {
      return heightField;
    }

    const centerRadius = this.scalarMath.clamp(shaping.centerRadius ?? 0.35, 0, 1);
    const nextHeights = heightField.cloneHeights();
    for (let iz = 0; iz < context.resolutionZ; iz += 1) {
      for (let ix = 0; ix < context.resolutionX; ix += 1) {
        const index = context.getIndex(ix, iz);
        const distance = context.getNormalizedCenterDistance(ix, iz);
        const flattenStrength = 1 - this.scalarMath.smoothstep(0, centerRadius, distance);
        nextHeights[index] = this.scalarMath.lerpClamped(nextHeights[index] ?? context.baseHeight, context.baseHeight, flattenStrength * 0.92);
      }
    }

    return heightField.withHeights(nextHeights);
  }
}
