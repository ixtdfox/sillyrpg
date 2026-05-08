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

  public containsLocalPoint(x: number, z: number): boolean {
    const halfWidth = this.width * 0.5;
    const halfDepth = this.depth * 0.5;
    return x >= -halfWidth && x <= halfWidth && z >= -halfDepth && z <= halfDepth;
  }

  public sampleBilinearLocal(x: number, z: number): number | null {
    if (!this.containsLocalPoint(x, z)) {
      return null;
    }

    if (this.resolutionX <= 0 || this.resolutionZ <= 0) {
      return null;
    }

    if (this.resolutionX === 1 && this.resolutionZ === 1) {
      return this.getHeight(0, 0);
    }

    const u = this.width === 0 ? 0 : (x / this.width) + 0.5;
    const v = this.depth === 0 ? 0 : 0.5 - (z / this.depth);

    const xCoord = clamp(u, 0, 1) * Math.max(0, this.resolutionX - 1);
    const zCoord = clamp(v, 0, 1) * Math.max(0, this.resolutionZ - 1);

    const x0 = clampIndex(Math.floor(xCoord), this.resolutionX);
    const x1 = clampIndex(Math.ceil(xCoord), this.resolutionX);
    const z0 = clampIndex(Math.floor(zCoord), this.resolutionZ);
    const z1 = clampIndex(Math.ceil(zCoord), this.resolutionZ);

    const tx = x1 === x0 ? 0 : xCoord - x0;
    const tz = z1 === z0 ? 0 : zCoord - z0;

    const h00 = this.getHeight(x0, z0);
    const h10 = this.getHeight(x1, z0);
    const h01 = this.getHeight(x0, z1);
    const h11 = this.getHeight(x1, z1);

    const top = lerp(h00, h10, tx);
    const bottom = lerp(h01, h11, tx);
    return lerp(top, bottom, tz);
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

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function clampIndex(value: number, resolution: number): number {
  return clamp(value, 0, Math.max(0, resolution - 1));
}

function lerp(a: number, b: number, t: number): number {
  return a + ((b - a) * t);
}
