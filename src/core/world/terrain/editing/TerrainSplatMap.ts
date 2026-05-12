export class TerrainSplatMap {
  public readonly resolutionX: number;
  public readonly resolutionZ: number;
  public readonly layerCount: number;
  public readonly weights: Float32Array;

  public constructor(resolutionX: number, resolutionZ: number, layerCount: number, initialLayerIndex = 0) {
    this.resolutionX = normalizeResolution(resolutionX, "resolutionX");
    this.resolutionZ = normalizeResolution(resolutionZ, "resolutionZ");
    this.layerCount = normalizeLayerCount(layerCount);
    this.weights = new Float32Array(this.resolutionX * this.resolutionZ * this.layerCount);

    const layerIndex = clampIndex(initialLayerIndex, this.layerCount);
    for (let iz = 0; iz < this.resolutionZ; iz += 1) {
      for (let ix = 0; ix < this.resolutionX; ix += 1) {
        this.weights[this.getOffset(ix, iz, layerIndex)] = 1;
      }
    }
  }

  public getWeight(ix: number, iz: number, layerIndex: number): number {
    return this.weights[this.getOffset(ix, iz, layerIndex)] ?? 0;
  }

  public setWeight(ix: number, iz: number, layerIndex: number, weight: number): void {
    this.weights[this.getOffset(ix, iz, layerIndex)] = clamp01(weight);
  }

  public normalizeTexel(ix: number, iz: number): void {
    const texelOffset = this.getTexelOffset(ix, iz);
    let sum = 0;

    for (let layerIndex = 0; layerIndex < this.layerCount; layerIndex += 1) {
      const offset = texelOffset + layerIndex;
      const clamped = clamp01(this.weights[offset] ?? 0);
      this.weights[offset] = clamped;
      sum += clamped;
    }

    if (sum <= 0.000001) {
      this.weights[texelOffset] = 1;
      for (let layerIndex = 1; layerIndex < this.layerCount; layerIndex += 1) {
        this.weights[texelOffset + layerIndex] = 0;
      }
      return;
    }

    for (let layerIndex = 0; layerIndex < this.layerCount; layerIndex += 1) {
      const offset = texelOffset + layerIndex;
      this.weights[offset] = (this.weights[offset] ?? 0) / sum;
    }
  }

  public getSplatTextureCount(): number {
    return Math.ceil(this.layerCount / 4);
  }

  public toRgba8ArrayForChunk(chunkIndex: number, flipZ = false): Uint8Array {
    const channelCount = 4;
    const normalizedChunkIndex = normalizeChunkIndex(chunkIndex, this.getSplatTextureCount());
    const baseLayerIndex = normalizedChunkIndex * channelCount;
    const bytes = new Uint8Array(this.resolutionX * this.resolutionZ * channelCount);

    for (let iz = 0; iz < this.resolutionZ; iz += 1) {
      const sourceZ = flipZ ? this.resolutionZ - 1 - iz : iz;
      for (let ix = 0; ix < this.resolutionX; ix += 1) {
        const byteOffset = ((iz * this.resolutionX) + ix) * channelCount;
        for (let channelIndex = 0; channelIndex < channelCount; channelIndex += 1) {
          const layerIndex = baseLayerIndex + channelIndex;
          if (layerIndex < this.layerCount) {
            bytes[byteOffset + channelIndex] = Math.round(clamp01(this.getWeight(ix, sourceZ, layerIndex)) * 255);
          }
        }
      }
    }

    return bytes;
  }

  private getOffset(ix: number, iz: number, layerIndex: number): number {
    return this.getTexelOffset(ix, iz) + clampIndex(layerIndex, this.layerCount);
  }

  private getTexelOffset(ix: number, iz: number): number {
    const x = clampIndex(ix, this.resolutionX);
    const z = clampIndex(iz, this.resolutionZ);
    return ((z * this.resolutionX) + x) * this.layerCount;
  }
}

function normalizeResolution(value: number, label: string): number {
  if (!Number.isFinite(value) || value < 1) {
    throw new Error(`TerrainSplatMap ${label} must be at least 1.`);
  }
  return Math.max(1, Math.round(value));
}

function normalizeLayerCount(value: number): number {
  if (!Number.isFinite(value) || value < 1) {
    throw new Error("TerrainSplatMap layerCount must be at least 1.");
  }
  return Math.max(1, Math.round(value));
}

function normalizeChunkIndex(value: number, count: number): number {
  const rounded = Math.round(value);
  if (!Number.isFinite(value) || rounded < 0 || rounded >= count) {
    throw new Error(`TerrainSplatMap chunkIndex must be between 0 and ${Math.max(0, count - 1)}.`);
  }
  return rounded;
}

function clampIndex(value: number, count: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.min(Math.max(0, count - 1), Math.round(value)));
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.min(1, value));
}
