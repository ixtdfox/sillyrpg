import { Mesh, VertexData, type Scene } from "@babylonjs/core";
import type { SceneGeneratedTerrainDescriptor } from "../scene/SceneDescriptor";
import type { TerrainHeightField } from "./TerrainHeightField";
import { TerrainMaterialBuilder } from "./TerrainMaterialBuilder";
import { TerrainNormalBuilder, type TerrainNormalMode } from "./TerrainNormalBuilder";

export interface TerrainVertexDataBuildResult {
  readonly positions: number[];
  readonly indices: number[];
  readonly uvs: number[];
  readonly normals: number[];
  readonly vertexHeights: number[];
}

export class TerrainMeshBuilder {
  private readonly materialBuilder: TerrainMaterialBuilder;
  private readonly normalBuilder: TerrainNormalBuilder;

  public constructor(
    materialBuilder = new TerrainMaterialBuilder(),
    normalBuilder = new TerrainNormalBuilder()
  ) {
    this.materialBuilder = materialBuilder;
    this.normalBuilder = normalBuilder;
  }

  public build(scene: Scene, descriptor: SceneGeneratedTerrainDescriptor, heightField: TerrainHeightField): Mesh {
    const mesh = new Mesh(`terrain:${descriptor.id}`, scene);
    const geometry = this.buildVertexData(heightField, descriptor.normalMode);
    const vertexData = new VertexData();
    vertexData.positions = geometry.positions;
    vertexData.indices = geometry.indices;
    vertexData.normals = geometry.normals;
    vertexData.uvs = geometry.uvs;
    vertexData.applyToMesh(mesh, true);

    mesh.metadata = {
      ...(mesh.metadata as Record<string, unknown> | undefined),
      editorTerrain: true,
      editorSelectable: false,
      terrainKind: "generated"
    };
    mesh.isPickable = true;
    mesh.receiveShadows = true;
    mesh.material = this.materialBuilder.build(scene, mesh, descriptor, heightField, geometry.vertexHeights);
    mesh.refreshBoundingInfo();
    return mesh;
  }

  public buildVertexData(
    heightField: TerrainHeightField,
    normalMode: TerrainNormalMode = "smooth"
  ): TerrainVertexDataBuildResult {
    const positions: number[] = [];
    const indices: number[] = [];
    const uvs: number[] = [];
    const vertexHeights: number[] = [];

    for (let iz = 0; iz < heightField.resolutionZ; iz += 1) {
      const v = heightField.resolutionZ <= 1 ? 0 : iz / (heightField.resolutionZ - 1);
      const z = (0.5 - v) * heightField.depth;
      for (let ix = 0; ix < heightField.resolutionX; ix += 1) {
        const u = heightField.resolutionX <= 1 ? 0 : ix / (heightField.resolutionX - 1);
        const x = (u - 0.5) * heightField.width;
        const y = heightField.getHeight(ix, iz);
        positions.push(x, y, z);
        uvs.push(u, 1 - v);
        vertexHeights.push(y);
      }
    }

    for (let iz = 0; iz < heightField.resolutionZ - 1; iz += 1) {
      for (let ix = 0; ix < heightField.resolutionX - 1; ix += 1) {
        const a = iz * heightField.resolutionX + ix;
        const b = a + 1;
        const c = a + heightField.resolutionX;
        const d = c + 1;

        // Match Babylon CreateGround convention:
        // X = left/right, Z = depth with row 0 at positive Z, Y = height.
        // These triangle indices produce upward normals and top-facing triangles
        // that remain visible from cameras above the terrain with back-face culling on.
        indices.push(d, b, a);
        indices.push(c, d, a);
      }
    }

    return this.normalBuilder.build({
      positions,
      indices,
      uvs,
      vertexHeights
    }, normalMode);
  }
}
