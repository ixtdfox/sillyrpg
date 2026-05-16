import {
  BoundingBox,
  Frustum,
  Vector3,
  type Camera,
  type Plane,
  type TransformNode
} from "@babylonjs/core";
import type { TerrainHeightField } from "../TerrainHeightField";
import { TerrainQuadtreeBoundsBuilder } from "./TerrainQuadtreeBounds";
import type {
  TerrainFrustumCullingDiagnostics,
  TerrainFrustumCullingOptions,
  TerrainQuadtreeNode
} from "./TerrainQuadtreeLodTypes";

export interface TerrainFrustumCullingPolicyOptions {
  readonly terrainRoot: TransformNode;
  readonly heightField: TerrainHeightField;
  readonly camera: Camera | null;
  readonly anchorLocal: Vector3;
  readonly horizontalWorldScale: number;
  readonly options: TerrainFrustumCullingOptions;
}

/**
 * Conservative pre-mesh culling for terrain quadtree nodes.
 */
export class TerrainFrustumCullingPolicy {
  private readonly terrainRoot: TransformNode;
  private readonly heightField: TerrainHeightField;
  private readonly anchorLocal: Vector3;
  private readonly horizontalWorldScale: number;
  private readonly options: TerrainFrustumCullingOptions;
  private readonly frustumPlanes: readonly Plane[] | null;
  private readonly boundsBuilder: TerrainQuadtreeBoundsBuilder;
  private diagnostics: TerrainFrustumCullingDiagnostics;

  public constructor(
    policyOptions: TerrainFrustumCullingPolicyOptions,
    boundsBuilder = new TerrainQuadtreeBoundsBuilder()
  ) {
    this.terrainRoot = policyOptions.terrainRoot;
    this.heightField = policyOptions.heightField;
    this.anchorLocal = policyOptions.anchorLocal;
    this.horizontalWorldScale = Math.max(0.0001, policyOptions.horizontalWorldScale);
    this.options = policyOptions.options;
    this.boundsBuilder = boundsBuilder;
    this.frustumPlanes = this.createFrustumPlanes(policyOptions.camera);
    this.diagnostics = this.createDiagnostics(this.isEffective());
  }

  public shouldKeepNode(node: TerrainQuadtreeNode): boolean {
    if (!this.isEffective()) {
      return true;
    }

    this.diagnostics = {
      ...this.diagnostics,
      testedNodeCount: this.diagnostics.testedNodeCount + 1
    };

    if (this.isKeptByNearAnchor(node)) {
      this.diagnostics = {
        ...this.diagnostics,
        acceptedNodeCount: this.diagnostics.acceptedNodeCount + 1,
        keptByNearAnchorCount: this.diagnostics.keptByNearAnchorCount + 1
      };
      return true;
    }

    const bounds = this.boundsBuilder.buildWorldBounds(
      node,
      this.heightField,
      this.terrainRoot,
      this.options.guardWorldPadding,
      this.options.maxHeightPadding
    );
    const isInFrustum = BoundingBox.IsInFrustum([...bounds.worldCorners], this.frustumPlanes ? [...this.frustumPlanes] : []);
    if (isInFrustum) {
      this.diagnostics = {
        ...this.diagnostics,
        acceptedNodeCount: this.diagnostics.acceptedNodeCount + 1
      };
      return true;
    }

    this.diagnostics = {
      ...this.diagnostics,
      rejectedNodeCount: this.diagnostics.rejectedNodeCount + 1
    };
    return false;
  }

  public getDiagnostics(): TerrainFrustumCullingDiagnostics {
    return this.diagnostics;
  }

  public static createDisabledDiagnostics(): TerrainFrustumCullingDiagnostics {
    return {
      enabled: false,
      testedNodeCount: 0,
      rejectedNodeCount: 0,
      acceptedNodeCount: 0,
      keptByNearAnchorCount: 0
    };
  }

  private isEffective(): boolean {
    return this.options.enabled && this.frustumPlanes !== null;
  }

  private isKeptByNearAnchor(node: TerrainQuadtreeNode): boolean {
    if (this.options.keepNearAnchorRadius <= 0) {
      return false;
    }

    return this.boundsBuilder.computeHorizontalDistanceToNodeAabb(
      node,
      this.anchorLocal,
      this.horizontalWorldScale
    ) <= this.options.keepNearAnchorRadius;
  }

  private createFrustumPlanes(camera: Camera | null): readonly Plane[] | null {
    if (!this.options.enabled || !camera) {
      return null;
    }

    const viewMatrix = camera.getViewMatrix(true);
    const projectionMatrix = camera.getProjectionMatrix(true);
    return Frustum.GetPlanes(viewMatrix.multiply(projectionMatrix));
  }

  private createDiagnostics(enabled: boolean): TerrainFrustumCullingDiagnostics {
    return {
      enabled,
      testedNodeCount: 0,
      rejectedNodeCount: 0,
      acceptedNodeCount: 0,
      keptByNearAnchorCount: 0
    };
  }
}
