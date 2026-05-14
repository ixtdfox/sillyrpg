import { Matrix, Vector3, type AbstractMesh } from "@babylonjs/core";
import type { SceneGeneratedTerrainDescriptor } from "../scene/SceneDescriptor";
import type { TerrainHeightField } from "./TerrainHeightField";

export interface TerrainSurface {
  readonly mesh: AbstractMesh;
  readonly descriptor: SceneGeneratedTerrainDescriptor;
  readonly heightField: TerrainHeightField;
}

interface GeneratedTerrainMeshMetadata {
  readonly generatedTerrainDescriptor?: SceneGeneratedTerrainDescriptor;
  readonly generatedTerrainHeightField?: TerrainHeightField;
  readonly terrainSurfaceCanonical?: boolean;
  readonly terrainVisualOnly?: boolean;
}

export class TerrainSurfaceRegistry {
  private readonly surfaces: TerrainSurface[];

  public constructor() {
    this.surfaces = [];
  }

  public clear(): void {
    this.surfaces.length = 0;
  }

  public getSurfaces(): readonly TerrainSurface[] {
    return this.surfaces;
  }

  public register(surface: TerrainSurface): void {
    this.surfaces.push(surface);
  }

  public rebuildFromMeshes(meshes: readonly AbstractMesh[]): void {
    this.clear();

    for (const mesh of meshes) {
      const metadata = mesh.metadata as GeneratedTerrainMeshMetadata | null | undefined;
      if (metadata?.terrainVisualOnly === true || metadata?.terrainSurfaceCanonical === false) {
        continue;
      }

      const descriptor = metadata?.generatedTerrainDescriptor;
      const heightField = metadata?.generatedTerrainHeightField;
      if (!descriptor || !heightField) {
        continue;
      }

      this.register({
        mesh,
        descriptor,
        heightField
      });
    }
  }

  public sampleWorldHeight(x: number, z: number): number | null {
    let sampledHeight: number | null = null;

    for (const surface of this.surfaces) {
      const worldMatrix = surface.mesh.computeWorldMatrix(true);
      const inverseWorld = worldMatrix.clone().invert();
      const localPoint = Vector3.TransformCoordinates(new Vector3(x, 0, z), inverseWorld);
      const localHeight = surface.heightField.sampleBilinearLocal(localPoint.x, localPoint.z);
      if (localHeight === null) {
        continue;
      }

      const worldHeight = transformLocalHeightToWorldY(worldMatrix, localPoint.x, localHeight, localPoint.z);
      sampledHeight = sampledHeight === null ? worldHeight : Math.max(sampledHeight, worldHeight);
    }

    return sampledHeight;
  }
}

function transformLocalHeightToWorldY(worldMatrix: Matrix, x: number, y: number, z: number): number {
  return Vector3.TransformCoordinates(new Vector3(x, y, z), worldMatrix).y;
}
