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
import { TerrainColorResolver } from "../TerrainColorResolver";
import type { TerrainHeightField } from "../TerrainHeightField";
import { TerrainHeightFieldNormalSampler } from "../TerrainHeightFieldNormalSampler";
import type { TerrainPatchEdge, TerrainPatchSeamInfo, TerrainQuadtreeNode } from "./TerrainQuadtreeLodTypes";

export type TerrainQuadtreePatchDebugLineMode = "patchBorders" | "fullPatchGrid";

/**
 * CPU vertex data одного quadtree patch до применения к Babylon mesh.
 */
export interface TerrainQuadtreePatchVertexData {
  readonly positions: number[];
  readonly indices: number[];
  readonly uvs: number[];
  readonly normals: number[];
  readonly vertexHeights: number[];
}

/**
 * Command object для сборки одного LOD patch mesh.
 */
export interface TerrainQuadtreePatchBuildOptions {
  readonly node: TerrainQuadtreeNode;
  readonly heightField: TerrainHeightField;
  readonly descriptor: SceneGeneratedTerrainDescriptor;
  readonly sampleStep: number;
  readonly logicalSampleStep?: number;
  readonly buildSampleStep?: number;
  readonly seamInfo?: TerrainPatchSeamInfo;
  readonly material: Material | null;
  readonly name: string;
}

/**
 * Command object для debug-линий, показывающих границы LOD patch.
 */
export interface TerrainQuadtreePatchDebugLineOptions {
  readonly node: TerrainQuadtreeNode;
  readonly heightField: TerrainHeightField;
  readonly sampleStep: number;
  readonly name: string;
  readonly mode?: TerrainQuadtreePatchDebugLineMode;
  readonly verticalOffset?: number;
}

interface TerrainGridPoint {
  readonly ix: number;
  readonly iz: number;
}

/**
 * Builder индексов одной оси patch с гарантированным включением end index.
 */
class TerrainQuadtreeAxisIndexBuilder {
  /**
   * Создает последовательность индексов от start до end с обязательным end.
   */
  public build(start: number, end: number, step: number): number[] {
    const indices: number[] = [];
    for (let index = start; index < end; index += step) {
      indices.push(index);
    }
    if (indices[indices.length - 1] !== end) {
      indices.push(end);
    }
    return indices;
  }
}

/**
 * Writer вершин terrain patch.
 */
class TerrainQuadtreePatchVertexWriter {
  public pushTerrainVertex(
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
}

/**
 * Применяет height-band vertex colors к patch mesh.
 */
class TerrainPatchHeightBandColorApplicator {
  private readonly colorResolver: TerrainColorResolver;

  public constructor(colorResolver = new TerrainColorResolver()) {
    this.colorResolver = colorResolver;
  }

  public apply(
    mesh: Mesh,
    descriptor: SceneGeneratedTerrainDescriptor,
    vertexHeights: readonly number[]
  ): void {
    if (descriptor.material?.kind !== "heightBands" || descriptor.material.bands.length === 0) {
      mesh.useVertexColors = false;
      return;
    }

    mesh.setVerticesData(VertexBuffer.ColorKind, this.colorResolver.buildHeightBandColors(vertexHeights, descriptor.material.bands), true);
    mesh.useVertexColors = true;
  }
}

/**
 * Factory debug points для line mesh LOD patch.
 */
class TerrainPatchDebugPointFactory {
  /**
   * Создает world-space точку границы patch с вертикальным offset.
   */
  public create(heightField: TerrainHeightField, ix: number, iz: number, yOffset: number): Vector3 {
    const u = heightField.resolutionX <= 1 ? 0 : ix / (heightField.resolutionX - 1);
    const v = heightField.resolutionZ <= 1 ? 0 : iz / (heightField.resolutionZ - 1);
    return new Vector3(
      (u - 0.5) * heightField.width,
      heightField.getHeight(ix, iz) + yOffset,
      (0.5 - v) * heightField.depth
    );
  }
}

/**
 * Builder Babylon meshes для quadtree LOD patches.
 */
export class TerrainQuadtreePatchMeshBuilder {
  private readonly axisIndexBuilder: TerrainQuadtreeAxisIndexBuilder;
  private readonly vertexWriter: TerrainQuadtreePatchVertexWriter;
  private readonly heightBandColorApplicator: TerrainPatchHeightBandColorApplicator;
  private readonly debugPointFactory: TerrainPatchDebugPointFactory;

  public constructor(
    axisIndexBuilder = new TerrainQuadtreeAxisIndexBuilder(),
    vertexWriter = new TerrainQuadtreePatchVertexWriter(),
    heightBandColorApplicator = new TerrainPatchHeightBandColorApplicator(),
    debugPointFactory = new TerrainPatchDebugPointFactory()
  ) {
    this.axisIndexBuilder = axisIndexBuilder;
    this.vertexWriter = vertexWriter;
    this.heightBandColorApplicator = heightBandColorApplicator;
    this.debugPointFactory = debugPointFactory;
  }

  /**
   * Создает visual-only LOD patch mesh.
   */
  public buildPatchMesh(scene: Scene, options: TerrainQuadtreePatchBuildOptions): Mesh {
    const mesh = new Mesh(options.name, scene);
    const logicalSampleStep = Math.max(1, Math.round(options.logicalSampleStep ?? options.sampleStep));
    const buildSampleStep = Math.max(1, Math.round(options.buildSampleStep ?? options.sampleStep));
    const geometry = this.buildVertexData(
      options.heightField,
      options.node,
      options.descriptor,
      logicalSampleStep,
      options.seamInfo
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
      terrainQuadtreeSampleStep: logicalSampleStep,
      terrainQuadtreeLogicalSampleStep: logicalSampleStep,
      terrainQuadtreeBuildSampleStep: buildSampleStep,
      terrainQuadtreeSeamStrategy: "edge-fans"
    };
    this.heightBandColorApplicator.apply(mesh, options.descriptor, geometry.vertexHeights);
    mesh.refreshBoundingInfo();
    return mesh;
  }

  /**
   * Строит vertex data одного patch.
   */
  public buildVertexData(
    heightField: TerrainHeightField,
    node: TerrainQuadtreeNode,
    descriptor: SceneGeneratedTerrainDescriptor,
    sampleStep: number,
    seamInfo?: TerrainPatchSeamInfo
  ): TerrainQuadtreePatchVertexData {
    const positions: number[] = [];
    const indices: number[] = [];
    const uvs: number[] = [];
    const normals: number[] = [];
    const vertexHeights: number[] = [];
    const resolvedSampleStep = Math.max(1, Math.round(sampleStep));
    const normalSampler = new TerrainHeightFieldNormalSampler(heightField);
    const xIndices = this.axisIndexBuilder.build(node.ix0, node.ix1, resolvedSampleStep);
    const zIndices = this.axisIndexBuilder.build(node.iz0, node.iz1, resolvedSampleStep);
    const northXIndices = this.buildStitchedEdgeIndices(node.ix0, node.ix1, resolvedSampleStep, seamInfo, "north");
    const southXIndices = this.buildStitchedEdgeIndices(node.ix0, node.ix1, resolvedSampleStep, seamInfo, "south");
    const westZIndices = this.buildStitchedEdgeIndices(node.iz0, node.iz1, resolvedSampleStep, seamInfo, "west");
    const eastZIndices = this.buildStitchedEdgeIndices(node.iz0, node.iz1, resolvedSampleStep, seamInfo, "east");
    const topVertexIndexByKey = new Map<string, number>();
    const getOrCreateTopVertex = (ix: number, iz: number): number => {
      const key = this.createGridPointKey(ix, iz);
      const existing = topVertexIndexByKey.get(key);
      if (existing !== undefined) {
        return existing;
      }

      const vertexIndex = this.vertexWriter.pushTerrainVertex(
        positions,
        uvs,
        normals,
        vertexHeights,
        heightField,
        ix,
        iz,
        heightField.getHeight(ix, iz),
        normalSampler.sampleNormal(ix, iz)
      );
      topVertexIndexByKey.set(key, vertexIndex);
      return vertexIndex;
    };

    for (let zGridIndex = 0; zGridIndex < zIndices.length; zGridIndex += 1) {
      const iz = zIndices[zGridIndex] ?? node.iz0;
      for (let xGridIndex = 0; xGridIndex < xIndices.length; xGridIndex += 1) {
        const ix = xIndices[xGridIndex] ?? node.ix0;
        getOrCreateTopVertex(ix, iz);
      }
    }

    for (let zGridIndex = 0; zGridIndex < zIndices.length - 1; zGridIndex += 1) {
      for (let xGridIndex = 0; xGridIndex < xIndices.length - 1; xGridIndex += 1) {
        const x0 = xIndices[xGridIndex] ?? node.ix0;
        const x1 = xIndices[xGridIndex + 1] ?? x0;
        const z0 = zIndices[zGridIndex] ?? node.iz0;
        const z1 = zIndices[zGridIndex + 1] ?? z0;
        const polygon = this.buildCellPolygon({
          x0,
          x1,
          z0,
          z1,
          northXIndices: zGridIndex === 0
            ? this.selectAxisIndices(northXIndices, x0, x1)
            : this.axisIndexBuilder.build(x0, x1, resolvedSampleStep),
          southXIndices: zGridIndex === zIndices.length - 2
            ? this.selectAxisIndices(southXIndices, x0, x1)
            : this.axisIndexBuilder.build(x0, x1, resolvedSampleStep),
          westZIndices: xGridIndex === 0
            ? this.selectAxisIndices(westZIndices, z0, z1)
            : this.axisIndexBuilder.build(z0, z1, resolvedSampleStep),
          eastZIndices: xGridIndex === xIndices.length - 2
            ? this.selectAxisIndices(eastZIndices, z0, z1)
            : this.axisIndexBuilder.build(z0, z1, resolvedSampleStep)
        });
        this.appendPolygonTriangles(indices, polygon, getOrCreateTopVertex);
      }
    }

    return {
      positions,
      indices,
      uvs,
      normals,
      vertexHeights
    };
  }

  private buildStitchedEdgeIndices(
    start: number,
    end: number,
    sampleStep: number,
    seamInfo: TerrainPatchSeamInfo | undefined,
    edge: TerrainPatchEdge
  ): number[] {
    const resolvedSampleStep = Math.max(1, Math.round(sampleStep));
    const edgeInfo = seamInfo?.[edge];
    const seamSegments = edgeInfo?.segments ?? [];
    const indices = new Set<number>();
    for (const index of this.axisIndexBuilder.build(start, end, resolvedSampleStep)) {
      indices.add(index);
    }

    if (edgeInfo?.mode === "stitch-to-finer" && seamSegments.length === 0) {
      for (const index of this.axisIndexBuilder.build(start, end, Math.max(1, Math.round(edgeInfo.neighborSampleStep)))) {
        indices.add(index);
      }
    }

    for (const segment of seamSegments) {
      const segmentStart = Math.max(start, segment.startIndex);
      const segmentEnd = Math.min(end, segment.endIndex);
      if (segmentEnd <= segmentStart) {
        continue;
      }
      const stitchIndices = segment.stitchIndices ?? this.axisIndexBuilder.build(
        segmentStart,
        segmentEnd,
        Math.max(1, Math.round(segment.neighborSampleStep))
      );
      for (const index of stitchIndices) {
        if (index < segmentStart || index > segmentEnd) {
          continue;
        }
        indices.add(index);
      }
    }

    indices.add(start);
    indices.add(end);
    return [...indices].sort((left, right) => left - right);
  }

  private selectAxisIndices(axisIndices: readonly number[], start: number, end: number): number[] {
    const selected = new Set<number>([start, end]);
    for (const index of axisIndices) {
      if (index >= start && index <= end) {
        selected.add(index);
      }
    }
    return [...selected].sort((left, right) => left - right);
  }

  private buildCellPolygon(input: {
    readonly x0: number;
    readonly x1: number;
    readonly z0: number;
    readonly z1: number;
    readonly northXIndices: readonly number[];
    readonly southXIndices: readonly number[];
    readonly westZIndices: readonly number[];
    readonly eastZIndices: readonly number[];
  }): TerrainGridPoint[] {
    const polygon: TerrainGridPoint[] = [];
    // Edge-fan seam stitching: cells touching a mixed-LOD edge use the union
    // of their own and neighbor edge samples, then triangulate as a fan.
    this.appendPolygonPoints(
      polygon,
      this.buildHorizontalEdgePoints(input.northXIndices, input.z0, false)
    );
    this.appendPolygonPoints(
      polygon,
      this.buildVerticalEdgePoints(input.eastZIndices, input.x1, false).slice(1)
    );
    this.appendPolygonPoints(
      polygon,
      this.buildHorizontalEdgePoints(input.southXIndices, input.z1, true).slice(1)
    );
    this.appendPolygonPoints(
      polygon,
      this.buildVerticalEdgePoints(input.westZIndices, input.x0, true).slice(1)
    );

    const first = polygon[0];
    const last = polygon[polygon.length - 1];
    if (first && last && this.isSameGridPoint(first, last)) {
      polygon.pop();
    }

    return polygon;
  }

  private buildHorizontalEdgePoints(
    xIndices: readonly number[],
    iz: number,
    reverse: boolean
  ): TerrainGridPoint[] {
    const ordered = reverse ? [...xIndices].reverse() : [...xIndices];
    return ordered.map((ix) => ({ ix, iz }));
  }

  private buildVerticalEdgePoints(
    zIndices: readonly number[],
    ix: number,
    reverse: boolean
  ): TerrainGridPoint[] {
    const ordered = reverse ? [...zIndices].reverse() : [...zIndices];
    return ordered.map((iz) => ({ ix, iz }));
  }

  private appendPolygonPoints(polygon: TerrainGridPoint[], points: readonly TerrainGridPoint[]): void {
    for (const point of points) {
      const last = polygon[polygon.length - 1];
      if (last && this.isSameGridPoint(last, point)) {
        continue;
      }
      polygon.push(point);
    }
  }

  private appendPolygonTriangles(
    indices: number[],
    polygon: readonly TerrainGridPoint[],
    getOrCreateTopVertex: (ix: number, iz: number) => number
  ): void {
    if (polygon.length < 3) {
      return;
    }

    const anchor = polygon[0];
    if (!anchor) {
      return;
    }

    const anchorVertex = getOrCreateTopVertex(anchor.ix, anchor.iz);
    for (let polygonIndex = 1; polygonIndex < polygon.length - 1; polygonIndex += 1) {
      const current = polygon[polygonIndex];
      const next = polygon[polygonIndex + 1];
      if (!current || !next) {
        continue;
      }
      indices.push(
        getOrCreateTopVertex(next.ix, next.iz),
        getOrCreateTopVertex(current.ix, current.iz),
        anchorVertex
      );
    }
  }

  private createGridPointKey(ix: number, iz: number): string {
    return `${ix}:${iz}`;
  }

  private isSameGridPoint(left: TerrainGridPoint, right: TerrainGridPoint): boolean {
    return left.ix === right.ix && left.iz === right.iz;
  }

  private hasIndexRangeOverlap(leftStart: number, leftEnd: number, rightStart: number, rightEnd: number): boolean {
    return Math.max(leftStart, rightStart) < Math.min(leftEnd, rightEnd);
  }

  /**
   * Создает line mesh debug-сетки patch.
   */
  public buildDebugLineMesh(scene: Scene, options: TerrainQuadtreePatchDebugLineOptions): LinesMesh {
    const lines = this.buildDebugLines(options);
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
      terrainQuadtreeSampleStep: options.sampleStep,
      terrainQuadtreeDebugMode: options.mode ?? "fullPatchGrid"
    };
    return mesh;
  }

  /**
   * Строит debug-линии patch без создания отдельного mesh.
   */
  public buildDebugLines(options: TerrainQuadtreePatchDebugLineOptions): Vector3[][] {
    const lines: Vector3[][] = [];
    const step = Math.max(1, Math.round(options.sampleStep));
    const xIndices = this.axisIndexBuilder.build(options.node.ix0, options.node.ix1, step);
    const zIndices = this.axisIndexBuilder.build(options.node.iz0, options.node.iz1, step);
    const yOffset = options.verticalOffset ?? 0.08;
    const mode = options.mode ?? "fullPatchGrid";

    if (mode === "patchBorders") {
      const firstZ = zIndices[0];
      const lastZ = zIndices[zIndices.length - 1];
      const firstX = xIndices[0];
      const lastX = xIndices[xIndices.length - 1];
      if (firstZ !== undefined) {
        lines.push(xIndices.map((ix) => this.debugPointFactory.create(options.heightField, ix, firstZ, yOffset)));
      }
      if (lastZ !== undefined && lastZ !== firstZ) {
        lines.push(xIndices.map((ix) => this.debugPointFactory.create(options.heightField, ix, lastZ, yOffset)));
      }
      if (firstX !== undefined) {
        lines.push(zIndices.map((iz) => this.debugPointFactory.create(options.heightField, firstX, iz, yOffset)));
      }
      if (lastX !== undefined && lastX !== firstX) {
        lines.push(zIndices.map((iz) => this.debugPointFactory.create(options.heightField, lastX, iz, yOffset)));
      }
      return lines;
    }

    for (const iz of zIndices) {
      lines.push(xIndices.map((ix) => this.debugPointFactory.create(options.heightField, ix, iz, yOffset)));
    }
    for (const ix of xIndices) {
      lines.push(zIndices.map((iz) => this.debugPointFactory.create(options.heightField, ix, iz, yOffset)));
    }

    return lines;
  }
}
