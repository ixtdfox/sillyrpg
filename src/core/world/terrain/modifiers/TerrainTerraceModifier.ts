import type { TerrainHeightModifier } from "../TerrainHeightModifier";
import type { TerrainGenerationContext } from "../TerrainGenerationContext";
import { TerrainHeightField } from "../TerrainHeightField";

export class TerrainTerraceModifier implements TerrainHeightModifier {
  public readonly id = "terrace";

  public apply(heightField: TerrainHeightField, context: TerrainGenerationContext): TerrainHeightField {
    const terraceSteps = Math.max(0, Math.round(context.descriptor.generator.shaping?.terraceSteps ?? 0));
    if (terraceSteps <= 1 || context.amplitude <= 0) {
      return heightField;
    }

    const nextHeights = heightField.cloneHeights();
    const stepSize = context.amplitude / terraceSteps;
    for (let index = 0; index < nextHeights.length; index += 1) {
      const delta = (nextHeights[index] ?? context.baseHeight) - context.baseHeight;
      nextHeights[index] = context.baseHeight + Math.round(delta / stepSize) * stepSize;
    }

    return heightField.withHeights(nextHeights);
  }
}
