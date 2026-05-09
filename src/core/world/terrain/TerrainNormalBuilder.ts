export type TerrainNormalMode = "smooth" | "flat";

export interface TerrainGeometryInput {
  readonly positions: readonly number[];
  readonly indices: readonly number[];
  readonly uvs: readonly number[];
  readonly vertexHeights: readonly number[];
}

export interface TerrainNormalBuildResult {
  readonly positions: number[];
  readonly indices: number[];
  readonly uvs: number[];
  readonly normals: number[];
  readonly vertexHeights: number[];
}

export interface TerrainNormalDiagnostics {
  readonly totalNormals: number;
  readonly invalidNormals: number;
  readonly zeroLengthNormals: number;
  readonly minY: number;
  readonly maxY: number;
  readonly averageY: number;
}

const NORMAL_EPSILON = 0.000001;

export class TerrainNormalBuilder {
  public build(input: TerrainGeometryInput, mode: TerrainNormalMode = "smooth"): TerrainNormalBuildResult {
    return mode === "flat" ? this.buildFlat(input) : this.buildSmooth(input);
  }

  public diagnose(normals: readonly number[]): TerrainNormalDiagnostics {
    let invalidNormals = 0;
    let zeroLengthNormals = 0;
    let minY = Number.POSITIVE_INFINITY;
    let maxY = Number.NEGATIVE_INFINITY;
    let ySum = 0;
    const totalNormals = Math.floor(normals.length / 3);

    for (let index = 0; index < totalNormals; index += 1) {
      const offset = index * 3;
      const x = normals[offset];
      const y = normals[offset + 1];
      const z = normals[offset + 2];
      if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) {
        invalidNormals += 1;
        continue;
      }

      const lengthSquared = x * x + y * y + z * z;
      if (lengthSquared <= NORMAL_EPSILON * NORMAL_EPSILON) {
        zeroLengthNormals += 1;
      }

      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
      ySum += y;
    }

    if (normals.length % 3 !== 0) {
      invalidNormals += 1;
    }

    return {
      totalNormals,
      invalidNormals,
      zeroLengthNormals,
      minY: Number.isFinite(minY) ? minY : 0,
      maxY: Number.isFinite(maxY) ? maxY : 0,
      averageY: totalNormals > 0 ? ySum / totalNormals : 0
    };
  }

  public logDiagnostics(normals: readonly number[], logger: (message: string) => void = console.debug): void {
    const diagnostics = this.diagnose(normals);
    logger(
      `Terrain normals: total=${diagnostics.totalNormals}, invalid=${diagnostics.invalidNormals}, zeroLength=${diagnostics.zeroLengthNormals}, y=${diagnostics.minY.toFixed(3)}..${diagnostics.maxY.toFixed(3)} avg=${diagnostics.averageY.toFixed(3)}`
    );
  }

  private buildSmooth(input: TerrainGeometryInput): TerrainNormalBuildResult {
    const positions = [...input.positions];
    const indices = [...input.indices];
    const uvs = [...input.uvs];
    const vertexHeights = [...input.vertexHeights];
    const normals = new Array<number>(positions.length).fill(0);

    for (let index = 0; index < indices.length; index += 3) {
      const i0 = indices[index] ?? 0;
      const i1 = indices[index + 1] ?? 0;
      const i2 = indices[index + 2] ?? 0;
      const faceNormal = computeFaceNormal(positions, i0, i1, i2);
      addNormal(normals, i0, faceNormal);
      addNormal(normals, i1, faceNormal);
      addNormal(normals, i2, faceNormal);
    }

    for (let index = 0; index < normals.length; index += 3) {
      normalizeNormalInPlace(normals, index);
    }

    return {
      positions,
      indices,
      uvs,
      normals,
      vertexHeights
    };
  }

  private buildFlat(input: TerrainGeometryInput): TerrainNormalBuildResult {
    const positions: number[] = [];
    const indices: number[] = [];
    const uvs: number[] = [];
    const normals: number[] = [];
    const vertexHeights: number[] = [];

    for (let index = 0; index < input.indices.length; index += 3) {
      const i0 = input.indices[index] ?? 0;
      const i1 = input.indices[index + 1] ?? 0;
      const i2 = input.indices[index + 2] ?? 0;
      const faceNormal = computeFaceNormal(input.positions, i0, i1, i2);
      const nextIndex = positions.length / 3;

      for (const sourceIndex of [i0, i1, i2]) {
        const positionOffset = sourceIndex * 3;
        const uvOffset = sourceIndex * 2;
        positions.push(
          input.positions[positionOffset] ?? 0,
          input.positions[positionOffset + 1] ?? 0,
          input.positions[positionOffset + 2] ?? 0
        );
        uvs.push(input.uvs[uvOffset] ?? 0, input.uvs[uvOffset + 1] ?? 0);
        normals.push(faceNormal.x, faceNormal.y, faceNormal.z);
        vertexHeights.push(input.vertexHeights[sourceIndex] ?? input.positions[positionOffset + 1] ?? 0);
      }

      indices.push(nextIndex, nextIndex + 1, nextIndex + 2);
    }

    return {
      positions,
      indices,
      uvs,
      normals,
      vertexHeights
    };
  }
}

function addNormal(normals: number[], vertexIndex: number, normal: VectorTuple): void {
  const offset = vertexIndex * 3;
  normals[offset] = (normals[offset] ?? 0) + normal.x;
  normals[offset + 1] = (normals[offset + 1] ?? 0) + normal.y;
  normals[offset + 2] = (normals[offset + 2] ?? 0) + normal.z;
}

function computeFaceNormal(positions: readonly number[], i0: number, i1: number, i2: number): VectorTuple {
  const p0 = readPosition(positions, i0);
  const p1 = readPosition(positions, i1);
  const p2 = readPosition(positions, i2);
  const a = subtract(p2, p0);
  const b = subtract(p1, p0);
  return normalize(cross(a, b));
}

function normalizeNormalInPlace(normals: number[], offset: number): void {
  const normalized = normalize({
    x: normals[offset] ?? 0,
    y: normals[offset + 1] ?? 0,
    z: normals[offset + 2] ?? 0
  });
  normals[offset] = normalized.x;
  normals[offset + 1] = normalized.y;
  normals[offset + 2] = normalized.z;
}

interface VectorTuple {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

function readPosition(positions: readonly number[], vertexIndex: number): VectorTuple {
  const offset = vertexIndex * 3;
  return {
    x: positions[offset] ?? 0,
    y: positions[offset + 1] ?? 0,
    z: positions[offset + 2] ?? 0
  };
}

function subtract(a: VectorTuple, b: VectorTuple): VectorTuple {
  return {
    x: a.x - b.x,
    y: a.y - b.y,
    z: a.z - b.z
  };
}

function cross(a: VectorTuple, b: VectorTuple): VectorTuple {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x
  };
}

function normalize(vector: VectorTuple): VectorTuple {
  const lengthSquared = vector.x * vector.x + vector.y * vector.y + vector.z * vector.z;
  if (!Number.isFinite(lengthSquared) || lengthSquared <= NORMAL_EPSILON * NORMAL_EPSILON) {
    return { x: 0, y: 1, z: 0 };
  }

  const scale = 1 / Math.sqrt(lengthSquared);
  return {
    x: vector.x * scale,
    y: vector.y * scale,
    z: vector.z * scale
  };
}
