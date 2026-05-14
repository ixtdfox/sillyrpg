import type { TerrainHeightModifier } from "../TerrainHeightModifier";
import type { TerrainGenerationContext } from "../TerrainGenerationContext";
import { TerrainHeightField } from "../TerrainHeightField";
import { TerrainScalarMath } from "../TerrainMath";

/**
 * Modifier edge/island falloff для terrain heights.
 */
export class TerrainFalloffModifier implements TerrainHeightModifier {
  public readonly id = "falloff";
  private readonly scalarMath: TerrainScalarMath;

  public constructor(scalarMath = new TerrainScalarMath()) {
    this.scalarMath = scalarMath;
  }

  /**
   * Применяет falloff mode из descriptor generator.
   */
  public apply(heightField: TerrainHeightField, context: TerrainGenerationContext): TerrainHeightField {
    const falloff = context.descriptor.generator.falloff;
    if (!falloff?.enabled || falloff.mode === "none") {
      return heightField;
    }

    const radius = this.scalarMath.clamp(falloff.radius, 0, 1);
    const strength = this.scalarMath.clamp(falloff.strength, 0, 1);
    const nextHeights = heightField.cloneHeights();

    for (let iz = 0; iz < context.resolutionZ; iz += 1) {
      for (let ix = 0; ix < context.resolutionX; ix += 1) {
        const index = context.getIndex(ix, iz);
        const distance = context.getNormalizedCenterDistance(ix, iz);
        const fade = this.scalarMath.smoothstep(radius, 1, distance);
        const current = nextHeights[index] ?? context.baseHeight;

        if (falloff.mode === "island") {
          nextHeights[index] = this.scalarMath.lerpClamped(current, context.baseHeight - Math.abs(current - context.baseHeight) * strength, fade);
          continue;
        }

        if (falloff.mode === "edgeFade") {
          nextHeights[index] = this.scalarMath.lerpClamped(current, context.baseHeight, fade * strength);
          continue;
        }

        nextHeights[index] = this.scalarMath.lerpClamped(
          current,
          context.baseHeight + Math.max(0, current - context.baseHeight) * (1 - strength),
          this.scalarMath.smoothstep(radius * 0.8, 1, distance)
        );
      }
    }

    return heightField.withHeights(nextHeights);
  }
}
