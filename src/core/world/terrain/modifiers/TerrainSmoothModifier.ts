import type { TerrainHeightModifier } from "../TerrainHeightModifier";
import type { TerrainGenerationContext } from "../TerrainGenerationContext";
import { TerrainHeightField } from "../TerrainHeightField";

export class TerrainSmoothModifier implements TerrainHeightModifier {
  public readonly id = "smooth";

  public apply(heightField: TerrainHeightField, context: TerrainGenerationContext): TerrainHeightField {
    const smoothPasses = Math.max(0, Math.round(context.descriptor.generator.shaping?.smoothPasses ?? 0));
    if (smoothPasses <= 0) {
      return heightField;
    }

    let current = heightField.cloneHeights();
    for (let pass = 0; pass < smoothPasses; pass += 1) {
      const snapshot = current.slice();
      for (let iz = 0; iz < context.resolutionZ; iz += 1) {
        for (let ix = 0; ix < context.resolutionX; ix += 1) {
          let sum = 0;
          let count = 0;
          for (let offsetZ = -1; offsetZ <= 1; offsetZ += 1) {
            for (let offsetX = -1; offsetX <= 1; offsetX += 1) {
              const sampleX = ix + offsetX;
              const sampleZ = iz + offsetZ;
              if (sampleX < 0 || sampleX >= context.resolutionX || sampleZ < 0 || sampleZ >= context.resolutionZ) {
                continue;
              }
              sum += snapshot[context.getIndex(sampleX, sampleZ)] ?? context.baseHeight;
              count += 1;
            }
          }
          current[context.getIndex(ix, iz)] = count > 0 ? sum / count : snapshot[context.getIndex(ix, iz)] ?? context.baseHeight;
        }
      }
    }

    return heightField.withHeights(current);
  }
}
