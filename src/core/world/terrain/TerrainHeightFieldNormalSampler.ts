import { Vector3 } from "@babylonjs/core";
import type { TerrainHeightField } from "./TerrainHeightField";
import { TerrainIndexMath } from "./TerrainMath";

const NORMAL_EPSILON = 0.000001;

/**
 * Нормализатор normal-векторов terrain heightfield.
 */
class TerrainNormalVectorPolicy {
  /**
   * Делает нормаль конечной, ненулевой и направленной вверх.
   */
  public normalizeUpward(normal: Vector3): Vector3 {
    if (!this.isFiniteVector(normal) || normal.lengthSquared() <= NORMAL_EPSILON * NORMAL_EPSILON) {
      return Vector3.Up();
    }

    normal.normalize();
    if (!this.isFiniteVector(normal)) {
      return Vector3.Up();
    }

    if (normal.y < 0) {
      normal.scaleInPlace(-1);
    }

    if (normal.y <= NORMAL_EPSILON) {
      return Vector3.Up();
    }

    return normal;
  }

  private isFiniteVector(vector: Vector3): boolean {
    return Number.isFinite(vector.x) && Number.isFinite(vector.y) && Number.isFinite(vector.z);
  }
}

/**
 * Sampler нормалей по высотам соседних вершин.
 */
export class TerrainHeightFieldNormalSampler {
  private readonly indexMath: TerrainIndexMath;
  private readonly normalPolicy: TerrainNormalVectorPolicy;

  public constructor(
    private readonly heightField: TerrainHeightField,
    indexMath = new TerrainIndexMath(),
    normalPolicy = new TerrainNormalVectorPolicy()
  ) {
    this.indexMath = indexMath;
    this.normalPolicy = normalPolicy;
  }

  /**
   * Возвращает нормаль в world-scale slope coordinates для вершины ix/iz.
   */
  public sampleNormal(ix: number, iz: number): Vector3 {
    const resolutionX = this.heightField.resolutionX;
    const resolutionZ = this.heightField.resolutionZ;
    if (resolutionX <= 0 || resolutionZ <= 0) {
      return Vector3.Up();
    }

    const centerX = this.indexMath.clampIndex(Math.round(ix), resolutionX);
    const centerZ = this.indexMath.clampIndex(Math.round(iz), resolutionZ);
    const ix0 = this.indexMath.clampIndex(centerX - 1, resolutionX);
    const ix1 = this.indexMath.clampIndex(centerX + 1, resolutionX);
    const iz0 = this.indexMath.clampIndex(centerZ - 1, resolutionZ);
    const iz1 = this.indexMath.clampIndex(centerZ + 1, resolutionZ);

    const hL = this.heightField.getHeight(ix0, centerZ);
    const hR = this.heightField.getHeight(ix1, centerZ);
    const hNorth = this.heightField.getHeight(centerX, iz0);
    const hSouth = this.heightField.getHeight(centerX, iz1);
    const quadSizeX = this.heightField.width / Math.max(1, resolutionX - 1);
    const quadSizeZ = this.heightField.depth / Math.max(1, resolutionZ - 1);
    const dxWorld = Math.abs(ix1 - ix0) * Math.abs(quadSizeX);
    const dzWorld = Math.abs(iz1 - iz0) * Math.abs(quadSizeZ);
    const dHdx = dxWorld <= NORMAL_EPSILON ? 0 : (hR - hL) / dxWorld;
    const dHdz = dzWorld <= NORMAL_EPSILON ? 0 : (hNorth - hSouth) / dzWorld;

    return this.normalPolicy.normalizeUpward(new Vector3(-dHdx, 1, -dHdz));
  }
}
