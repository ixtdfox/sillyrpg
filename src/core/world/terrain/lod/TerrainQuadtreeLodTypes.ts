import type { Vector3 } from "@babylonjs/core";

export type TerrainQuadtreeLodStrategy = "quadtree";
export type TerrainQuadtreeLodDebugMode = "off" | "patchBorders" | "fullPatchGrid";
export type TerrainCanonicalMeshMode = "OFF" | "PICK_ONLY" | "FULL_RENDER_FALLBACK";

/**
 * Один порог LOD: до указанной дистанции patch использует этот желаемый sample step.
 *
 * Поле называется `maxSampleStep` для совместимости с существующими scene JSON,
 * но в runtime это минимальная decimation-цель кольца: far rings не могут быть
 * случайно возвращены к более плотному sampleStep из-за маленького patch node.
 */
export interface TerrainQuadtreeLodRing {
  readonly distance: number;
  readonly maxSampleStep: number;
}

/**
 * Сырой descriptor LOD из scene JSON.
 */
export interface TerrainQuadtreeLodDescriptor {
  readonly enabled?: boolean;
  readonly strategy?: TerrainQuadtreeLodStrategy;
  readonly maxDepth?: number;
  readonly targetPatchQuads?: number;
  readonly nearPatchWorldSize?: number;
  /** @deprecated Use nearPatchWorldSize. Values <= 2 are treated as legacy source-grid intent. */
  readonly nearLeafWorldSize?: number;
  /** @deprecated Use nearPatchWorldSize. */
  readonly nearFullResolutionPatchQuads?: number;
  readonly nearFullResolutionRadius?: number;
  readonly lodRings?: readonly TerrainQuadtreeLodRing[];
  /** @deprecated Используйте targetPatchQuads. Поле оставлено для обратной совместимости scene JSON. */
  readonly basePatchQuads?: number;
  /** @deprecated Используйте lodRings. Поле оставлено для обратной совместимости scene JSON. */
  readonly splitDistances?: readonly number[];
  readonly updateIntervalSeconds?: number;
  readonly updateMovementThreshold?: number;
  readonly skirtDepth?: number;
  readonly debugMode?: TerrainQuadtreeLodDebugMode;
  readonly debug?: boolean;
}

/**
 * Полностью нормализованный descriptor, готовый для LOD controller.
 */
export interface ResolvedTerrainQuadtreeLodDescriptor {
  readonly enabled: boolean;
  readonly strategy: TerrainQuadtreeLodStrategy;
  readonly maxDepth: number;
  readonly targetPatchQuads: number;
  readonly nearPatchWorldSize: number;
  readonly nearFullResolutionPatchQuads: number;
  readonly nearFullResolutionRadius: number;
  readonly lodRings: readonly TerrainQuadtreeLodRing[];
  readonly updateIntervalSeconds: number;
  readonly updateMovementThreshold: number;
  readonly skirtDepth: number;
  readonly debugMode: TerrainQuadtreeLodDebugMode;
  readonly debug: boolean;
}

/**
 * Узел quadtree в индексах heightfield и локальных world размерах patch.
 */
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

/**
 * Выбранный visible leaf вместе с решенным sample step.
 */
export interface TerrainQuadtreeLeafSelection {
  readonly node: TerrainQuadtreeNode;
  readonly sampleStep: number;
  /**
   * Finest sample step used by the generated patch surface after seam compatibility.
   *
   * Logical LOD selection remains in `sampleStep`; this value is diagnostic/cache
   * metadata for patches whose borders are refined to match adjacent finer leaves.
   */
  readonly buildSampleStep?: number;
  readonly desiredSampleStep: number;
  /** @deprecated Use desiredSampleStep. */
  readonly desiredMaxSampleStep: number;
  readonly distanceToAnchor: number;
  readonly seamInfo?: TerrainPatchSeamInfo;
}

export type TerrainPatchEdge = "north" | "south" | "west" | "east";

export interface TerrainPatchEdgeStitchInfo {
  readonly edge: TerrainPatchEdge;
  readonly ownSampleStep: number;
  readonly neighborSampleStep: number;
  readonly mode: "none" | "stitch-to-finer" | "stitch-to-coarser";
  readonly segments?: readonly TerrainPatchEdgeStitchSegment[];
}

export interface TerrainPatchEdgeStitchSegment {
  readonly startIndex: number;
  readonly endIndex: number;
  readonly neighborSampleStep: number;
  readonly stitchIndices?: readonly number[];
  readonly mode: "none" | "stitch-to-finer" | "stitch-to-coarser";
}

export interface TerrainPatchSeamInfo {
  readonly north?: TerrainPatchEdgeStitchInfo;
  readonly south?: TerrainPatchEdgeStitchInfo;
  readonly west?: TerrainPatchEdgeStitchInfo;
  readonly east?: TerrainPatchEdgeStitchInfo;
}

/**
 * Точка привязки LOD, обычно игрок или fallback на активную камеру.
 */
export interface TerrainLodAnchor {
  readonly position: Vector3;
  readonly source: "player" | "camera-fallback";
}

/**
 * Снимок состояния LOD controller для debug UI и тестов.
 */
export interface TerrainQuadtreeLodDiagnostics {
  readonly visibleLeafCount: number;
  readonly maxDepth: number;
  readonly anchorSource: TerrainLodAnchor["source"] | null;
  readonly depthCounts: ReadonlyMap<number, number>;
  readonly sampleStepCounts: ReadonlyMap<number, number>;
  readonly buildSampleStepCounts: ReadonlyMap<number, number>;
  readonly approxTrianglesBySampleStep: ReadonlyMap<number, number>;
  readonly approxTrianglesByBuildSampleStep: ReadonlyMap<number, number>;
  readonly sourceQuadSize: number;
  readonly sourceResolutionX: number;
  readonly sourceResolutionZ: number;
  readonly sourceQuadCount: number;
  readonly desiredNearPatchWorldSize: number;
  readonly activePatchMeshCount: number;
  readonly cachedPatchMeshCount: number;
  readonly inactiveCachedPatchMeshCount: number;
  readonly activePatchVertices: number;
  readonly activePatchTriangles: number;
  readonly cachedPatchVertices: number;
  readonly cachedPatchTriangles: number;
  readonly activeDebugLineMeshCount: number;
  readonly approxVisibleTriangles: number;
  readonly canonicalMeshMode: TerrainCanonicalMeshMode;
  readonly canonicalMeshVertexCount: number;
  readonly canonicalMeshTriangleCount: number;
  readonly seamAdjustedPatchCount: number;
  readonly maxNeighborSampleStepRatio: number | null;
  readonly debugMode: TerrainQuadtreeLodDebugMode;
  readonly minLeafWorldSize: number | null;
  readonly maxLeafWorldSize: number | null;
  readonly minNearLeafWorldSize: number | null;
  readonly maxNearLeafWorldSize: number | null;
  readonly minDistanceToAnchor: number | null;
  readonly maxDistanceToAnchor: number | null;
}

export interface TerrainSourceDensityDiagnostic {
  readonly sourceQuadSize: number;
  readonly desiredNearQuadSize: number;
  readonly warningThreshold: number;
  readonly shouldWarn: boolean;
}

export const DEFAULT_TERRAIN_QUADTREE_LOD = {
  enabled: true,
  strategy: "quadtree",
  maxDepth: undefined,
  targetPatchQuads: 32,
  nearPatchWorldSize: 16,
  nearFullResolutionRadius: 40,
  lodRings: [
    { distance: 40, maxSampleStep: 1 },
    { distance: 80, maxSampleStep: 2 },
    { distance: 160, maxSampleStep: 4 },
    { distance: 320, maxSampleStep: 8 },
    { distance: 640, maxSampleStep: 16 },
    { distance: 1280, maxSampleStep: 32 }
  ],
  updateIntervalSeconds: 0.25,
  updateMovementThreshold: 2,
  skirtDepth: 0.5,
  debugMode: "off",
  debug: false
} satisfies TerrainQuadtreeLodDescriptor;

/**
 * Резолвер native quadtree depth из resolution heightfield.
 */
export class TerrainNativeLodDepthResolver {
  /**
   * Считает максимальную глубину, которую реально поддерживает source heightfield.
   */
  public resolve(heightField?: {
    readonly resolutionX: number;
    readonly resolutionZ: number;
  }): number {
    if (!heightField) {
      return 6;
    }

    const minQuads = Math.max(1, Math.min(heightField.resolutionX - 1, heightField.resolutionZ - 1));
    return Math.max(0, Math.ceil(Math.log2(minQuads)));
  }
}

/**
 * Калькулятор размера одного quad'а terrain в world units.
 */
export class TerrainQuadSizeCalculator {
  /**
   * Возвращает средний world size одного quad'а по X/Z осям.
   */
  public compute(heightField: {
    readonly width: number;
    readonly depth: number;
    readonly resolutionX: number;
    readonly resolutionZ: number;
  }): number {
    const quadSizeX = heightField.resolutionX <= 1 ? heightField.width : heightField.width / (heightField.resolutionX - 1);
    const quadSizeZ = heightField.resolutionZ <= 1 ? heightField.depth : heightField.depth / (heightField.resolutionZ - 1);
    return (Math.abs(quadSizeX) + Math.abs(quadSizeZ)) * 0.5;
  }
}

/**
 * Diagnostic policy for source heightfield density versus desired near-grid size.
 */
export class TerrainSourceDensityWarningPolicy {
  private readonly quadSizeCalculator: TerrainQuadSizeCalculator;

  public constructor(quadSizeCalculator = new TerrainQuadSizeCalculator()) {
    this.quadSizeCalculator = quadSizeCalculator;
  }

  public diagnose(
    heightField: {
      readonly width: number;
      readonly depth: number;
      readonly resolutionX: number;
      readonly resolutionZ: number;
    },
    desiredNearQuadSize: number,
    horizontalWorldScale = 1
  ): TerrainSourceDensityDiagnostic {
    const sourceQuadSize = this.quadSizeCalculator.compute(heightField) * Math.max(0.0001, horizontalWorldScale);
    const desired = Math.max(0.0001, desiredNearQuadSize);
    const warningThreshold = desired * 1.25;
    return {
      sourceQuadSize,
      desiredNearQuadSize: desired,
      warningThreshold,
      shouldWarn: sourceQuadSize > warningThreshold
    };
  }
}

/**
 * Резолвер descriptor'а quadtree LOD.
 *
 * Поддерживает legacy поля `basePatchQuads` и `splitDistances`, но возвращает
 * уже нормализованный контракт для LOD controller.
 */
export class TerrainQuadtreeLodDescriptorResolver {
  private readonly nativeDepthResolver: TerrainNativeLodDepthResolver;
  private readonly quadSizeCalculator: TerrainQuadSizeCalculator;
  private warnedLegacyNearLeafWorldSize: boolean;
  private warnedLegacyNearPatchQuads: boolean;

  public constructor(
    nativeDepthResolver = new TerrainNativeLodDepthResolver(),
    quadSizeCalculator = new TerrainQuadSizeCalculator()
  ) {
    this.nativeDepthResolver = nativeDepthResolver;
    this.quadSizeCalculator = quadSizeCalculator;
    this.warnedLegacyNearLeafWorldSize = false;
    this.warnedLegacyNearPatchQuads = false;
  }

  /**
   * Превращает optional/legacy descriptor в полный LOD descriptor.
   */
  public resolve(
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
      this.convertLegacySplitDistancesToRings(descriptor?.splitDistances) ??
      DEFAULT_TERRAIN_QUADTREE_LOD.lodRings;
    const nearPatchWorldSize = this.resolveNearPatchWorldSize(descriptor, heightField);

    return {
      enabled: descriptor?.enabled ?? DEFAULT_TERRAIN_QUADTREE_LOD.enabled,
      strategy: descriptor?.strategy ?? DEFAULT_TERRAIN_QUADTREE_LOD.strategy,
      maxDepth: descriptor?.maxDepth ?? this.nativeDepthResolver.resolve(heightField),
      targetPatchQuads,
      nearPatchWorldSize,
      nearFullResolutionPatchQuads:
        descriptor?.nearFullResolutionPatchQuads ??
        0,
      nearFullResolutionRadius:
        descriptor?.nearFullResolutionRadius ?? DEFAULT_TERRAIN_QUADTREE_LOD.nearFullResolutionRadius,
      lodRings: this.normalizeLodRings(lodRings),
      updateIntervalSeconds:
        descriptor?.updateIntervalSeconds ?? DEFAULT_TERRAIN_QUADTREE_LOD.updateIntervalSeconds,
      updateMovementThreshold:
        descriptor?.updateMovementThreshold ?? DEFAULT_TERRAIN_QUADTREE_LOD.updateMovementThreshold,
      skirtDepth: descriptor?.skirtDepth ?? DEFAULT_TERRAIN_QUADTREE_LOD.skirtDepth,
      debugMode: this.resolveDebugMode(descriptor),
      debug: descriptor?.debug ?? DEFAULT_TERRAIN_QUADTREE_LOD.debug
    };
  }

  private resolveNearPatchWorldSize(
    descriptor: TerrainQuadtreeLodDescriptor | null | undefined,
    heightField:
      | {
          readonly width: number;
          readonly depth: number;
          readonly resolutionX: number;
          readonly resolutionZ: number;
        }
      | undefined
  ): number {
    if (descriptor?.nearPatchWorldSize !== undefined) {
      return Math.max(0.0001, descriptor.nearPatchWorldSize);
    }

    if (descriptor?.nearLeafWorldSize !== undefined) {
      this.warnLegacyNearLeafWorldSize(descriptor.nearLeafWorldSize);
      if (descriptor.nearLeafWorldSize <= 2) {
        return DEFAULT_TERRAIN_QUADTREE_LOD.nearPatchWorldSize;
      }

      return Math.max(0.0001, descriptor.nearLeafWorldSize);
    }

    if (descriptor?.nearFullResolutionPatchQuads !== undefined && heightField) {
      const legacyWorldSize = descriptor.nearFullResolutionPatchQuads * this.quadSizeCalculator.compute(heightField);
      if (legacyWorldSize < DEFAULT_TERRAIN_QUADTREE_LOD.nearPatchWorldSize) {
        this.warnLegacyNearPatchQuads(descriptor.nearFullResolutionPatchQuads, legacyWorldSize);
        return DEFAULT_TERRAIN_QUADTREE_LOD.nearPatchWorldSize;
      }

      return Math.max(0.0001, legacyWorldSize);
    }

    return DEFAULT_TERRAIN_QUADTREE_LOD.nearPatchWorldSize;
  }

  private resolveDebugMode(
    descriptor: TerrainQuadtreeLodDescriptor | null | undefined
  ): TerrainQuadtreeLodDebugMode {
    if (descriptor?.debugMode !== undefined) {
      return descriptor.debugMode;
    }

    if (descriptor?.debug === true) {
      return "fullPatchGrid";
    }

    return DEFAULT_TERRAIN_QUADTREE_LOD.debugMode;
  }

  private warnLegacyNearLeafWorldSize(value: number): void {
    if (this.warnedLegacyNearLeafWorldSize) {
      return;
    }

    this.warnedLegacyNearLeafWorldSize = true;
    const migration =
      value <= 2
        ? `interpreting ${value.toFixed(2)} as old source-grid intent and using nearPatchWorldSize=${DEFAULT_TERRAIN_QUADTREE_LOD.nearPatchWorldSize}.`
        : `using it as nearPatchWorldSize=${value.toFixed(2)}.`;
    console.warn(`[TerrainLOD] lod.nearLeafWorldSize is deprecated; use lod.nearPatchWorldSize. ${migration}`);
  }

  private warnLegacyNearPatchQuads(value: number, legacyWorldSize: number): void {
    if (this.warnedLegacyNearPatchQuads) {
      return;
    }

    this.warnedLegacyNearPatchQuads = true;
    console.warn(
      `[TerrainLOD] lod.nearFullResolutionPatchQuads is deprecated; use lod.nearPatchWorldSize. ` +
      `Legacy value ${value} would create ${legacyWorldSize.toFixed(2)}m near patches, ` +
      `using nearPatchWorldSize=${DEFAULT_TERRAIN_QUADTREE_LOD.nearPatchWorldSize}.`
    );
  }

  private convertLegacySplitDistancesToRings(splitDistances: readonly number[] | undefined): readonly TerrainQuadtreeLodRing[] | undefined {
    if (!splitDistances || splitDistances.length === 0) {
      return undefined;
    }

    return splitDistances.map((distance, index) => ({
      distance,
      maxSampleStep: 2 ** index
    }));
  }

  private normalizeLodRings(rings: readonly TerrainQuadtreeLodRing[]): readonly TerrainQuadtreeLodRing[] {
    return [...rings]
      .map((ring) => ({
        distance: Math.max(0.0001, ring.distance),
        maxSampleStep: Math.max(1, Math.round(ring.maxSampleStep))
      }))
      .sort((left, right) => left.distance - right.distance);
  }
}
