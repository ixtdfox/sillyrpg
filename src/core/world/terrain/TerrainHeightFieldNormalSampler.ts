import { Vector3 } from "@babylonjs/core";
import type { TerrainHeightField } from "./TerrainHeightField";

const NORMAL_EPSILON = 0.000001;

export class TerrainHeightFieldNormalSampler {
  public constructor(private readonly heightField: TerrainHeightField) {}

  public sampleNormal(ix: number, iz: number): Vector3 {
    const resolutionX = this.heightField.resolutionX;
    const resolutionZ = this.heightField.resolutionZ;
    if (resolutionX <= 0 || resolutionZ <= 0) {
      return Vector3.Up();
    }

    const centerX = clampIndex(Math.round(ix), resolutionX);
    const centerZ = clampIndex(Math.round(iz), resolutionZ);
    const ix0 = clampIndex(centerX - 1, resolutionX);
    const ix1 = clampIndex(centerX + 1, resolutionX);
    const iz0 = clampIndex(centerZ - 1, resolutionZ);
    const iz1 = clampIndex(centerZ + 1, resolutionZ);

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

    return normalizeUpward(new Vector3(-dHdx, 1, -dHdz));
  }
}

function clampIndex(value: number, resolution: number): number {
  return Math.min(Math.max(0, resolution - 1), Math.max(0, value));
}

function normalizeUpward(normal: Vector3): Vector3 {
  if (!isFiniteVector(normal) || normal.lengthSquared() <= NORMAL_EPSILON * NORMAL_EPSILON) {
    return Vector3.Up();
  }

  normal.normalize();
  if (!isFiniteVector(normal)) {
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

function isFiniteVector(vector: Vector3): boolean {
  return Number.isFinite(vector.x) && Number.isFinite(vector.y) && Number.isFinite(vector.z);
}
