import { Vector3 } from "@babylonjs/core";
import type { TerrainHeightField } from "../TerrainHeightField";
import type {
  ResolvedTerrainQuadtreeLodDescriptor,
  TerrainQuadtreeLeafSelection,
  TerrainQuadtreeNode
} from "./TerrainQuadtreeLodTypes";

/**
 * Геометрия quadtree node в локальных координатах terrain.
 */
class TerrainQuadtreeNodeGeometry {
  /**
   * Переводит X-индекс heightfield в локальную координату terrain mesh.
   */
  public vertexIndexToLocalX(heightField: TerrainHeightField, ix: number): number {
    const u = heightField.resolutionX <= 1 ? 0 : ix / (heightField.resolutionX - 1);
    return (u - 0.5) * heightField.width;
  }

  /**
   * Переводит Z-индекс heightfield в локальную координату terrain mesh.
   */
  public vertexIndexToLocalZ(heightField: TerrainHeightField, iz: number): number {
    const v = heightField.resolutionZ <= 1 ? 0 : iz / (heightField.resolutionZ - 1);
    return (0.5 - v) * heightField.depth;
  }

  /**
   * Считает горизонтальную дистанцию от anchor до AABB quadtree node.
   */
  public computeHorizontalDistanceToNodeAabb(node: TerrainQuadtreeNode, anchorLocal: Vector3): number {
    const halfX = node.sizeWorldX * 0.5;
    const halfZ = node.sizeWorldZ * 0.5;
    const minX = node.centerLocalX - halfX;
    const maxX = node.centerLocalX + halfX;
    const minZ = node.centerLocalZ - halfZ;
    const maxZ = node.centerLocalZ + halfZ;
    const dx = anchorLocal.x < minX ? minX - anchorLocal.x : anchorLocal.x > maxX ? anchorLocal.x - maxX : 0;
    const dz = anchorLocal.z < minZ ? minZ - anchorLocal.z : anchorLocal.z > maxZ ? anchorLocal.z - maxZ : 0;
    return Math.sqrt((dx * dx) + (dz * dz));
  }
}

/**
 * Политика выбора sample step для quadtree patch.
 */
export class TerrainQuadtreeSampleStepPolicy {
  /**
   * Считает естественный sample step, чтобы patch не превышал целевой бюджет quad'ов.
   */
  public computeNaturalSampleStep(node: TerrainQuadtreeNode, targetPatchQuads: number): number {
    const nodeQuadsX = Math.max(1, node.ix1 - node.ix0);
    const nodeQuadsZ = Math.max(1, node.iz1 - node.iz0);
    return Math.max(1, Math.ceil(Math.max(nodeQuadsX, nodeQuadsZ) / Math.max(1, targetPatchQuads)));
  }

  /**
   * Ограничивает natural sample step желаемым LOD уровнем для текущей дистанции.
   */
  public computePatchSampleStep(
    node: TerrainQuadtreeNode,
    targetPatchQuads: number,
    desiredMaxSampleStep: number
  ): number {
    return Math.max(1, Math.min(this.computeNaturalSampleStep(node, targetPatchQuads), Math.max(1, desiredMaxSampleStep)));
  }

  /**
   * Выбирает максимально допустимый sample step по LOD rings.
   */
  public resolveDesiredSampleStep(
    distanceToNode: number,
    descriptor: ResolvedTerrainQuadtreeLodDescriptor
  ): number {
    if (distanceToNode <= descriptor.nearFullResolutionRadius) {
      return 1;
    }

    for (const ring of descriptor.lodRings) {
      if (distanceToNode <= ring.distance) {
        return ring.maxSampleStep;
      }
    }

    return descriptor.lodRings[descriptor.lodRings.length - 1]?.maxSampleStep ?? 8;
  }

  /**
   * Возвращает желаемый world size near-field patch mesh.
   */
  public computeNearPatchWorldSize(descriptor: ResolvedTerrainQuadtreeLodDescriptor): number {
    return Math.max(0.0001, descriptor.nearPatchWorldSize);
  }
}

/**
 * Builder quadtree LOD структуры и видимых leaf selections.
 */
export class TerrainQuadtreeLodBuilder {
  private readonly nodeGeometry: TerrainQuadtreeNodeGeometry;
  private readonly sampleStepPolicy: TerrainQuadtreeSampleStepPolicy;

  public constructor(
    nodeGeometry = new TerrainQuadtreeNodeGeometry(),
    sampleStepPolicy = new TerrainQuadtreeSampleStepPolicy()
  ) {
    this.nodeGeometry = nodeGeometry;
    this.sampleStepPolicy = sampleStepPolicy;
  }

  /**
   * Строит root node по всему heightfield.
   */
  public buildRoot(heightField: TerrainHeightField, maxDepth: number): TerrainQuadtreeNode {
    return this.buildNode(heightField, 0, 0, 0, heightField.resolutionX - 1, heightField.resolutionZ - 1, maxDepth);
  }

  /**
   * Выбирает leaf nodes, которые должны быть видимы относительно anchor.
   */
  public selectVisibleLeaves(
    root: TerrainQuadtreeNode,
    anchorLocal: Vector3,
    descriptor: ResolvedTerrainQuadtreeLodDescriptor,
    heightField: TerrainHeightField,
    horizontalWorldScale = 1
  ): readonly TerrainQuadtreeLeafSelection[] {
    const leaves: TerrainQuadtreeLeafSelection[] = [];
    this.collectVisibleLeaves(
      root,
      anchorLocal,
      descriptor,
      heightField,
      Math.max(0.0001, horizontalWorldScale),
      leaves
    );
    return leaves;
  }

  private buildNode(
    heightField: TerrainHeightField,
    depth: number,
    ix0: number,
    iz0: number,
    ix1: number,
    iz1: number,
    maxDepth: number
  ): TerrainQuadtreeNode {
    const node: Omit<TerrainQuadtreeNode, "children"> = {
      id: `${depth}:${ix0}:${iz0}:${ix1}:${iz1}`,
      depth,
      ix0,
      iz0,
      ix1,
      iz1,
      centerLocalX: (this.nodeGeometry.vertexIndexToLocalX(heightField, ix0) + this.nodeGeometry.vertexIndexToLocalX(heightField, ix1)) * 0.5,
      centerLocalZ: (this.nodeGeometry.vertexIndexToLocalZ(heightField, iz0) + this.nodeGeometry.vertexIndexToLocalZ(heightField, iz1)) * 0.5,
      sizeWorldX: Math.abs(this.nodeGeometry.vertexIndexToLocalX(heightField, ix1) - this.nodeGeometry.vertexIndexToLocalX(heightField, ix0)),
      sizeWorldZ: Math.abs(this.nodeGeometry.vertexIndexToLocalZ(heightField, iz1) - this.nodeGeometry.vertexIndexToLocalZ(heightField, iz0))
    };

    if (depth >= maxDepth || ix1 - ix0 <= 1 || iz1 - iz0 <= 1) {
      return { ...node, children: [] };
    }

    const ixMid = ix0 + Math.floor((ix1 - ix0) * 0.5);
    const izMid = iz0 + Math.floor((iz1 - iz0) * 0.5);
    if (ixMid <= ix0 || ixMid >= ix1 || izMid <= iz0 || izMid >= iz1) {
      return { ...node, children: [] };
    }

    return {
      ...node,
      children: [
        this.buildNode(heightField, depth + 1, ix0, iz0, ixMid, izMid, maxDepth),
        this.buildNode(heightField, depth + 1, ixMid, iz0, ix1, izMid, maxDepth),
        this.buildNode(heightField, depth + 1, ix0, izMid, ixMid, iz1, maxDepth),
        this.buildNode(heightField, depth + 1, ixMid, izMid, ix1, iz1, maxDepth)
      ]
    };
  }

  private collectVisibleLeaves(
    node: TerrainQuadtreeNode,
    anchorLocal: Vector3,
    descriptor: ResolvedTerrainQuadtreeLodDescriptor,
    heightField: TerrainHeightField,
    horizontalWorldScale: number,
    leaves: TerrainQuadtreeLeafSelection[]
  ): void {
    const distanceToNode = this.nodeGeometry.computeHorizontalDistanceToNodeAabb(node, anchorLocal) * horizontalWorldScale;
    const desiredMaxSampleStep = this.sampleStepPolicy.resolveDesiredSampleStep(distanceToNode, descriptor);
    const naturalSampleStep = this.sampleStepPolicy.computeNaturalSampleStep(node, descriptor.targetPatchQuads);
    const sampleStep = this.sampleStepPolicy.computePatchSampleStep(node, descriptor.targetPatchQuads, desiredMaxSampleStep);
    const patchWorldSize = Math.max(node.sizeWorldX, node.sizeWorldZ) * horizontalWorldScale;
    const nodeInsideNearFullResolutionRadius = distanceToNode <= descriptor.nearFullResolutionRadius;
    const nearPatchTooLarge =
      nodeInsideNearFullResolutionRadius &&
      patchWorldSize > this.sampleStepPolicy.computeNearPatchWorldSize(descriptor);
    const patchWouldExceedSampleBudget = naturalSampleStep > desiredMaxSampleStep;
    const shouldSplit =
      node.children.length > 0 &&
      node.depth < descriptor.maxDepth &&
      (
        patchWouldExceedSampleBudget ||
        nearPatchTooLarge
      );

    if (!shouldSplit) {
      leaves.push({
        node,
        sampleStep,
        desiredMaxSampleStep,
        distanceToAnchor: distanceToNode
      });
      return;
    }

    for (const child of node.children) {
      this.collectVisibleLeaves(child, anchorLocal, descriptor, heightField, horizontalWorldScale, leaves);
    }
  }
}
