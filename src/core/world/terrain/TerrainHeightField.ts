export class TerrainHeightField {
  public readonly width: number;
  public readonly depth: number;
  public readonly resolutionX: number;
  public readonly resolutionZ: number;
  public readonly heights: Float32Array;
  public readonly minHeight: number;
  public readonly maxHeight: number;

  public constructor(
    width: number,
    depth: number,
    resolutionX: number,
    resolutionZ: number,
    heights: Float32Array
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

  public getVertexCount(): number {
    return this.heights.length;
  }

  public getTriangleCount(): number {
    return Math.max(0, (this.resolutionX - 1) * (this.resolutionZ - 1) * 2);
  }

  public getHeight(ix: number, iz: number): number {
    return this.heights[this.getIndex(ix, iz)] ?? 0;
  }

  public cloneHeights(): Float32Array {
    return this.heights.slice();
  }

  public withHeights(heights: Float32Array): TerrainHeightField {
    return new TerrainHeightField(this.width, this.depth, this.resolutionX, this.resolutionZ, heights);
  }

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

  private getIndex(ix: number, iz: number): number {
    return iz * this.resolutionX + ix;
  }
}
