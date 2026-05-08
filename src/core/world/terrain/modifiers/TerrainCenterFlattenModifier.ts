import type { TerrainHeightModifier } from "../TerrainHeightModifier";
import type { TerrainGenerationContext } from "../TerrainGenerationContext";
import { TerrainHeightField } from "../TerrainHeightField";

export class TerrainCenterFlattenModifier implements TerrainHeightModifier {
  public readonly id = "centerFlatten";

  public apply(heightField: TerrainHeightField, context: TerrainGenerationContext): TerrainHeightField {
    const shaping = context.descriptor.generator.shaping;
    if (!shaping?.flattenCenter) {
      return heightField;
    }

    const centerRadius = clamp(shaping.centerRadius ?? 0.35, 0, 1);
    const nextHeights = heightField.cloneHeights();
    for (let iz = 0; iz < context.resolutionZ; iz += 1) {
      for (let ix = 0; ix < context.resolutionX; ix += 1) {
        const index = context.getIndex(ix, iz);
        const distance = context.getNormalizedCenterDistance(ix, iz);
        const flattenStrength = 1 - smoothstep(0, centerRadius, distance);
        nextHeights[index] = lerp(nextHeights[index] ?? context.baseHeight, context.baseHeight, flattenStrength * 0.92);
      }
    }

    return heightField.withHeights(nextHeights);
  }
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) {
    return min;
  }

  return Math.max(min, Math.min(max, value));
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * Math.max(0, Math.min(1, t));
}

function smoothstep(edge0: number, edge1: number, value: number): number {
  if (edge0 === edge1) {
    return value < edge0 ? 0 : 1;
  }

  const t = Math.max(0, Math.min(1, (value - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}
