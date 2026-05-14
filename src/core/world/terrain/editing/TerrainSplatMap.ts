import { TerrainIndexMath, TerrainScalarMath } from "../TerrainMath";

/**
 * Политика индексов и размеров splat map.
 */
class TerrainSplatMapIndexPolicy {
  private readonly indexMath: TerrainIndexMath;

  public constructor(indexMath = new TerrainIndexMath()) {
    this.indexMath = indexMath;
  }

  /**
   * Нормализует resolution splat map и валидирует минимальный размер.
   */
  public normalizeResolution(value: number, label: string): number {
    return this.indexMath.normalizePositiveResolution(value, label);
  }

  /**
   * Нормализует количество texture layers.
   */
  public normalizeLayerCount(value: number): number {
    if (!Number.isFinite(value) || value < 1) {
      throw new Error("TerrainSplatMap layerCount must be at least 1.");
    }
    return Math.max(1, Math.round(value));
  }

  /**
   * Проверяет индекс texture chunk и возвращает безопасное целое значение.
   */
  public normalizeChunkIndex(value: number, count: number): number {
    return this.indexMath.normalizeChunkIndex(value, count);
  }

  /**
   * Округляет координату texel/layer и зажимает ее в допустимый диапазон.
   */
  public clampIndex(value: number, count: number): number {
    return this.indexMath.clampIndex(value, count);
  }
}

/**
 * Карта весов texture layers для terrain splat painting.
 */
export class TerrainSplatMap {
  public readonly resolutionX: number;
  public readonly resolutionZ: number;
  public readonly layerCount: number;
  public readonly weights: Float32Array;
  private readonly scalarMath: TerrainScalarMath;
  private readonly indexPolicy: TerrainSplatMapIndexPolicy;

  public constructor(
    resolutionX: number,
    resolutionZ: number,
    layerCount: number,
    initialLayerIndex = 0,
    scalarMath = new TerrainScalarMath(),
    indexPolicy = new TerrainSplatMapIndexPolicy()
  ) {
    this.scalarMath = scalarMath;
    this.indexPolicy = indexPolicy;
    this.resolutionX = this.indexPolicy.normalizeResolution(resolutionX, "resolutionX");
    this.resolutionZ = this.indexPolicy.normalizeResolution(resolutionZ, "resolutionZ");
    this.layerCount = this.indexPolicy.normalizeLayerCount(layerCount);
    this.weights = new Float32Array(this.resolutionX * this.resolutionZ * this.layerCount);

    const layerIndex = this.indexPolicy.clampIndex(initialLayerIndex, this.layerCount);
    for (let iz = 0; iz < this.resolutionZ; iz += 1) {
      for (let ix = 0; ix < this.resolutionX; ix += 1) {
        this.weights[this.getOffset(ix, iz, layerIndex)] = 1;
      }
    }
  }

  /**
   * Читает вес layer в texel ix/iz.
   */
  public getWeight(ix: number, iz: number, layerIndex: number): number {
    return this.weights[this.getOffset(ix, iz, layerIndex)] ?? 0;
  }

  /**
   * Устанавливает вес layer с clamp в [0..1].
   */
  public setWeight(ix: number, iz: number, layerIndex: number, weight: number): void {
    this.weights[this.getOffset(ix, iz, layerIndex)] = this.scalarMath.clamp01(weight);
  }

  /**
   * Нормализует веса одного texel так, чтобы сумма была равна единице.
   */
  public normalizeTexel(ix: number, iz: number): void {
    const texelOffset = this.getTexelOffset(ix, iz);
    let sum = 0;

    for (let layerIndex = 0; layerIndex < this.layerCount; layerIndex += 1) {
      const offset = texelOffset + layerIndex;
      const clamped = this.scalarMath.clamp01(this.weights[offset] ?? 0);
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

  /**
   * Возвращает количество RGBA splat textures, нужных для всех layers.
   */
  public getSplatTextureCount(): number {
    return Math.ceil(this.layerCount / 4);
  }

  /**
   * Глубоко клонирует карту весов.
   */
  public clone(): TerrainSplatMap {
    const clone = new TerrainSplatMap(this.resolutionX, this.resolutionZ, this.layerCount);
    clone.weights.set(this.weights);
    return clone;
  }

  /**
   * Восстанавливает splat map из RGBA chunks.
   */
  public static fromRgba8Chunks(
    resolutionX: number,
    resolutionZ: number,
    layerCount: number,
    chunks: readonly Uint8Array[],
    flipZ = false
  ): TerrainSplatMap {
    const map = new TerrainSplatMap(resolutionX, resolutionZ, layerCount);
    map.weights.fill(0);

    const chunkCount = map.getSplatTextureCount();
    if (chunks.length !== chunkCount) {
      throw new Error(`TerrainSplatMap expected ${chunkCount} rgba chunk(s), received ${chunks.length}.`);
    }

    const channelCount = 4;
    const expectedByteLength = map.resolutionX * map.resolutionZ * channelCount;
    for (let chunkIndex = 0; chunkIndex < chunkCount; chunkIndex += 1) {
      const chunk = chunks[chunkIndex];
      if (!chunk) {
        throw new Error(`TerrainSplatMap chunk ${chunkIndex} is missing.`);
      }
      if (chunk.length !== expectedByteLength) {
        throw new Error(`TerrainSplatMap chunk ${chunkIndex} must contain ${expectedByteLength} bytes.`);
      }

      const baseLayerIndex = chunkIndex * channelCount;
      for (let iz = 0; iz < map.resolutionZ; iz += 1) {
        const targetZ = flipZ ? map.resolutionZ - 1 - iz : iz;
        for (let ix = 0; ix < map.resolutionX; ix += 1) {
          const byteOffset = ((iz * map.resolutionX) + ix) * channelCount;
          for (let channelIndex = 0; channelIndex < channelCount; channelIndex += 1) {
            const layerIndex = baseLayerIndex + channelIndex;
            if (layerIndex >= map.layerCount) {
              continue;
            }

            map.setWeight(ix, targetZ, layerIndex, (chunk[byteOffset + channelIndex] ?? 0) / 255);
          }
        }
      }
    }

    for (let iz = 0; iz < map.resolutionZ; iz += 1) {
      for (let ix = 0; ix < map.resolutionX; ix += 1) {
        map.normalizeTexel(ix, iz);
      }
    }

    return map;
  }

  /**
   * Возвращает resampled copy с новым resolution.
   */
  public resampled(resolutionX: number, resolutionZ: number): TerrainSplatMap {
    const nextResolutionX = this.indexPolicy.normalizeResolution(resolutionX, "resolutionX");
    const nextResolutionZ = this.indexPolicy.normalizeResolution(resolutionZ, "resolutionZ");
    if (nextResolutionX === this.resolutionX && nextResolutionZ === this.resolutionZ) {
      return this.clone();
    }

    const resampled = new TerrainSplatMap(nextResolutionX, nextResolutionZ, this.layerCount);
    resampled.weights.fill(0);

    for (let iz = 0; iz < nextResolutionZ; iz += 1) {
      const v = nextResolutionZ <= 1 ? 0 : iz / (nextResolutionZ - 1);
      for (let ix = 0; ix < nextResolutionX; ix += 1) {
        const u = nextResolutionX <= 1 ? 0 : ix / (nextResolutionX - 1);
        for (let layerIndex = 0; layerIndex < this.layerCount; layerIndex += 1) {
          resampled.setWeight(ix, iz, layerIndex, this.sampleWeightBilinear(u, v, layerIndex));
        }
        resampled.normalizeTexel(ix, iz);
      }
    }

    return resampled;
  }

  /**
   * Экспортирует один splat texture chunk в RGBA8.
   */
  public toRgba8ArrayForChunk(chunkIndex: number, flipZ = false): Uint8Array {
    const channelCount = 4;
    const normalizedChunkIndex = this.indexPolicy.normalizeChunkIndex(chunkIndex, this.getSplatTextureCount());
    const baseLayerIndex = normalizedChunkIndex * channelCount;
    const bytes = new Uint8Array(this.resolutionX * this.resolutionZ * channelCount);

    for (let iz = 0; iz < this.resolutionZ; iz += 1) {
      const sourceZ = flipZ ? this.resolutionZ - 1 - iz : iz;
      for (let ix = 0; ix < this.resolutionX; ix += 1) {
        const byteOffset = ((iz * this.resolutionX) + ix) * channelCount;
        for (let channelIndex = 0; channelIndex < channelCount; channelIndex += 1) {
          const layerIndex = baseLayerIndex + channelIndex;
          if (layerIndex < this.layerCount) {
            bytes[byteOffset + channelIndex] = Math.round(this.scalarMath.clamp01(this.getWeight(ix, sourceZ, layerIndex)) * 255);
          }
        }
      }
    }

    return bytes;
  }

  /**
   * Читает weight в UV-пространстве через bilinear interpolation.
   */
  public sampleWeightBilinear(u: number, v: number, layerIndex: number): number {
    const x = this.scalarMath.clamp01(u) * Math.max(0, this.resolutionX - 1);
    const z = this.scalarMath.clamp01(v) * Math.max(0, this.resolutionZ - 1);
    const x0 = Math.floor(x);
    const z0 = Math.floor(z);
    const x1 = Math.min(this.resolutionX - 1, x0 + 1);
    const z1 = Math.min(this.resolutionZ - 1, z0 + 1);
    const tx = x - x0;
    const tz = z - z0;

    const w00 = this.getWeight(x0, z0, layerIndex);
    const w10 = this.getWeight(x1, z0, layerIndex);
    const w01 = this.getWeight(x0, z1, layerIndex);
    const w11 = this.getWeight(x1, z1, layerIndex);
    return this.scalarMath.lerp(
      this.scalarMath.lerp(w00, w10, tx),
      this.scalarMath.lerp(w01, w11, tx),
      tz
    );
  }

  /**
   * Возвращает offset конкретного layer внутри weights buffer.
   */
  private getOffset(ix: number, iz: number, layerIndex: number): number {
    return this.getTexelOffset(ix, iz) + this.indexPolicy.clampIndex(layerIndex, this.layerCount);
  }

  /**
   * Возвращает offset первого layer для texel ix/iz.
   */
  private getTexelOffset(ix: number, iz: number): number {
    const x = this.indexPolicy.clampIndex(ix, this.resolutionX);
    const z = this.indexPolicy.clampIndex(iz, this.resolutionZ);
    return ((z * this.resolutionX) + x) * this.layerCount;
  }
}
