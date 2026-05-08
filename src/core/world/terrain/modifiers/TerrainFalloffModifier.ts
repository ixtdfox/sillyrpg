import type { TerrainHeightModifier } from "../TerrainHeightModifier";
import type { TerrainGenerationContext } from "../TerrainGenerationContext";
import { TerrainHeightField } from "../TerrainHeightField";

export class TerrainFalloffModifier implements TerrainHeightModifier {
  public readonly id = "falloff";

  public apply(heightField: TerrainHeightField, context: TerrainGenerationContext): TerrainHeightField {
    const falloff = context.descriptor.generator.falloff;
    if (!falloff?.enabled || falloff.mode === "none") {
      return heightField;
    }

    const radius = clamp(falloff.radius, 0, 1);
    const strength = clamp(falloff.strength, 0, 1);
    const nextHeights = heightField.cloneHeights();

    for (let iz = 0; iz < context.resolutionZ; iz += 1) {
      for (let ix = 0; ix < context.resolutionX; ix += 1) {
        const index = context.getIndex(ix, iz);
        const distance = context.getNormalizedCenterDistance(ix, iz);
        const fade = smoothstep(radius, 1, distance);
        const current = nextHeights[index] ?? context.baseHeight;

        if (falloff.mode === "island") {
          nextHeights[index] = lerp(current, context.baseHeight - Math.abs(current - context.baseHeight) * strength, fade);
          continue;
        }

        if (falloff.mode === "edgeFade") {
          nextHeights[index] = lerp(current, context.baseHeight, fade * strength);
          continue;
        }

        nextHeights[index] = lerp(
          current,
          context.baseHeight + Math.max(0, current - context.baseHeight) * (1 - strength),
          smoothstep(radius * 0.8, 1, distance)
        );
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
