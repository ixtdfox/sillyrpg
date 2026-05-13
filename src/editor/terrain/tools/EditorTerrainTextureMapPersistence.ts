import { normalizeAssetPath } from "../../../core/model/SceneAssetPath";
import type { SceneGeneratedTerrainEditedTextureMap, SceneVector2Tuple } from "../../../core/world/scene/SceneDescriptor";
import { TerrainSplatMap } from "../../../core/world/terrain/editing/TerrainSplatMap";
import type { TerrainTextureLayerDescriptor } from "../../../core/world/terrain/editing/TerrainTextureLayer";
import type { EditorSceneSaveAsset } from "../../state/EditorScenePersistence";

export interface SerializedTerrainTextureMapResult {
  readonly editedTextureMap: SceneGeneratedTerrainEditedTextureMap;
  readonly assets: readonly EditorSceneSaveAsset[];
}

export interface LoadedTerrainTextureMapResult {
  readonly splatMap: TerrainSplatMap;
}

export function assertSplatChunksContainPaintWeights(chunks: readonly Uint8Array[]): void {
  if (chunks.length === 0 || chunks.every((chunk) => isAllZeroChunk(chunk))) {
    throw new Error("Saved terrain splat maps contain no paint weights.");
  }
}

export class EditorTerrainTextureMapPersistence {
  public async serialize(input: {
    readonly sceneId: string;
    readonly terrainId: string;
    readonly splatMap: TerrainSplatMap;
    readonly layers: readonly TerrainTextureLayerDescriptor[];
    readonly bakedTexturePath: string;
    readonly bakeResolution: SceneVector2Tuple;
  }): Promise<SerializedTerrainTextureMapResult> {
    if (input.layers.length !== input.splatMap.layerCount) {
      throw new Error("Terrain texture map serialization requires layers to match the splat map layer count.");
    }

    const normalizedSplatMap = input.splatMap.clone();
    normalizeWholeSplatMap(normalizedSplatMap);

    const assets: EditorSceneSaveAsset[] = [];
    const weightPaths: string[] = [];
    let hasNonZeroChunkByte = false;
    for (let chunkIndex = 0; chunkIndex < input.splatMap.getSplatTextureCount(); chunkIndex += 1) {
      const chunkBytes = normalizedSplatMap.toRgba8ArrayForChunk(chunkIndex, true);
      hasNonZeroChunkByte = hasNonZeroChunkByte || chunkBytes.some((value) => value !== 0);
      const assetPath = `assets/generated/terrain/${input.sceneId}/${input.terrainId}_splat_${chunkIndex}.png`;
      weightPaths.push(assetPath);
      assets.push({
        path: assetPath,
        encoding: "dataUrl",
        mimeType: "image/png",
        data: encodeRgbaBytesToPngDataUrl(chunkBytes, normalizedSplatMap.resolutionX, normalizedSplatMap.resolutionZ)
      });
    }

    if (!hasNonZeroChunkByte) {
      throw new Error("Terrain texture map serialization produced only zero-valued splat chunks.");
    }

    return {
      editedTextureMap: {
        encoding: "splatRgba8",
        resolution: [normalizedSplatMap.resolutionX, normalizedSplatMap.resolutionZ],
        layers: input.layers.map((layer) => layer.id),
        weights: weightPaths,
        bakedTexture: input.bakedTexturePath,
        bakeResolution: input.bakeResolution
      },
      assets
    };
  }

  public async load(input: {
    readonly editedTextureMap: SceneGeneratedTerrainEditedTextureMap;
    readonly availableLayers: readonly TerrainTextureLayerDescriptor[];
    readonly maxPaintableLayerCount: number;
  }): Promise<LoadedTerrainTextureMapResult | null> {
    if (input.availableLayers.length === 0) {
      return null;
    }

    const chunks = await Promise.all(
      input.editedTextureMap.weights.map((weightPath) => loadPngRgbaBytes(weightPath, input.editedTextureMap.resolution))
    );
    assertSplatChunksContainPaintWeights(chunks);

    const savedLayerDescriptors = input.editedTextureMap.layers.map((savedLayerId, index) => {
      const availableLayerIndex = input.availableLayers.findIndex((layer) => layer.id === savedLayerId);
      if (availableLayerIndex < 0) {
        throw new Error(`Saved terrain paint layer '${savedLayerId ?? `#${index}`}' is missing from the editor texture registry.`);
      }
      if (availableLayerIndex >= input.maxPaintableLayerCount) {
        throw new Error(
          `Saved terrain paint layer '${savedLayerId}' is unsupported on this graphics device because it exceeds the paintable sampler budget.`
        );
      }

      return {
        savedLayerId,
        availableLayerIndex
      };
    });

    const savedMap = TerrainSplatMap.fromRgba8Chunks(
      input.editedTextureMap.resolution[0],
      input.editedTextureMap.resolution[1],
      input.editedTextureMap.layers.length,
      chunks,
      true
    );

    const remapped = new TerrainSplatMap(savedMap.resolutionX, savedMap.resolutionZ, input.maxPaintableLayerCount);
    remapped.weights.fill(0);

    for (let savedLayerIndex = 0; savedLayerIndex < savedLayerDescriptors.length; savedLayerIndex += 1) {
      const availableLayerIndex = savedLayerDescriptors[savedLayerIndex]?.availableLayerIndex ?? -1;
      for (let iz = 0; iz < savedMap.resolutionZ; iz += 1) {
        for (let ix = 0; ix < savedMap.resolutionX; ix += 1) {
          remapped.setWeight(ix, iz, availableLayerIndex, savedMap.getWeight(ix, iz, savedLayerIndex));
        }
      }
    }

    for (let iz = 0; iz < remapped.resolutionZ; iz += 1) {
      for (let ix = 0; ix < remapped.resolutionX; ix += 1) {
        remapped.normalizeTexel(ix, iz);
      }
    }

    return {
      splatMap: remapped
    };
  }
}

function normalizeWholeSplatMap(splatMap: TerrainSplatMap): void {
  for (let iz = 0; iz < splatMap.resolutionZ; iz += 1) {
    for (let ix = 0; ix < splatMap.resolutionX; ix += 1) {
      splatMap.normalizeTexel(ix, iz);
    }
  }
}

function isAllZeroChunk(chunk: Uint8Array): boolean {
  return !chunk.some((value) => value !== 0);
}

function encodeRgbaBytesToPngDataUrl(bytes: Uint8Array, width: number, height: number): string {
  const packed = packRawSplatChunkForOpaquePng(bytes, width, height);
  const canvas = createCanvas(packed.width, packed.height);
  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("Terrain texture map persistence could not acquire a 2D canvas context.");
  }

  const imageData = context.createImageData(packed.width, packed.height);
  imageData.data.set(packed.bytes);
  context.putImageData(imageData, 0, 0);
  return canvas.toDataURL("image/png");
}

async function loadPngRgbaBytes(assetPath: string, resolution: SceneVector2Tuple): Promise<Uint8Array> {
  const image = await loadImage(normalizeAssetPath(assetPath));
  const canvas = createCanvas(Math.max(resolution[0], resolution[0] * 2), resolution[1]);
  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("Terrain texture map persistence could not acquire a 2D canvas context.");
  }

  if ("imageSmoothingEnabled" in context) {
    context.imageSmoothingEnabled = false;
  }
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.drawImage(image, 0, 0, image.width, image.height);
  const imageData = context.getImageData(0, 0, image.width, image.height);
  return unpackOpaquePngToRawSplatChunk(new Uint8Array(imageData.data), image.width, image.height, resolution);
}

export function packRawSplatChunkForOpaquePng(
  bytes: Uint8Array,
  width: number,
  height: number
): { readonly bytes: Uint8Array; readonly width: number; readonly height: number } {
  const expectedLength = width * height * 4;
  if (bytes.length !== expectedLength) {
    throw new Error(`Terrain splat chunk must contain ${expectedLength} rgba bytes.`);
  }

  const packedWidth = width * 2;
  const packed = new Uint8Array(packedWidth * height * 4);
  for (let pixelIndex = 0; pixelIndex < width * height; pixelIndex += 1) {
    const sourceOffset = pixelIndex * 4;
    const packedOffset = pixelIndex * 8;
    packed[packedOffset] = bytes[sourceOffset] ?? 0;
    packed[packedOffset + 1] = bytes[sourceOffset + 1] ?? 0;
    packed[packedOffset + 2] = bytes[sourceOffset + 2] ?? 0;
    packed[packedOffset + 3] = 255;
    packed[packedOffset + 4] = bytes[sourceOffset + 3] ?? 0;
    packed[packedOffset + 5] = 0;
    packed[packedOffset + 6] = 0;
    packed[packedOffset + 7] = 255;
  }

  return {
    bytes: packed,
    width: packedWidth,
    height
  };
}

export function unpackOpaquePngToRawSplatChunk(
  bytes: Uint8Array,
  imageWidth: number,
  imageHeight: number,
  resolution: SceneVector2Tuple
): Uint8Array {
  if (imageHeight !== resolution[1]) {
    throw new Error(
      `Terrain splat asset height ${imageHeight} does not match expected resolution height ${resolution[1]}.`
    );
  }

  if (imageWidth === resolution[0]) {
    return bytes;
  }

  if (imageWidth !== resolution[0] * 2) {
    throw new Error(
      `Terrain splat asset width ${imageWidth} does not match expected width ${resolution[0]} or packed width ${resolution[0] * 2}.`
    );
  }

  const unpacked = new Uint8Array(resolution[0] * resolution[1] * 4);
  for (let pixelIndex = 0; pixelIndex < resolution[0] * resolution[1]; pixelIndex += 1) {
    const packedOffset = pixelIndex * 8;
    const unpackedOffset = pixelIndex * 4;
    unpacked[unpackedOffset] = bytes[packedOffset] ?? 0;
    unpacked[unpackedOffset + 1] = bytes[packedOffset + 1] ?? 0;
    unpacked[unpackedOffset + 2] = bytes[packedOffset + 2] ?? 0;
    unpacked[unpackedOffset + 3] = bytes[packedOffset + 4] ?? 0;
  }

  return unpacked;
}

function createCanvas(width: number, height: number): HTMLCanvasElement {
  if (typeof document === "undefined") {
    throw new Error("Terrain texture map persistence requires a browser document.");
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
    image.onerror = () => reject(new Error(`Failed to load terrain splat asset '${url}'.`));
    image.src = url;
  });
}
