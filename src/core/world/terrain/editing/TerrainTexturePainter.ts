import { getBrushWeight } from "./TerrainBrushMask";
import type { TerrainBrushCenter, TerrainBrushSettings } from "./TerrainBrushTypes";
import type { TerrainSplatMap } from "./TerrainSplatMap";

const TEXTURE_PAINT_STRENGTH_SCALE = 0.1;

export interface TerrainTexturePaintOptions {
  readonly center: TerrainBrushCenter;
  readonly terrainWidth: number;
  readonly terrainDepth: number;
  readonly brush: TerrainBrushSettings;
  readonly layerIndex: number;
  readonly deltaTime: number;
}

export interface TerrainTexturePaintResult {
  readonly changedTexelCount: number;
}

export class TerrainTexturePainter {
  public paint(splatMap: TerrainSplatMap, options: TerrainTexturePaintOptions): TerrainTexturePaintResult {
    if (options.layerIndex < 0 || options.layerIndex >= splatMap.layerCount) {
      return { changedTexelCount: 0 };
    }

    const paintAmount = clamp01(Math.abs(options.brush.strength) * TEXTURE_PAINT_STRENGTH_SCALE * clampDeltaTime(options.deltaTime));
    if (paintAmount <= 0) {
      return { changedTexelCount: 0 };
    }

    const radius = Math.max(0.0001, options.brush.radius);
    const terrainWidth = Math.max(0.0001, Math.abs(options.terrainWidth));
    const terrainDepth = Math.max(0.0001, Math.abs(options.terrainDepth));
    let changedTexelCount = 0;

    for (let iz = 0; iz < splatMap.resolutionZ; iz += 1) {
      const v = splatMap.resolutionZ <= 1 ? 0.5 : iz / (splatMap.resolutionZ - 1);
      const z = (0.5 - v) * terrainDepth;
      for (let ix = 0; ix < splatMap.resolutionX; ix += 1) {
        const u = splatMap.resolutionX <= 1 ? 0.5 : ix / (splatMap.resolutionX - 1);
        const x = (u - 0.5) * terrainWidth;
        const brushWeight = getBrushWeight(
          options.brush.shape,
          x - options.center.x,
          z - options.center.z,
          radius,
          options.brush.falloff
        );
        const influence = clamp01(brushWeight * paintAmount);
        if (influence <= 0) {
          continue;
        }

        this.paintTexel(splatMap, ix, iz, options.layerIndex, influence);
        changedTexelCount += 1;
      }
    }

    return { changedTexelCount };
  }

  private paintTexel(
    splatMap: TerrainSplatMap,
    ix: number,
    iz: number,
    selectedLayerIndex: number,
    influence: number
  ): void {
    const currentSelectedWeight = splatMap.getWeight(ix, iz, selectedLayerIndex);
    const nextSelectedWeight = clamp01(currentSelectedWeight + ((1 - currentSelectedWeight) * influence));
    const currentOtherWeight = 1 - currentSelectedWeight;
    const nextOtherWeight = 1 - nextSelectedWeight;
    const otherScale = currentOtherWeight > 0.000001 ? nextOtherWeight / currentOtherWeight : 0;

    for (let layerIndex = 0; layerIndex < splatMap.layerCount; layerIndex += 1) {
      if (layerIndex === selectedLayerIndex) {
        splatMap.setWeight(ix, iz, layerIndex, nextSelectedWeight);
      } else {
        splatMap.setWeight(ix, iz, layerIndex, splatMap.getWeight(ix, iz, layerIndex) * otherScale);
      }
    }
    splatMap.normalizeTexel(ix, iz);
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
