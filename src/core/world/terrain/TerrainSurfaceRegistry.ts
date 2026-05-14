import { Matrix, Vector3, type AbstractMesh } from "@babylonjs/core";
import type { SceneGeneratedTerrainDescriptor } from "../scene/SceneDescriptor";
import type { TerrainHeightField } from "./TerrainHeightField";

/**
 * Каноническая terrain surface, доступная runtime systems для height sampling.
 */
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

/**
 * Mapper локальной высоты terrain в world Y.
 */
class TerrainSurfaceWorldHeightMapper {
  /**
   * Преобразует локальную terrain-точку в world coordinates и возвращает Y.
   */
  public transformLocalHeightToWorldY(worldMatrix: Matrix, x: number, y: number, z: number): number {
    return Vector3.TransformCoordinates(new Vector3(x, y, z), worldMatrix).y;
  }
}

/**
 * Registry канонических terrain surfaces, доступных runtime-системам.
 */
export class TerrainSurfaceRegistry {
  private readonly surfaces: TerrainSurface[];
  private readonly worldHeightMapper: TerrainSurfaceWorldHeightMapper;

  public constructor(worldHeightMapper = new TerrainSurfaceWorldHeightMapper()) {
    this.surfaces = [];
    this.worldHeightMapper = worldHeightMapper;
  }

  /**
   * Очищает registry перед rebuild.
   */
  public clear(): void {
    this.surfaces.length = 0;
  }

  /**
   * Возвращает зарегистрированные terrain surfaces.
   */
  public getSurfaces(): readonly TerrainSurface[] {
    return this.surfaces;
  }

  /**
   * Регистрирует одну surface вручную.
   */
  public register(surface: TerrainSurface): void {
    this.surfaces.push(surface);
  }

  /**
   * Пересобирает registry из meshes по generated terrain metadata.
   */
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

  /**
   * Семплирует максимальную world Y высоту terrain под X/Z точкой.
   */
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

      const worldHeight = this.worldHeightMapper.transformLocalHeightToWorldY(worldMatrix, localPoint.x, localHeight, localPoint.z);
      sampledHeight = sampledHeight === null ? worldHeight : Math.max(sampledHeight, worldHeight);
    }

    return sampledHeight;
  }
}
