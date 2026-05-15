import type { Vector3 } from "@babylonjs/core";

export type TerrainQuadtreeLodStrategy = "quadtree";

/**
 * Один порог LOD: до указанной дистанции patch может использовать этот sample step.
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
  readonly nearLeafWorldSize?: number;
  readonly nearFullResolutionPatchQuads?: number;
  readonly nearFullResolutionRadius?: number;
  readonly lodRings?: readonly TerrainQuadtreeLodRing[];
  /** @deprecated Используйте targetPatchQuads. Поле оставлено для обратной совместимости scene JSON. */
  readonly basePatchQuads?: number;
  /** @deprecated Используйте lodRings. Поле оставлено для обратной совместимости scene JSON. */
  readonly splitDistances?: readonly number[];
  readonly updateIntervalSeconds?: number;
  readonly skirtDepth?: number;
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
  readonly nearLeafWorldSize: number;
  readonly nearFullResolutionPatchQuads: number;
  readonly nearFullResolutionRadius: number;
  readonly lodRings: readonly TerrainQuadtreeLodRing[];
  readonly updateIntervalSeconds: number;
  readonly skirtDepth: number;
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
  readonly desiredMaxSampleStep: number;
  readonly distanceToAnchor: number;
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
  readonly sourceQuadSize: number;
  readonly desiredNearLeafWorldSize: number;
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
  targetPatchQuads: 8,
  nearLeafWorldSize: 1,
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

  public constructor(
    nativeDepthResolver = new TerrainNativeLodDepthResolver(),
    quadSizeCalculator = new TerrainQuadSizeCalculator()
  ) {
    this.nativeDepthResolver = nativeDepthResolver;
    this.quadSizeCalculator = quadSizeCalculator;
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
    const nearLeafWorldSize =
      descriptor?.nearLeafWorldSize ??
      this.resolveLegacyNearLeafWorldSize(descriptor, heightField) ??
      DEFAULT_TERRAIN_QUADTREE_LOD.nearLeafWorldSize;

    return {
      enabled: descriptor?.enabled ?? DEFAULT_TERRAIN_QUADTREE_LOD.enabled,
      strategy: descriptor?.strategy ?? DEFAULT_TERRAIN_QUADTREE_LOD.strategy,
      maxDepth: descriptor?.maxDepth ?? this.nativeDepthResolver.resolve(heightField),
      targetPatchQuads,
      nearLeafWorldSize: Math.max(0.0001, nearLeafWorldSize),
      nearFullResolutionPatchQuads:
        descriptor?.nearFullResolutionPatchQuads ??
        DEFAULT_TERRAIN_QUADTREE_LOD.nearFullResolutionPatchQuads,
      nearFullResolutionRadius:
        descriptor?.nearFullResolutionRadius ?? DEFAULT_TERRAIN_QUADTREE_LOD.nearFullResolutionRadius,
      lodRings: this.normalizeLodRings(lodRings),
      updateIntervalSeconds:
        descriptor?.updateIntervalSeconds ?? DEFAULT_TERRAIN_QUADTREE_LOD.updateIntervalSeconds,
      skirtDepth: descriptor?.skirtDepth ?? DEFAULT_TERRAIN_QUADTREE_LOD.skirtDepth,
      debug: descriptor?.debug ?? DEFAULT_TERRAIN_QUADTREE_LOD.debug
    };
  }

  private resolveLegacyNearLeafWorldSize(
    descriptor: TerrainQuadtreeLodDescriptor | null | undefined,
    heightField:
      | {
          readonly width: number;
          readonly depth: number;
          readonly resolutionX: number;
          readonly resolutionZ: number;
        }
      | undefined
  ): number | undefined {
    if (descriptor?.nearFullResolutionPatchQuads === undefined || !heightField) {
      return undefined;
    }

    return descriptor.nearFullResolutionPatchQuads * this.quadSizeCalculator.compute(heightField);
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
