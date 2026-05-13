import type { SceneVector2Tuple } from "../../../core/world/scene/SceneDescriptor";
import { resolveTerrainSplatTileScale } from "../../../core/world/terrain/TerrainSplatMaterialBuilder";
import type { TerrainSplatMap } from "../../../core/world/terrain/editing/TerrainSplatMap";
import type { TerrainTextureLayerDescriptor } from "../../../core/world/terrain/editing/TerrainTextureLayer";

const DEFAULT_BAKE_PIXELS_PER_WORLD_UNIT = 32;
const MIN_BAKE_RESOLUTION = 1024;
const MAX_BAKE_RESOLUTION = 4096;
const LAYER_SAMPLE_SIZE = 256;

interface LayerImageSample {
  readonly width: number;
  readonly height: number;
  readonly data: Uint8ClampedArray;
}

export interface EditorTerrainTextureBakeInput {
  readonly splatMap: TerrainSplatMap;
  readonly layers: readonly TerrainTextureLayerDescriptor[];
  readonly terrainWidth: number;
  readonly terrainDepth: number;
  readonly outputResolution?: SceneVector2Tuple;
}

export class EditorTerrainTextureBakeService {
  public async bakeToDataUrl(input: EditorTerrainTextureBakeInput): Promise<string> {
    if (input.layers.length === 0) {
      throw new Error("Terrain texture baking requires at least one texture layer.");
    }
    if (input.layers.length !== input.splatMap.layerCount) {
      throw new Error("Terrain texture baking requires the layer count to match the splat map.");
    }

    const outputResolution = input.outputResolution ?? resolveTerrainBakeResolution(input.terrainWidth, input.terrainDepth);
    const layerImages = await Promise.all(input.layers.map((layer) => this.loadLayerImage(layer)));
    const canvas = createCanvas(outputResolution[0], outputResolution[1]);
    const context = canvas.getContext("2d");
    if (!context) {
      throw new Error("Terrain texture baking could not acquire a 2D canvas context.");
    }

    const imageData = context.createImageData(outputResolution[0], outputResolution[1]);
    const tileScale = resolveTerrainSplatTileScale(input.terrainWidth, input.terrainDepth);
    const target = imageData.data;

    for (let y = 0; y < outputResolution[1]; y += 1) {
      const textureV = outputResolution[1] <= 1 ? 0 : y / (outputResolution[1] - 1);
      const rowUv = resolveBakeUvRow(textureV);
      const terrainV = rowUv.terrainV;
      const layerUvV = rowUv.layerUvV;
      for (let x = 0; x < outputResolution[0]; x += 1) {
        const textureU = outputResolution[0] <= 1 ? 0 : x / (outputResolution[0] - 1);
        const columnUv = resolveBakeUvColumn(textureU);
        const terrainU = columnUv.terrainU;
        const layerUvU = columnUv.layerUvU;
        const pixelOffset = ((y * outputResolution[0]) + x) * 4;
        let red = 0;
        let green = 0;
        let blue = 0;
        let totalWeight = 0;

        for (let layerIndex = 0; layerIndex < input.layers.length; layerIndex += 1) {
          const weight = input.splatMap.sampleWeightBilinear(terrainU, terrainV, layerIndex);
          if (weight <= 0.0001) {
            continue;
          }

          const sample = sampleLayerColor(layerImages[layerIndex]!, layerUvU, layerUvV, tileScale);
          red += sample[0] * weight;
          green += sample[1] * weight;
          blue += sample[2] * weight;
          totalWeight += weight;
        }

        const divisor = Math.max(totalWeight, 0.0001);
        target[pixelOffset] = clampByte(red / divisor);
        target[pixelOffset + 1] = clampByte(green / divisor);
        target[pixelOffset + 2] = clampByte(blue / divisor);
        target[pixelOffset + 3] = 255;
      }
    }

    context.putImageData(imageData, 0, 0);
    return canvas.toDataURL("image/png");
  }

  private async loadLayerImage(layer: TerrainTextureLayerDescriptor): Promise<LayerImageSample> {
    const canvas = createCanvas(LAYER_SAMPLE_SIZE, LAYER_SAMPLE_SIZE);
    const context = canvas.getContext("2d");
    if (!context) {
      throw new Error("Terrain texture baking could not acquire a 2D canvas context.");
    }

    context.fillStyle = resolveFallbackLayerColor(layer.id);
    context.fillRect(0, 0, LAYER_SAMPLE_SIZE, LAYER_SAMPLE_SIZE);
    if ("imageSmoothingEnabled" in context) {
      context.imageSmoothingEnabled = true;
    }

    try {
      const image = await loadImage(layer.url);
      context.drawImage(image, 0, 0, LAYER_SAMPLE_SIZE, LAYER_SAMPLE_SIZE);
    } catch {
      // Keep the deterministic fallback fill so save still succeeds even if a source texture is missing.
    }

    const imageData = context.getImageData(0, 0, LAYER_SAMPLE_SIZE, LAYER_SAMPLE_SIZE);
    return {
      width: imageData.width,
      height: imageData.height,
      data: imageData.data
    };
  }
}

export function resolveTerrainBakeResolution(terrainWidth: number, terrainDepth: number): SceneVector2Tuple {
  const maxWorldSize = Math.max(Math.abs(terrainWidth), Math.abs(terrainDepth), 1);
  const resolution = clampPowerOfTwo(maxWorldSize * DEFAULT_BAKE_PIXELS_PER_WORLD_UNIT, MIN_BAKE_RESOLUTION, MAX_BAKE_RESOLUTION);
  return [resolution, resolution] as const;
}

export function resolveBakeUvColumn(textureU: number): { readonly terrainU: number; readonly layerUvU: number } {
  return {
    terrainU: textureU,
    layerUvU: textureU
  };
}

export function resolveBakeUvRow(textureV: number): { readonly terrainV: number; readonly layerUvV: number } {
  return {
    terrainV: 1 - textureV,
    layerUvV: textureV
  };
}

function createCanvas(width: number, height: number): HTMLCanvasElement {
  if (typeof document === "undefined") {
    throw new Error("Terrain texture baking requires a browser document.");
  }

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`Failed to load terrain texture '${url}'.`));
    image.src = url;
  });
}

function sampleLayerColor(
  image: LayerImageSample,
  u: number,
  v: number,
  tileScale: number
): readonly [number, number, number] {
  const sampleU = clampAtlasUv(fract(u * tileScale));
  const sampleV = clampAtlasUv(fract(v * tileScale));
  const x = sampleU * Math.max(0, image.width - 1);
  const y = sampleV * Math.max(0, image.height - 1);
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const x1 = Math.min(image.width - 1, x0 + 1);
  const y1 = Math.min(image.height - 1, y0 + 1);
  const tx = x - x0;
  const ty = y - y0;

  return [
    bilinearChannel(image, x0, y0, x1, y1, tx, ty, 0),
    bilinearChannel(image, x0, y0, x1, y1, tx, ty, 1),
    bilinearChannel(image, x0, y0, x1, y1, tx, ty, 2)
  ] as const;
}

function fract(value: number): number {
  return value - Math.floor(value);
}

function clampAtlasUv(value: number): number {
  return Math.max(0.002, Math.min(0.998, value));
}

function clampByte(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.max(0, Math.min(255, Math.round(value)));
}

function bilinearChannel(
  image: LayerImageSample,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  tx: number,
  ty: number,
  channel: number
): number {
  const c00 = readChannel(image, x0, y0, channel);
  const c10 = readChannel(image, x1, y0, channel);
  const c01 = readChannel(image, x0, y1, channel);
  const c11 = readChannel(image, x1, y1, channel);
  return lerp(lerp(c00, c10, tx), lerp(c01, c11, tx), ty);
}

function readChannel(image: LayerImageSample, x: number, y: number, channel: number): number {
  const offset = ((y * image.width) + x) * 4;
  return image.data[offset + channel] ?? 0;
}

function clampPowerOfTwo(value: number, min: number, max: number): number {
  const clamped = Math.max(min, Math.min(max, Math.round(value)));
  let power = 1;
  while (power < clamped) {
    power *= 2;
  }
  return Math.max(min, Math.min(max, power));
}

function lerp(a: number, b: number, t: number): number {
  return a + ((b - a) * t);
}

function resolveFallbackLayerColor(layerId: string): string {
  let hash = 0;
  for (let index = 0; index < layerId.length; index += 1) {
    hash = ((hash << 5) - hash + layerId.charCodeAt(index)) | 0;
  }
  const hue = Math.abs(hash) % 360;
  return `hsl(${hue}, 36%, 48%)`;
}
