import type { Vector3 } from "@babylonjs/core";

export type TerrainQuadtreeLodStrategy = "quadtree";

export interface TerrainQuadtreeLodRing {
  readonly distance: number;
  readonly maxSampleStep: number;
}

export interface TerrainQuadtreeLodDescriptor {
  readonly enabled?: boolean;
  readonly strategy?: TerrainQuadtreeLodStrategy;
  readonly maxDepth?: number;
  readonly targetPatchQuads?: number;
  readonly nearFullResolutionPatchQuads?: number;
  readonly nearFullResolutionRadius?: number;
  readonly lodRings?: readonly TerrainQuadtreeLodRing[];
  /** @deprecated Use targetPatchQuads. Kept for backward-compatible descriptor parsing. */
  readonly basePatchQuads?: number;
  /** @deprecated Use lodRings. Kept for backward-compatible descriptor parsing. */
  readonly splitDistances?: readonly number[];
  readonly updateIntervalSeconds?: number;
  readonly skirtDepth?: number;
  readonly debug?: boolean;
}

export interface ResolvedTerrainQuadtreeLodDescriptor {
  readonly enabled: boolean;
  readonly strategy: TerrainQuadtreeLodStrategy;
  readonly maxDepth: number;
  readonly targetPatchQuads: number;
  readonly nearFullResolutionPatchQuads: number;
  readonly nearFullResolutionRadius: number;
  readonly lodRings: readonly TerrainQuadtreeLodRing[];
  readonly updateIntervalSeconds: number;
  readonly skirtDepth: number;
  readonly debug: boolean;
}

export interface TerrainQuadtreeNode {
  readonly id: string;
  readonly depth: number;
  readonly ix0: number;
  readonly iz0: number;
  readonly ix1: number;
  readonly iz1: number;
  readonly centerLocalX: number;
  readonly centerLocalZ: number;
  readonly sizeWorldX: number;
  readonly sizeWorldZ: number;
  readonly children: readonly TerrainQuadtreeNode[];
}

export interface TerrainQuadtreeLeafSelection {
  readonly node: TerrainQuadtreeNode;
  readonly sampleStep: number;
  readonly desiredMaxSampleStep: number;
  readonly distanceToAnchor: number;
}

export interface TerrainLodAnchor {
  readonly position: Vector3;
  readonly source: "player" | "camera-fallback";
}

export interface TerrainQuadtreeLodDiagnostics {
  readonly visibleLeafCount: number;
  readonly maxDepth: number;
  readonly anchorSource: TerrainLodAnchor["source"] | null;
  readonly depthCounts: ReadonlyMap<number, number>;
  readonly sampleStepCounts: ReadonlyMap<number, number>;
  readonly minDistanceToAnchor: number | null;
  readonly maxDistanceToAnchor: number | null;
}

export const DEFAULT_TERRAIN_QUADTREE_LOD = {
  enabled: true,
  strategy: "quadtree",
  maxDepth: undefined,
  targetPatchQuads: 8,
  nearFullResolutionPatchQuads: 4,
  nearFullResolutionRadius: 48,
  lodRings: [
    { distance: 48, maxSampleStep: 1 },
    { distance: 96, maxSampleStep: 2 },
    { distance: 180, maxSampleStep: 4 },
    { distance: 320, maxSampleStep: 8 }
  ],
  updateIntervalSeconds: 0.15,
  skirtDepth: 0.75,
  debug: false
} satisfies TerrainQuadtreeLodDescriptor;

export function resolveTerrainQuadtreeLodDescriptor(
  descriptor: TerrainQuadtreeLodDescriptor | null | undefined,
  heightField?: {
    readonly width: number;
    readonly depth: number;
    readonly resolutionX: number;
    readonly resolutionZ: number;
  }
): ResolvedTerrainQuadtreeLodDescriptor {
  const targetPatchQuads =
    descriptor?.targetPatchQuads ??
    descriptor?.basePatchQuads ??
    DEFAULT_TERRAIN_QUADTREE_LOD.targetPatchQuads;
  const lodRings =
    descriptor?.lodRings ??
    convertLegacySplitDistancesToRings(descriptor?.splitDistances) ??
    DEFAULT_TERRAIN_QUADTREE_LOD.lodRings;

  return {
    enabled: descriptor?.enabled ?? DEFAULT_TERRAIN_QUADTREE_LOD.enabled,
    strategy: descriptor?.strategy ?? DEFAULT_TERRAIN_QUADTREE_LOD.strategy,
    maxDepth: descriptor?.maxDepth ?? resolveNativeMaxDepth(heightField),
    targetPatchQuads,
    nearFullResolutionPatchQuads:
      descriptor?.nearFullResolutionPatchQuads ??
      DEFAULT_TERRAIN_QUADTREE_LOD.nearFullResolutionPatchQuads,
    nearFullResolutionRadius:
      descriptor?.nearFullResolutionRadius ?? DEFAULT_TERRAIN_QUADTREE_LOD.nearFullResolutionRadius,
    lodRings: normalizeLodRings(lodRings),
    updateIntervalSeconds:
      descriptor?.updateIntervalSeconds ?? DEFAULT_TERRAIN_QUADTREE_LOD.updateIntervalSeconds,
    skirtDepth: descriptor?.skirtDepth ?? DEFAULT_TERRAIN_QUADTREE_LOD.skirtDepth,
    debug: descriptor?.debug ?? DEFAULT_TERRAIN_QUADTREE_LOD.debug
  };
}

export function resolveNativeMaxDepth(heightField?: {
  readonly resolutionX: number;
  readonly resolutionZ: number;
}): number {
  if (!heightField) {
    return 6;
  }

  const minQuads = Math.max(1, Math.min(heightField.resolutionX - 1, heightField.resolutionZ - 1));
  return Math.max(0, Math.floor(Math.log2(minQuads)));
}

export function computeTerrainQuadSize(heightField: {
  readonly width: number;
  readonly depth: number;
  readonly resolutionX: number;
  readonly resolutionZ: number;
}): number {
  const quadSizeX = heightField.resolutionX <= 1 ? heightField.width : heightField.width / (heightField.resolutionX - 1);
  const quadSizeZ = heightField.resolutionZ <= 1 ? heightField.depth : heightField.depth / (heightField.resolutionZ - 1);
  return (Math.abs(quadSizeX) + Math.abs(quadSizeZ)) * 0.5;
}

function convertLegacySplitDistancesToRings(splitDistances: readonly number[] | undefined): readonly TerrainQuadtreeLodRing[] | undefined {
  if (!splitDistances || splitDistances.length === 0) {
    return undefined;
  }

  return splitDistances.map((distance, index) => ({
    distance,
    maxSampleStep: 2 ** index
  }));
}

function normalizeLodRings(rings: readonly TerrainQuadtreeLodRing[]): readonly TerrainQuadtreeLodRing[] {
  return [...rings]
    .map((ring) => ({
      distance: Math.max(0.0001, ring.distance),
      maxSampleStep: Math.max(1, Math.round(ring.maxSampleStep))
    }))
    .sort((left, right) => left.distance - right.distance);
}
