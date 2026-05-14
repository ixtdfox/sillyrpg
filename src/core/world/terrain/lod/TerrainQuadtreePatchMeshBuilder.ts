import {
  Color3,
  Color4,
  Mesh,
  MeshBuilder,
  VertexBuffer,
  VertexData,
  Vector3,
  type LinesMesh,
  type Material,
  type Scene
} from "@babylonjs/core";
import type { SceneGeneratedTerrainDescriptor, SceneTerrainMaterialBandDescriptor } from "../../scene/SceneDescriptor";
import type { TerrainHeightField } from "../TerrainHeightField";
import { TerrainHeightFieldNormalSampler } from "../TerrainHeightFieldNormalSampler";
import type { TerrainQuadtreeNode } from "./TerrainQuadtreeLodTypes";

export interface TerrainQuadtreePatchVertexData {
  readonly positions: number[];
  readonly indices: number[];
  readonly uvs: number[];
  readonly normals: number[];
  readonly vertexHeights: number[];
}

export interface TerrainQuadtreePatchBuildOptions {
  readonly node: TerrainQuadtreeNode;
  readonly heightField: TerrainHeightField;
  readonly descriptor: SceneGeneratedTerrainDescriptor;
  readonly sampleStep: number;
  readonly skirtDepth: number;
  readonly material: Material | null;
  readonly name: string;
}

export interface TerrainQuadtreePatchDebugLineOptions {
  readonly node: TerrainQuadtreeNode;
  readonly heightField: TerrainHeightField;
  readonly sampleStep: number;
  readonly name: string;
  readonly verticalOffset?: number;
}

interface SkirtAppendInput {
  readonly positions: number[];
  readonly indices: number[];
  readonly uvs: number[];
  readonly normals: number[];
  readonly vertexHeights: number[];
  readonly heightField: TerrainHeightField;
  readonly normalSampler: TerrainHeightFieldNormalSampler;
  readonly xIndices: readonly number[];
  readonly zIndices: readonly number[];
  readonly skirtDepth: number;
}

export class TerrainQuadtreePatchMeshBuilder {
  public buildPatchMesh(scene: Scene, options: TerrainQuadtreePatchBuildOptions): Mesh {
    const mesh = new Mesh(options.name, scene);
    const geometry = this.buildVertexData(
      options.heightField,
      options.node,
      options.descriptor,
      options.sampleStep,
      options.skirtDepth
    );
    const vertexData = new VertexData();
    vertexData.positions = geometry.positions;
    vertexData.indices = geometry.indices;
    vertexData.normals = geometry.normals;
    vertexData.uvs = geometry.uvs;
    vertexData.applyToMesh(mesh, true);

    mesh.material = options.material;
    mesh.receiveShadows = true;
    mesh.isPickable = false;
    mesh.checkCollisions = false;
    mesh.metadata = {
      ...(mesh.metadata as Record<string, unknown> | undefined),
      terrainVisualOnly: true,
      terrainSurfaceCanonical: false,
      terrainKind: "generated-lod-visual",
      terrainQuadtreeNodeId: options.node.id,
      terrainQuadtreeDepth: options.node.depth,
      terrainQuadtreeSampleStep: options.sampleStep
    };
    applyHeightBandVertexColors(mesh, options.descriptor, geometry.vertexHeights);
    mesh.refreshBoundingInfo();
    return mesh;
  }

  public buildVertexData(
    heightField: TerrainHeightField,
    node: TerrainQuadtreeNode,
    descriptor: SceneGeneratedTerrainDescriptor,
    sampleStep: number,
    skirtDepth: number
  ): TerrainQuadtreePatchVertexData {
    const positions: number[] = [];
    const indices: number[] = [];
    const uvs: number[] = [];
    const normals: number[] = [];
    const vertexHeights: number[] = [];
    const resolvedSampleStep = Math.max(1, Math.round(sampleStep));
    const normalSampler = new TerrainHeightFieldNormalSampler(heightField);
    const xIndices = buildAxisIndices(node.ix0, node.ix1, resolvedSampleStep);
    const zIndices = buildAxisIndices(node.iz0, node.iz1, resolvedSampleStep);
    const topVertexIndexByGrid: number[][] = [];

    for (let zGridIndex = 0; zGridIndex < zIndices.length; zGridIndex += 1) {
      const row: number[] = [];
      const iz = zIndices[zGridIndex] ?? node.iz0;
      for (let xGridIndex = 0; xGridIndex < xIndices.length; xGridIndex += 1) {
        const ix = xIndices[xGridIndex] ?? node.ix0;
        row.push(pushTerrainVertex(
          positions,
          uvs,
          normals,
          vertexHeights,
          heightField,
          ix,
          iz,
          heightField.getHeight(ix, iz),
          normalSampler.sampleNormal(ix, iz)
        ));
      }
      topVertexIndexByGrid.push(row);
    }

    for (let zGridIndex = 0; zGridIndex < zIndices.length - 1; zGridIndex += 1) {
      for (let xGridIndex = 0; xGridIndex < xIndices.length - 1; xGridIndex += 1) {
        const a = topVertexIndexByGrid[zGridIndex]?.[xGridIndex] ?? 0;
        const b = topVertexIndexByGrid[zGridIndex]?.[xGridIndex + 1] ?? 0;
        const c = topVertexIndexByGrid[zGridIndex + 1]?.[xGridIndex] ?? 0;
        const d = topVertexIndexByGrid[zGridIndex + 1]?.[xGridIndex + 1] ?? 0;
        indices.push(d, b, a);
        indices.push(c, d, a);
      }
    }

    if (skirtDepth > 0) {
      appendSkirts({
        positions,
        indices,
        uvs,
        normals,
        vertexHeights,
        heightField,
        normalSampler,
        xIndices,
        zIndices,
        skirtDepth
      });
    }

    return {
      positions,
      indices,
      uvs,
      normals,
      vertexHeights
    };
  }

  public buildDebugLineMesh(scene: Scene, options: TerrainQuadtreePatchDebugLineOptions): LinesMesh {
    const lines: Vector3[][] = [];
    const step = Math.max(1, Math.round(options.sampleStep));
    const xIndices = buildAxisIndices(options.node.ix0, options.node.ix1, step);
    const zIndices = buildAxisIndices(options.node.iz0, options.node.iz1, step);
    const yOffset = options.verticalOffset ?? 0.08;

    for (const iz of zIndices) {
      lines.push(xIndices.map((ix) => createDebugPoint(options.heightField, ix, iz, yOffset)));
    }
    for (const ix of xIndices) {
      lines.push(zIndices.map((iz) => createDebugPoint(options.heightField, ix, iz, yOffset)));
    }

    const mesh = MeshBuilder.CreateLineSystem(options.name, { lines }, scene);
    mesh.isPickable = false;
    mesh.checkCollisions = false;
    mesh.metadata = {
      ...(mesh.metadata as Record<string, unknown> | undefined),
      terrainVisualOnly: true,
      terrainDebugOnly: true,
      terrainSurfaceCanonical: false,
      terrainKind: "generated-lod-debug",
      terrainQuadtreeNodeId: options.node.id,
      terrainQuadtreeDepth: options.node.depth,
      terrainQuadtreeSampleStep: options.sampleStep
    };
    return mesh;
  }
}

function buildAxisIndices(start: number, end: number, step: number): number[] {
  const indices: number[] = [];
  for (let index = start; index < end; index += step) {
    indices.push(index);
  }
  if (indices[indices.length - 1] !== end) {
    indices.push(end);
  }
  return indices;
}

function pushTerrainVertex(
  positions: number[],
  uvs: number[],
  normals: number[],
  vertexHeights: number[],
  heightField: TerrainHeightField,
  ix: number,
  iz: number,
  y: number,
  normal: Vector3,
  colorHeight = y
): number {
  const u = heightField.resolutionX <= 1 ? 0 : ix / (heightField.resolutionX - 1);
  const v = heightField.resolutionZ <= 1 ? 0 : iz / (heightField.resolutionZ - 1);
  const x = (u - 0.5) * heightField.width;
  const z = (0.5 - v) * heightField.depth;
  const vertexIndex = positions.length / 3;
  positions.push(x, y, z);
  uvs.push(u, 1 - v);
  normals.push(normal.x, normal.y, normal.z);
  vertexHeights.push(colorHeight);
  return vertexIndex;
}

function appendSkirts(input: SkirtAppendInput): void {
  appendNorthSkirt(input);
  appendSouthSkirt(input);
  appendWestSkirt(input);
  appendEastSkirt(input);
}

function appendNorthSkirt(input: SkirtAppendInput): void {
  const iz = input.zIndices[0] ?? 0;
  for (let xGridIndex = 0; xGridIndex < input.xIndices.length - 1; xGridIndex += 1) {
    const ix0 = input.xIndices[xGridIndex] ?? 0;
    const ix1 = input.xIndices[xGridIndex + 1] ?? ix0;
    const top0 = appendSkirtVertex(input, ix0, iz, 0);
    const top1 = appendSkirtVertex(input, ix1, iz, 0);
    const bottom0 = appendSkirtVertex(input, ix0, iz, -input.skirtDepth);
    const bottom1 = appendSkirtVertex(input, ix1, iz, -input.skirtDepth);
    input.indices.push(top1, bottom1, top0);
    input.indices.push(bottom0, top0, bottom1);
  }
}

function appendSouthSkirt(input: SkirtAppendInput): void {
  const iz = input.zIndices[input.zIndices.length - 1] ?? 0;
  for (let xGridIndex = 0; xGridIndex < input.xIndices.length - 1; xGridIndex += 1) {
    const ix0 = input.xIndices[xGridIndex] ?? 0;
    const ix1 = input.xIndices[xGridIndex + 1] ?? ix0;
    const top0 = appendSkirtVertex(input, ix0, iz, 0);
    const top1 = appendSkirtVertex(input, ix1, iz, 0);
    const bottom0 = appendSkirtVertex(input, ix0, iz, -input.skirtDepth);
    const bottom1 = appendSkirtVertex(input, ix1, iz, -input.skirtDepth);
    input.indices.push(top0, bottom1, top1);
    input.indices.push(bottom0, bottom1, top0);
  }
}

function appendWestSkirt(input: SkirtAppendInput): void {
  const ix = input.xIndices[0] ?? 0;
  for (let zGridIndex = 0; zGridIndex < input.zIndices.length - 1; zGridIndex += 1) {
    const iz0 = input.zIndices[zGridIndex] ?? 0;
    const iz1 = input.zIndices[zGridIndex + 1] ?? iz0;
    const top0 = appendSkirtVertex(input, ix, iz0, 0);
    const top1 = appendSkirtVertex(input, ix, iz1, 0);
    const bottom0 = appendSkirtVertex(input, ix, iz0, -input.skirtDepth);
    const bottom1 = appendSkirtVertex(input, ix, iz1, -input.skirtDepth);
    input.indices.push(top0, bottom1, top1);
    input.indices.push(bottom0, bottom1, top0);
  }
}

function appendEastSkirt(input: SkirtAppendInput): void {
  const ix = input.xIndices[input.xIndices.length - 1] ?? 0;
  for (let zGridIndex = 0; zGridIndex < input.zIndices.length - 1; zGridIndex += 1) {
    const iz0 = input.zIndices[zGridIndex] ?? 0;
    const iz1 = input.zIndices[zGridIndex + 1] ?? iz0;
    const top0 = appendSkirtVertex(input, ix, iz0, 0);
    const top1 = appendSkirtVertex(input, ix, iz1, 0);
    const bottom0 = appendSkirtVertex(input, ix, iz0, -input.skirtDepth);
    const bottom1 = appendSkirtVertex(input, ix, iz1, -input.skirtDepth);
    input.indices.push(top1, bottom1, top0);
    input.indices.push(bottom0, top0, bottom1);
  }
}

function appendSkirtVertex(input: {
  readonly positions: number[];
  readonly uvs: number[];
  readonly normals: number[];
  readonly vertexHeights: number[];
  readonly heightField: TerrainHeightField;
  readonly normalSampler: TerrainHeightFieldNormalSampler;
}, ix: number, iz: number, yOffset: number): number {
  const edgeHeight = input.heightField.getHeight(ix, iz);
  return pushTerrainVertex(
    input.positions,
    input.uvs,
    input.normals,
    input.vertexHeights,
    input.heightField,
    ix,
    iz,
    edgeHeight + yOffset,
    input.normalSampler.sampleNormal(ix, iz),
    edgeHeight
  );
}

function applyHeightBandVertexColors(
  mesh: Mesh,
  descriptor: SceneGeneratedTerrainDescriptor,
  vertexHeights: readonly number[]
): void {
  if (descriptor.material?.kind !== "heightBands" || descriptor.material.bands.length === 0) {
    mesh.useVertexColors = false;
    return;
  }

  mesh.setVerticesData(VertexBuffer.ColorKind, buildBandColors(vertexHeights, descriptor.material.bands), true);
  mesh.useVertexColors = true;
}

function buildBandColors(vertexHeights: readonly number[], bands: readonly SceneTerrainMaterialBandDescriptor[]): number[] {
  const colors: number[] = [];
  for (const height of vertexHeights) {
    const band =
      bands.find((candidate) => height >= candidate.minHeight && height <= candidate.maxHeight) ??
      (height < bands[0]!.minHeight ? bands[0]! : bands[bands.length - 1]!);
    const color = Color4.FromColor3(resolveColor3(band?.color ?? "#8D9298"), 1);
    colors.push(color.r, color.g, color.b, color.a);
  }
  return colors;
}

function resolveColor3(hexColor: string): Color3 {
  try {
    return Color3.FromHexString(hexColor);
  } catch {
    return Color3.FromHexString("#8D9298");
  }
}

function createDebugPoint(heightField: TerrainHeightField, ix: number, iz: number, yOffset: number): Vector3 {
  const u = heightField.resolutionX <= 1 ? 0 : ix / (heightField.resolutionX - 1);
  const v = heightField.resolutionZ <= 1 ? 0 : iz / (heightField.resolutionZ - 1);
  return new Vector3(
    (u - 0.5) * heightField.width,
    heightField.getHeight(ix, iz) + yOffset,
    (0.5 - v) * heightField.depth
  );
}
