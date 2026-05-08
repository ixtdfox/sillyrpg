import { WORLD_GRID_ORIGIN_Y } from "../../../grid/WorldGridConstants";
import { TerrainHeightField } from "../TerrainHeightField";
import { getBrushWeight } from "./TerrainBrushMask";
import type { TerrainBrushCenter, TerrainToolSettings } from "./TerrainBrushTypes";

export class TerrainHeightEditor {
  public raise(field: TerrainHeightField, center: TerrainBrushCenter, settings: TerrainToolSettings, deltaTime: number): TerrainHeightField {
    return this.applyDelta(field, center, settings, Math.abs(settings.brush.strength) * clampDeltaTime(deltaTime));
  }

  public lower(field: TerrainHeightField, center: TerrainBrushCenter, settings: TerrainToolSettings, deltaTime: number): TerrainHeightField {
    return this.applyDelta(field, center, settings, -Math.abs(settings.brush.strength) * clampDeltaTime(deltaTime));
  }

  public smooth(field: TerrainHeightField, center: TerrainBrushCenter, settings: TerrainToolSettings, deltaTime: number): TerrainHeightField {
    const nextHeights = field.cloneHeights();
    const average = this.computeWeightedAverage(field, center, settings);
    const blendRate = clamp01(settings.brush.strength * clampDeltaTime(deltaTime));

    this.forEachBrushVertex(field, center, settings, (index, weight) => {
      const current = nextHeights[index] ?? 0;
      const blend = clamp01(blendRate * weight);
      nextHeights[index] = current + (average - current) * blend;
    });

    return field.withHeights(nextHeights);
  }

  public flattenToSample(
    field: TerrainHeightField,
    center: TerrainBrushCenter,
    settings: TerrainToolSettings,
    sampledHeight: number,
    deltaTime: number
  ): TerrainHeightField {
    return this.flattenToHeight(field, center, settings, sampledHeight, deltaTime);
  }

  public flattenToHeight(
    field: TerrainHeightField,
    center: TerrainBrushCenter,
    settings: TerrainToolSettings,
    targetHeight: number,
    deltaTime: number
  ): TerrainHeightField {
    const nextHeights = field.cloneHeights();
    const blendRate = clamp01(settings.brush.strength * clampDeltaTime(deltaTime));

    this.forEachBrushVertex(field, center, settings, (index, weight) => {
      const current = nextHeights[index] ?? 0;
      const blend = clamp01(blendRate * weight);
      nextHeights[index] = current + (targetHeight - current) * blend;
    });

    return field.withHeights(nextHeights);
  }

  public flattenAll(field: TerrainHeightField, height = 0): TerrainHeightField {
    return TerrainHeightField.createFilled(field.width, field.depth, field.resolutionX, field.resolutionZ, height);
  }

  public quantizeHeights(field: TerrainHeightField, step: number): TerrainHeightField {
    const safeStep = Math.max(0.0001, step);
    const nextHeights = field.cloneHeights();
    for (let index = 0; index < nextHeights.length; index += 1) {
      nextHeights[index] =
        WORLD_GRID_ORIGIN_Y + Math.round(((nextHeights[index] ?? 0) - WORLD_GRID_ORIGIN_Y) / safeStep) * safeStep;
    }
    return field.withHeights(nextHeights);
  }

  private applyDelta(
    field: TerrainHeightField,
    center: TerrainBrushCenter,
    settings: TerrainToolSettings,
    signedStrength: number
  ): TerrainHeightField {
    const nextHeights = field.cloneHeights();
    this.forEachBrushVertex(field, center, settings, (index, weight) => {
      nextHeights[index] = (nextHeights[index] ?? 0) + signedStrength * weight;
    });
    return field.withHeights(nextHeights);
  }

  private computeWeightedAverage(field: TerrainHeightField, center: TerrainBrushCenter, settings: TerrainToolSettings): number {
    let weightedSum = 0;
    let totalWeight = 0;

    this.forEachBrushVertex(field, center, settings, (index, weight) => {
      weightedSum += (field.heights[index] ?? 0) * weight;
      totalWeight += weight;
    });

    return totalWeight > 0 ? weightedSum / totalWeight : 0;
  }

  private forEachBrushVertex(
    field: TerrainHeightField,
    center: TerrainBrushCenter,
    settings: TerrainToolSettings,
    callback: (index: number, weight: number, x: number, z: number) => void
  ): void {
    for (let iz = 0; iz < field.resolutionZ; iz += 1) {
      const v = field.resolutionZ <= 1 ? 0 : iz / (field.resolutionZ - 1);
      const z = (0.5 - v) * field.depth;
      for (let ix = 0; ix < field.resolutionX; ix += 1) {
        const u = field.resolutionX <= 1 ? 0 : ix / (field.resolutionX - 1);
        const x = (u - 0.5) * field.width;
        const weight = getBrushWeight(
          settings.brush.shape,
          x - center.x,
          z - center.z,
          settings.brush.radius,
          settings.brush.falloff
        );
        if (weight <= 0) {
          continue;
        }
        callback(iz * field.resolutionX + ix, weight, x, z);
      }
    }
  }
}

function clampDeltaTime(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.max(0, Math.min(0.25, value));
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.max(0, Math.min(1, value));
}
