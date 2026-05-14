import { TerrainIndexMath, TerrainScalarMath } from "./TerrainMath";

/**
 * Сервис bilinear sampling для TerrainHeightField.
 */
class TerrainHeightFieldSampler {
  private readonly scalarMath: TerrainScalarMath;
  private readonly indexMath: TerrainIndexMath;

  public constructor(
    scalarMath = new TerrainScalarMath(),
    indexMath = new TerrainIndexMath(scalarMath)
  ) {
    this.scalarMath = scalarMath;
    this.indexMath = indexMath;
  }

  /**
   * Семплирует высоту по локальным координатам mesh через bilinear interpolation.
   */
  public sampleBilinearLocal(field: TerrainHeightField, x: number, z: number): number | null {
    if (!field.containsLocalPoint(x, z)) {
      return null;
    }

    if (field.resolutionX <= 0 || field.resolutionZ <= 0) {
      return null;
    }

    if (field.resolutionX === 1 && field.resolutionZ === 1) {
      return field.getHeight(0, 0);
    }

    const u = field.width === 0 ? 0 : (x / field.width) + 0.5;
    const v = field.depth === 0 ? 0 : 0.5 - (z / field.depth);

    const xCoord = this.scalarMath.clamp01(u) * Math.max(0, field.resolutionX - 1);
    const zCoord = this.scalarMath.clamp01(v) * Math.max(0, field.resolutionZ - 1);

    const x0 = this.indexMath.clampIndex(Math.floor(xCoord), field.resolutionX);
    const x1 = this.indexMath.clampIndex(Math.ceil(xCoord), field.resolutionX);
    const z0 = this.indexMath.clampIndex(Math.floor(zCoord), field.resolutionZ);
    const z1 = this.indexMath.clampIndex(Math.ceil(zCoord), field.resolutionZ);

    const tx = x1 === x0 ? 0 : xCoord - x0;
    const tz = z1 === z0 ? 0 : zCoord - z0;

    const h00 = field.getHeight(x0, z0);
    const h10 = field.getHeight(x1, z0);
    const h01 = field.getHeight(x0, z1);
    const h11 = field.getHeight(x1, z1);

    const top = this.scalarMath.lerp(h00, h10, tx);
    const bottom = this.scalarMath.lerp(h01, h11, tx);
    return this.scalarMath.lerp(top, bottom, tz);
  }
}

/**
 * Immutable heightfield generated или отредактированного terrain.
 *
 * Класс хранит размеры, resolution и Float32Array высот. Все операции, которые
 * меняют высоты, возвращают новый TerrainHeightField, чтобы runtime и editor
 * могли безопасно сравнивать/переиспользовать ссылки.
 */
export class TerrainHeightField {
  public readonly width: number;
  public readonly depth: number;
  public readonly resolutionX: number;
  public readonly resolutionZ: number;
  public readonly heights: Float32Array;
  public readonly minHeight: number;
  public readonly maxHeight: number;
  private readonly sampler: TerrainHeightFieldSampler;

  public constructor(
    width: number,
    depth: number,
    resolutionX: number,
    resolutionZ: number,
    heights: Float32Array,
    sampler = new TerrainHeightFieldSampler()
  ) {
    const expectedLength = resolutionX * resolutionZ;
    if (heights.length !== expectedLength) {
      throw new Error(`TerrainHeightField expected ${expectedLength} heights, received ${heights.length}.`);
    }

    this.width = width;
    this.depth = depth;
    this.resolutionX = resolutionX;
    this.resolutionZ = resolutionZ;
    this.heights = heights;
    this.sampler = sampler;

    let minHeight = Number.POSITIVE_INFINITY;
    let maxHeight = Number.NEGATIVE_INFINITY;
    for (let index = 0; index < heights.length; index += 1) {
      const value = heights[index];
      if (!Number.isFinite(value)) {
        throw new Error(`TerrainHeightField contains a non-finite height at index ${index}.`);
      }
      minHeight = Math.min(minHeight, value);
      maxHeight = Math.max(maxHeight, value);
    }

    this.minHeight = Number.isFinite(minHeight) ? minHeight : 0;
    this.maxHeight = Number.isFinite(maxHeight) ? maxHeight : 0;
  }

  /**
   * Возвращает количество вершин heightfield.
   */
  public getVertexCount(): number {
    return this.heights.length;
  }

  /**
   * Возвращает количество треугольников регулярной сетки.
   */
  public getTriangleCount(): number {
    return Math.max(0, (this.resolutionX - 1) * (this.resolutionZ - 1) * 2);
  }

  /**
   * Читает высоту вершины по grid index.
   */
  public getHeight(ix: number, iz: number): number {
    return this.heights[this.getIndex(ix, iz)] ?? 0;
  }

  /**
   * Проверяет попадание локальной XZ-точки в rectangular terrain footprint.
   */
  public containsLocalPoint(x: number, z: number): boolean {
    const halfWidth = this.width * 0.5;
    const halfDepth = this.depth * 0.5;
    return x >= -halfWidth && x <= halfWidth && z >= -halfDepth && z <= halfDepth;
  }

  /**
   * Делает bilinear sampling в локальных координатах terrain mesh.
   */
  public sampleBilinearLocal(x: number, z: number): number | null {
    return this.sampler.sampleBilinearLocal(this, x, z);
  }

  /**
   * Возвращает копию buffer'а высот.
   */
  public cloneHeights(): Float32Array {
    return this.heights.slice();
  }

  /**
   * Создает новый heightfield с теми же размерами и другим height buffer.
   */
  public withHeights(heights: Float32Array): TerrainHeightField {
    return new TerrainHeightField(this.width, this.depth, this.resolutionX, this.resolutionZ, heights);
  }

  /**
   * Фабрика плоского heightfield.
   */
  public static createFilled(
    width: number,
    depth: number,
    resolutionX: number,
    resolutionZ: number,
    value: number
  ): TerrainHeightField {
    const heights = new Float32Array(resolutionX * resolutionZ);
    heights.fill(value);
    return new TerrainHeightField(width, depth, resolutionX, resolutionZ, heights);
  }

  /**
   * Линейный индекс вершины внутри Float32Array.
   */
  private getIndex(ix: number, iz: number): number {
    return iz * this.resolutionX + ix;
  }
}
