import {
  Color3,
  MeshBuilder,
  Vector3,
  type LinesMesh,
  type Material,
  type Mesh,
  type Scene,
  type TransformNode
} from "@babylonjs/core";
import type { SceneGeneratedTerrainDescriptor } from "../../scene/SceneDescriptor";
import type { TerrainHeightField } from "../TerrainHeightField";
import { TerrainQuadtreeLodBuilder } from "./TerrainQuadtreeLodBuilder";
import { TerrainQuadtreePatchMeshBuilder } from "./TerrainQuadtreePatchMeshBuilder";
import { TerrainQuadtreeLodSeamResolver } from "./TerrainQuadtreeLodSeamResolver";
import {
  TerrainQuadSizeCalculator,
  TerrainQuadtreeLodDescriptorResolver,
  TerrainSourceDensityWarningPolicy,
  type TerrainCanonicalMeshMode,
  type ResolvedTerrainQuadtreeLodDescriptor,
  type TerrainLodAnchor,
  type TerrainQuadtreeLeafSelection,
  type TerrainQuadtreeLodDescriptor,
  type TerrainQuadtreeLodDebugMode,
  type TerrainQuadtreeLodDiagnostics,
  type TerrainQuadtreeLodRuntimeTuning,
  type TerrainQuadtreeNode
} from "./TerrainQuadtreeLodTypes";

/**
 * Dependency object для TerrainQuadtreeLodController.
 */
export interface TerrainQuadtreeLodControllerOptions {
  readonly scene: Scene;
  readonly terrainRoot: TransformNode;
  readonly descriptor: SceneGeneratedTerrainDescriptor;
  readonly heightField: TerrainHeightField;
  readonly lod?: TerrainQuadtreeLodDescriptor | null;
  readonly material: Material | null;
  readonly canonicalPickMesh?: Mesh | null;
}

/**
 * Factory ключей meshes для выбранных quadtree leaves.
 */
class TerrainLeafMeshKeyFactory {
  private readonly seamResolver: TerrainQuadtreeLodSeamResolver;

  public constructor(seamResolver = new TerrainQuadtreeLodSeamResolver()) {
    this.seamResolver = seamResolver;
  }

  /**
   * Создает стабильный ключ mesh по node id, logical sample step, and seam-adjusted build shape.
   */
  public make(leaf: TerrainQuadtreeLeafSelection): string {
    return `${leaf.node.id}:logical:${leaf.sampleStep}:build:${leaf.buildSampleStep ?? leaf.sampleStep}:seam:${this.seamResolver.createSignature(leaf.seamInfo)}`;
  }
}

/**
 * Политика debug-цвета LOD patch.
 */
class TerrainLodDebugStyle {
  /**
   * Возвращает контрастный цвет aggregated LOD debug grid.
   */
  public resolveAggregateDebugColor(): Color3 {
    return new Color3(1, 0.85, 0.2);
  }
}

/**
 * Formatter диагностических значений для TerrainLOD logs.
 */
class TerrainLodDebugFormatter {
  /**
   * Форматирует Vector3 компактно для console diagnostics.
   */
  public formatVector(vector: Vector3): string {
    return `${vector.x.toFixed(2)},${vector.y.toFixed(2)},${vector.z.toFixed(2)}`;
  }
}

/**
 * Controller quadtree LOD meshes.
 *
 * Управляет жизненным циклом patch meshes и обновляет набор visible leaves
 * относительно player/camera anchor.
 */
export class TerrainQuadtreeLodController {
  private static readonly CAMERA_GUARD_RADIUS_MULTIPLIER = 1.15;
  private static readonly CAMERA_GUARD_MAX_NEAR_RADIUS_MULTIPLIER = 3;

  private readonly scene: Scene;
  private readonly terrainRoot: TransformNode;
  private readonly canonicalPickMesh: Mesh | null;
  private readonly terrainDescriptor: SceneGeneratedTerrainDescriptor;
  private readonly heightField: TerrainHeightField;
  private readonly lodDescriptor: ResolvedTerrainQuadtreeLodDescriptor;
  private readonly material: Material | null;
  private readonly lodBuilder: TerrainQuadtreeLodBuilder;
  private readonly patchBuilder: TerrainQuadtreePatchMeshBuilder;
  private readonly seamResolver: TerrainQuadtreeLodSeamResolver;
  private readonly lodDescriptorResolver: TerrainQuadtreeLodDescriptorResolver;
  private readonly quadSizeCalculator: TerrainQuadSizeCalculator;
  private readonly sourceDensityWarningPolicy: TerrainSourceDensityWarningPolicy;
  private readonly leafMeshKeyFactory: TerrainLeafMeshKeyFactory;
  private readonly debugStyle: TerrainLodDebugStyle;
  private readonly debugFormatter: TerrainLodDebugFormatter;
  private readonly rootNode: TerrainQuadtreeNode;
  private readonly patchMeshes: Map<string, Mesh>;
  private readonly canonicalMeshMode: TerrainCanonicalMeshMode;
  private readonly originalCanonicalVisibility: number | null;
  private readonly originalCanonicalIsVisible: boolean | null;
  private readonly originalCanonicalIsPickable: boolean | null;
  private activeLeaves: readonly TerrainQuadtreeLeafSelection[];
  private debugLineMesh: LinesMesh | null;
  private debugLineSignature: string | null;
  private updateAccumulatorSeconds: number;
  private debugLogAccumulatorSeconds: number;
  private debugEnabled: boolean;
  private disposed: boolean;
  private warnedCameraFallback: boolean;
  private warnedLowSourceDensity: boolean;
  private lastAnchorSource: TerrainLodAnchor["source"] | null;
  private lastSelectionAnchorLocal: Vector3 | null;
  private lastSelectionDebugMode: TerrainQuadtreeLodDebugMode;
  private lastSelectionNearFullResolutionRadius: number | null;
  private activeNearFullResolutionRadius: number;
  private runtimeTuning: TerrainQuadtreeLodRuntimeTuning | null;

  public constructor(
    options: TerrainQuadtreeLodControllerOptions,
    lodBuilder = new TerrainQuadtreeLodBuilder(),
    patchBuilder = new TerrainQuadtreePatchMeshBuilder(),
    seamResolver = new TerrainQuadtreeLodSeamResolver(),
    lodDescriptorResolver = new TerrainQuadtreeLodDescriptorResolver(),
    quadSizeCalculator = new TerrainQuadSizeCalculator(),
    sourceDensityWarningPolicy = new TerrainSourceDensityWarningPolicy(),
    leafMeshKeyFactory = new TerrainLeafMeshKeyFactory(),
    debugStyle = new TerrainLodDebugStyle(),
    debugFormatter = new TerrainLodDebugFormatter()
  ) {
    this.scene = options.scene;
    this.terrainRoot = options.terrainRoot;
    this.canonicalPickMesh = options.canonicalPickMesh ?? null;
    this.terrainDescriptor = options.descriptor;
    this.heightField = options.heightField;
    this.material = options.material;
    this.lodDescriptorResolver = lodDescriptorResolver;
    this.lodDescriptor = this.lodDescriptorResolver.resolve(options.lod, options.heightField);
    this.lodBuilder = lodBuilder;
    this.patchBuilder = patchBuilder;
    this.seamResolver = seamResolver;
    this.quadSizeCalculator = quadSizeCalculator;
    this.sourceDensityWarningPolicy = sourceDensityWarningPolicy;
    this.leafMeshKeyFactory = leafMeshKeyFactory;
    this.debugStyle = debugStyle;
    this.debugFormatter = debugFormatter;
    this.rootNode = this.lodBuilder.buildRoot(this.heightField, this.lodDescriptor.maxDepth);
    this.patchMeshes = new Map();
    this.canonicalMeshMode = this.resolveCanonicalMeshMode(this.canonicalPickMesh);
    this.originalCanonicalVisibility = this.canonicalPickMesh?.visibility ?? null;
    this.originalCanonicalIsVisible = this.canonicalPickMesh?.isVisible ?? null;
    this.originalCanonicalIsPickable = this.canonicalPickMesh?.isPickable ?? null;
    this.activeLeaves = [];
    this.debugLineMesh = null;
    this.debugLineSignature = null;
    this.updateAccumulatorSeconds = this.lodDescriptor.updateIntervalSeconds;
    this.debugLogAccumulatorSeconds = 0;
    this.debugEnabled = false;
    this.disposed = false;
    this.warnedCameraFallback = false;
    this.warnedLowSourceDensity = false;
    this.lastAnchorSource = null;
    this.lastSelectionAnchorLocal = null;
    this.lastSelectionDebugMode = "off";
    this.lastSelectionNearFullResolutionRadius = null;
    this.activeNearFullResolutionRadius = this.lodDescriptor.nearFullResolutionRadius;
    this.runtimeTuning = null;
    this.warnLowSourceDensityIfNeeded();
  }

  /**
   * Обновляет набор видимых LOD patches относительно player/camera anchor.
   */
  public update(deltaSeconds: number, anchor: TerrainLodAnchor): void {
    if (this.disposed || !this.lodDescriptor.enabled) {
      return;
    }

    this.lastAnchorSource = anchor.source;
    if (anchor.source === "camera-fallback" && !this.warnedCameraFallback) {
      this.warnedCameraFallback = true;
      console.warn("[TerrainLOD] Player anchor unavailable; using active camera fallback.");
    }

    this.updateAccumulatorSeconds += Math.max(0, deltaSeconds);
    this.debugLogAccumulatorSeconds += Math.max(0, deltaSeconds);
    if (
      this.activeLeaves.length > 0 &&
      this.updateAccumulatorSeconds < this.lodDescriptor.updateIntervalSeconds
    ) {
      this.maybeLogDiagnostics(anchor);
      return;
    }

    const anchorLocal = this.toTerrainLocal(anchor.position);
    const debugMode = this.getActiveDebugMode();
    const selectionDescriptor = this.createSelectionLodDescriptor(anchorLocal, anchor.source);
    if (this.shouldSkipLodSelection(anchorLocal, debugMode, selectionDescriptor.nearFullResolutionRadius)) {
      this.updateAccumulatorSeconds = 0;
      this.maybeLogDiagnostics(anchor);
      return;
    }

    this.updateAccumulatorSeconds = 0;
    const leaves = this.lodBuilder.selectVisibleLeaves(
      this.rootNode,
      anchorLocal,
      selectionDescriptor,
      this.heightField,
      this.getHorizontalWorldScale()
    );
    this.applyVisibleLeaves(leaves);
    this.activeNearFullResolutionRadius = selectionDescriptor.nearFullResolutionRadius;
    this.hideCanonicalVisualSurface();
    this.syncDebugLineMeshes();
    this.lastSelectionAnchorLocal = anchorLocal.clone();
    this.lastSelectionDebugMode = debugMode;
    this.lastSelectionNearFullResolutionRadius = selectionDescriptor.nearFullResolutionRadius;
    this.maybeLogDiagnostics(anchor);
  }

  /**
   * Включает или выключает debug line meshes для активных leaves.
   */
  public setDebugEnabled(enabled: boolean): void {
    if (this.disposed || this.debugEnabled === enabled) {
      return;
    }

    this.debugEnabled = enabled;
    if (enabled) {
      this.syncDebugLineMeshes();
      this.logDiagnostics("[TerrainLOD] debug enabled");
      return;
    }

    this.disposeDebugLineMeshes();
    this.logDiagnostics("[TerrainLOD] debug disabled");
  }

  /**
   * Возвращает текущий debug mode.
   */
  public isDebugEnabled(): boolean {
    return this.debugEnabled;
  }

  public setRuntimeLodTuning(tuning: TerrainQuadtreeLodRuntimeTuning | null): void {
    const nextTuning = tuning ? this.normalizeRuntimeTuning(tuning) : null;
    if (this.areRuntimeTuningsEqual(this.runtimeTuning, nextTuning)) {
      return;
    }

    this.runtimeTuning = nextTuning;
    this.invalidateLodSelection();
  }

  public getRuntimeLodTuning(): TerrainQuadtreeLodRuntimeTuning {
    return this.runtimeTuning ?? this.createBaseRuntimeTuning();
  }

  /**
   * Собирает диагностику текущего LOD selection.
   */
  public getDiagnostics(): TerrainQuadtreeLodDiagnostics {
    const depthCounts = new Map<number, number>();
    const sampleStepCounts = new Map<number, number>();
    const buildSampleStepCounts = new Map<number, number>();
    const approxTrianglesBySampleStep = new Map<number, number>();
    const approxTrianglesByBuildSampleStep = new Map<number, number>();
    const horizontalWorldScale = this.getHorizontalWorldScale();
    const sourceQuadSize = this.quadSizeCalculator.compute(this.heightField) * horizontalWorldScale;
    const effectiveNearFullResolutionRadius = this.activeNearFullResolutionRadius;
    const patchStats = this.measurePatchMeshes();
    const canonicalStats = this.measureCanonicalMesh();
    let approxVisibleTriangles = 0;
    let seamAdjustedPatchCount = 0;
    let maxNeighborSampleStepRatio: number | null = null;
    let maxDepth = 0;
    let minLeafWorldSize: number | null = null;
    let maxLeafWorldSize: number | null = null;
    let minNearLeafWorldSize: number | null = null;
    let maxNearLeafWorldSize: number | null = null;
    let minDistanceToAnchor: number | null = null;
    let maxDistanceToAnchor: number | null = null;
    for (const leaf of this.activeLeaves) {
      const node = leaf.node;
      const buildSampleStep = leaf.buildSampleStep ?? leaf.sampleStep;
      const leafWorldSize = Math.max(node.sizeWorldX, node.sizeWorldZ) * horizontalWorldScale;
      const leafApproxTriangles = this.computeLeafApproxVisibleTriangles(leaf);
      approxVisibleTriangles += leafApproxTriangles;
      depthCounts.set(node.depth, (depthCounts.get(node.depth) ?? 0) + 1);
      sampleStepCounts.set(leaf.sampleStep, (sampleStepCounts.get(leaf.sampleStep) ?? 0) + 1);
      buildSampleStepCounts.set(buildSampleStep, (buildSampleStepCounts.get(buildSampleStep) ?? 0) + 1);
      approxTrianglesBySampleStep.set(
        leaf.sampleStep,
        (approxTrianglesBySampleStep.get(leaf.sampleStep) ?? 0) + leafApproxTriangles
      );
      approxTrianglesByBuildSampleStep.set(
        buildSampleStep,
        (approxTrianglesByBuildSampleStep.get(buildSampleStep) ?? 0) + leafApproxTriangles
      );
      if (buildSampleStep < leaf.sampleStep) {
        seamAdjustedPatchCount += 1;
      }
      maxNeighborSampleStepRatio = this.resolveMaxNeighborSampleStepRatio(leaf, maxNeighborSampleStepRatio);
      maxDepth = Math.max(maxDepth, node.depth);
      minLeafWorldSize = minLeafWorldSize === null ? leafWorldSize : Math.min(minLeafWorldSize, leafWorldSize);
      maxLeafWorldSize = maxLeafWorldSize === null ? leafWorldSize : Math.max(maxLeafWorldSize, leafWorldSize);
      if (leaf.distanceToAnchor <= effectiveNearFullResolutionRadius) {
        minNearLeafWorldSize =
          minNearLeafWorldSize === null ? leafWorldSize : Math.min(minNearLeafWorldSize, leafWorldSize);
        maxNearLeafWorldSize =
          maxNearLeafWorldSize === null ? leafWorldSize : Math.max(maxNearLeafWorldSize, leafWorldSize);
      }
      minDistanceToAnchor =
        minDistanceToAnchor === null ? leaf.distanceToAnchor : Math.min(minDistanceToAnchor, leaf.distanceToAnchor);
      maxDistanceToAnchor =
        maxDistanceToAnchor === null ? leaf.distanceToAnchor : Math.max(maxDistanceToAnchor, leaf.distanceToAnchor);
    }

    return {
      visibleLeafCount: this.activeLeaves.length,
      maxDepth,
      anchorSource: this.lastAnchorSource,
      depthCounts,
      sampleStepCounts,
      buildSampleStepCounts,
      approxTrianglesBySampleStep,
      approxTrianglesByBuildSampleStep,
      sourceQuadSize,
      sourceResolutionX: this.heightField.resolutionX,
      sourceResolutionZ: this.heightField.resolutionZ,
      sourceQuadCount: Math.max(0, (this.heightField.resolutionX - 1) * (this.heightField.resolutionZ - 1)),
      desiredNearPatchWorldSize: this.lodDescriptor.nearPatchWorldSize,
      effectiveNearFullResolutionRadius,
      activePatchMeshCount: patchStats.activeCount,
      cachedPatchMeshCount: patchStats.cachedCount,
      inactiveCachedPatchMeshCount: patchStats.inactiveCount,
      activePatchVertices: patchStats.activeVertices,
      activePatchTriangles: patchStats.activeTriangles,
      cachedPatchVertices: patchStats.cachedVertices,
      cachedPatchTriangles: patchStats.cachedTriangles,
      activeDebugLineMeshCount: this.getActiveDebugLineMeshCount(),
      approxVisibleTriangles,
      canonicalMeshMode: this.canonicalMeshMode,
      canonicalMeshVertexCount: canonicalStats.vertexCount,
      canonicalMeshTriangleCount: canonicalStats.triangleCount,
      seamAdjustedPatchCount,
      maxNeighborSampleStepRatio,
      debugMode: this.getActiveDebugMode(),
      minLeafWorldSize,
      maxLeafWorldSize,
      minNearLeafWorldSize,
      maxNearLeafWorldSize,
      minDistanceToAnchor,
      maxDistanceToAnchor
    };
  }

  /**
   * Освобождает созданные patch/debug meshes и восстанавливает optional pick mesh.
   */
  public dispose(): void {
    if (this.disposed) {
      return;
    }

    this.disposeDebugLineMeshes();
    for (const mesh of this.patchMeshes.values()) {
      if (!mesh.isDisposed()) {
        mesh.dispose(false, false);
      }
    }
    this.patchMeshes.clear();
    if (
      this.canonicalPickMesh &&
      !this.canonicalPickMesh.isDisposed() &&
      this.originalCanonicalVisibility !== null &&
      this.originalCanonicalIsVisible !== null &&
      this.originalCanonicalIsPickable !== null
    ) {
      this.canonicalPickMesh.visibility = this.originalCanonicalVisibility;
      this.canonicalPickMesh.isVisible = this.originalCanonicalIsVisible;
      this.canonicalPickMesh.isPickable = this.originalCanonicalIsPickable;
    }
    this.disposed = true;
  }

  /**
   * Синхронизирует кеш patch meshes с новым набором visible leaves.
   */
  private applyVisibleLeaves(leaves: readonly TerrainQuadtreeLeafSelection[]): void {
    const seamCompatibleLeaves = this.seamResolver.applySeamCompatibility(leaves);
    const nextLeafKeys = new Set(seamCompatibleLeaves.map((leaf) => this.leafMeshKeyFactory.make(leaf)));
    for (const [leafKey, mesh] of this.patchMeshes) {
      if (!nextLeafKeys.has(leafKey)) {
        if (!mesh.isDisposed()) {
          mesh.dispose(false, false);
        }
        this.patchMeshes.delete(leafKey);
      }
    }

    for (const leaf of seamCompatibleLeaves) {
      const mesh = this.getOrCreatePatchMesh(leaf);
      mesh.setEnabled(true);
    }

    this.activeLeaves = seamCompatibleLeaves;
  }

  /**
   * Возвращает cached patch mesh или создает новый.
   */
  private getOrCreatePatchMesh(leaf: TerrainQuadtreeLeafSelection): Mesh {
    const node = leaf.node;
    const leafKey = this.leafMeshKeyFactory.make(leaf);
    const cached = this.patchMeshes.get(leafKey);
    if (cached && !cached.isDisposed()) {
      return cached;
    }
    if (cached?.isDisposed()) {
      this.patchMeshes.delete(leafKey);
    }

    const mesh = this.patchBuilder.buildPatchMesh(this.scene, {
      node,
      heightField: this.heightField,
      descriptor: this.terrainDescriptor,
      sampleStep: leaf.sampleStep,
      logicalSampleStep: leaf.sampleStep,
      buildSampleStep: leaf.buildSampleStep ?? leaf.sampleStep,
      seamInfo: leaf.seamInfo,
      material: this.material,
      name: `terrain:${this.terrainDescriptor.id}:lod:node:${node.depth}:${node.ix0}:${node.iz0}:${node.ix1}:${node.iz1}:logical:${leaf.sampleStep}:build:${leaf.buildSampleStep ?? leaf.sampleStep}`
    });
    mesh.setParent(this.terrainRoot, false);
    this.patchMeshes.set(leafKey, mesh);
    return mesh;
  }

  /**
   * Скрывает optional pick surface из визуального рендера.
   */
  private hideCanonicalVisualSurface(): void {
    if (!this.canonicalPickMesh || this.canonicalPickMesh.isDisposed()) {
      return;
    }

    // Babylon excludes visibility=0 meshes from active rendering, while keeping isVisible=true preserves ray picking.
    this.canonicalPickMesh.visibility = 0;
    this.canonicalPickMesh.isVisible = true;
    this.canonicalPickMesh.isPickable = true;
  }

  private resolveCanonicalMeshMode(mesh: Mesh | null): TerrainCanonicalMeshMode {
    if (!mesh) {
      return "OFF";
    }

    const metadata = mesh.metadata as { terrainCanonicalMeshMode?: TerrainCanonicalMeshMode } | null | undefined;
    return metadata?.terrainCanonicalMeshMode ?? "FULL_RENDER_FALLBACK";
  }

  private measurePatchMeshes(): {
    readonly activeCount: number;
    readonly cachedCount: number;
    readonly inactiveCount: number;
    readonly activeVertices: number;
    readonly activeTriangles: number;
    readonly cachedVertices: number;
    readonly cachedTriangles: number;
  } {
    let activeCount = 0;
    let cachedCount = 0;
    let inactiveCount = 0;
    let activeVertices = 0;
    let activeTriangles = 0;
    let cachedVertices = 0;
    let cachedTriangles = 0;

    for (const mesh of this.patchMeshes.values()) {
      if (mesh.isDisposed()) {
        continue;
      }

      const vertices = mesh.getTotalVertices();
      const triangles = Math.floor(mesh.getTotalIndices() / 3);
      cachedCount += 1;
      cachedVertices += vertices;
      cachedTriangles += triangles;
      if (mesh.isEnabled()) {
        activeCount += 1;
        activeVertices += vertices;
        activeTriangles += triangles;
      } else {
        inactiveCount += 1;
      }
    }

    return {
      activeCount,
      cachedCount,
      inactiveCount,
      activeVertices,
      activeTriangles,
      cachedVertices,
      cachedTriangles
    };
  }

  private measureCanonicalMesh(): { readonly vertexCount: number; readonly triangleCount: number } {
    if (!this.canonicalPickMesh || this.canonicalPickMesh.isDisposed()) {
      return { vertexCount: 0, triangleCount: 0 };
    }

    return {
      vertexCount: this.canonicalPickMesh.getTotalVertices(),
      triangleCount: Math.floor(this.canonicalPickMesh.getTotalIndices() / 3)
    };
  }

  /**
   * Синхронизирует aggregated debug line mesh с active leaves.
   */
  private syncDebugLineMeshes(): void {
    const debugMode = this.getActiveDebugMode();
    if (debugMode === "off") {
      this.disposeDebugLineMeshes();
      return;
    }

    const signature = this.buildDebugLineSignature(debugMode);
    if (this.debugLineSignature === signature && this.debugLineMesh && !this.debugLineMesh.isDisposed()) {
      this.debugLineMesh.setEnabled(true);
      return;
    }

    this.disposeDebugLineMeshes();
    const lines: Vector3[][] = [];
    for (const leaf of this.activeLeaves) {
      lines.push(
        ...this.patchBuilder.buildDebugLines({
          node: leaf.node,
          heightField: this.heightField,
          sampleStep: leaf.sampleStep,
          name: `terrain:${this.terrainDescriptor.id}:lod:debug:aggregate:source`,
          mode: debugMode === "fullPatchGrid" ? "fullPatchGrid" : "patchBorders"
        })
      );
    }

    if (lines.length === 0) {
      return;
    }

    const lineMesh = MeshBuilder.CreateLineSystem(
      `terrain:${this.terrainDescriptor.id}:lod:debug:${debugMode}`,
      { lines },
      this.scene
    );
    lineMesh.color = this.debugStyle.resolveAggregateDebugColor();
    lineMesh.isPickable = false;
    lineMesh.checkCollisions = false;
    lineMesh.metadata = {
      ...(lineMesh.metadata as Record<string, unknown> | undefined),
      terrainVisualOnly: true,
      terrainDebugOnly: true,
      terrainSurfaceCanonical: false,
      terrainKind: "generated-lod-debug",
      terrainQuadtreeDebugMode: debugMode,
      terrainQuadtreeDebugDescription: debugMode === "fullPatchGrid"
        ? "logical decimated patch grid; stitched borders may add surface vertices"
        : "patch borders only",
      terrainDebugLeafCount: this.activeLeaves.length
    };
    lineMesh.setParent(this.terrainRoot, false);
    this.debugLineMesh = lineMesh;
    this.debugLineSignature = signature;
  }

  /**
   * Удаляет debug line mesh.
   */
  private disposeDebugLineMeshes(): void {
    if (this.debugLineMesh && !this.debugLineMesh.isDisposed()) {
      this.debugLineMesh.dispose(false);
    }
    this.debugLineMesh = null;
    this.debugLineSignature = null;
  }

  /**
   * Периодически пишет diagnostic log в debug mode.
   */
  private maybeLogDiagnostics(anchor: TerrainLodAnchor): void {
    if (!this.debugEnabled && !this.lodDescriptor.debug && this.lodDescriptor.debugMode === "off") {
      return;
    }

    if (this.debugLogAccumulatorSeconds < 1) {
      return;
    }

    this.debugLogAccumulatorSeconds = 0;
    this.logDiagnostics(
      `[TerrainLOD] anchor=${anchor.source} position=${this.debugFormatter.formatVector(anchor.position)}`
    );
  }

  /**
   * Формирует и пишет одну строку LOD diagnostics.
   */
  private logDiagnostics(prefix: string): void {
    const diagnostics = this.getDiagnostics();
    const depthSummary = Array.from(diagnostics.depthCounts.entries())
      .sort(([left], [right]) => left - right)
      .map(([depth, count]) => `${depth}:${count}`)
      .join(",");
    const sampleStepSummary = Array.from(diagnostics.sampleStepCounts.entries())
      .sort(([left], [right]) => left - right)
      .map(([sampleStep, count]) => `${sampleStep}:${count}`)
      .join(",");
    const buildStepSummary = Array.from(diagnostics.buildSampleStepCounts.entries())
      .sort(([left], [right]) => left - right)
      .map(([sampleStep, count]) => `${sampleStep}:${count}`)
      .join(",");
    const trianglesByStepSummary = Array.from(diagnostics.approxTrianglesByBuildSampleStep.entries())
      .sort(([left], [right]) => left - right)
      .map(([sampleStep, triangleCount]) => `${sampleStep}:${triangleCount}`)
      .join(",");
    const distanceRange =
      diagnostics.minDistanceToAnchor === null || diagnostics.maxDistanceToAnchor === null
        ? "n/a"
        : `${diagnostics.minDistanceToAnchor.toFixed(1)}..${diagnostics.maxDistanceToAnchor.toFixed(1)}`;
    const leafSizeRange =
      diagnostics.minLeafWorldSize === null || diagnostics.maxLeafWorldSize === null
        ? "n/a"
        : `${diagnostics.minLeafWorldSize.toFixed(2)}..${diagnostics.maxLeafWorldSize.toFixed(2)}`;
    const nearLeafSizeRange =
      diagnostics.minNearLeafWorldSize === null || diagnostics.maxNearLeafWorldSize === null
        ? "n/a"
        : `${diagnostics.minNearLeafWorldSize.toFixed(2)}..${diagnostics.maxNearLeafWorldSize.toFixed(2)}`;
    console.debug(
      `${prefix} leaves=${diagnostics.visibleLeafCount} maxDepth=${diagnostics.maxDepth} ` +
      `patchMeshes=${diagnostics.activePatchMeshCount}/${diagnostics.cachedPatchMeshCount} ` +
      `inactiveCached=${diagnostics.inactiveCachedPatchMeshCount} debugLineMeshes=${diagnostics.activeDebugLineMeshCount} ` +
      `approxTriangles=${diagnostics.approxVisibleTriangles} activePatchTriangles=${diagnostics.activePatchTriangles} ` +
      `canonical=${diagnostics.canonicalMeshMode}:${diagnostics.canonicalMeshVertexCount}/${diagnostics.canonicalMeshTriangleCount} ` +
      `debugMode=${diagnostics.debugMode} ` +
      `anchor=${diagnostics.anchorSource ?? "none"} depths=[${depthSummary}] ` +
      `samples=[${sampleStepSummary}] buildSamples=[${buildStepSummary}] ` +
      `seamAdjusted=${diagnostics.seamAdjustedPatchCount}/${diagnostics.visibleLeafCount} ` +
      `maxNeighborRatio=${diagnostics.maxNeighborSampleStepRatio?.toFixed(1) ?? "n/a"} ` +
      `trisByBuildStep=[${trianglesByStepSummary}] ` +
      `sourceQuad=${diagnostics.sourceQuadSize.toFixed(2)} ` +
      `nearRadius=${this.activeNearFullResolutionRadius.toFixed(1)} ` +
      `nearPatchWorldSize=${diagnostics.desiredNearPatchWorldSize.toFixed(2)} ` +
      `legacyNearPatchQuads=${this.lodDescriptor.nearFullResolutionPatchQuads} ` +
      `targetPatchQuads=${this.lodDescriptor.targetPatchQuads} ` +
      `leafSize=${leafSizeRange} nearLeafSize=${nearLeafSizeRange} distance=${distanceRange}`
    );
  }

  /**
   * Возвращает debug mode, реально применяемый сейчас.
   */
  private getActiveDebugMode(): TerrainQuadtreeLodDebugMode {
    if (this.debugEnabled) {
      return this.lodDescriptor.debugMode === "fullPatchGrid" ? "fullPatchGrid" : "patchBorders";
    }

    return this.lodDescriptor.debugMode;
  }

  /**
   * Проверяет, можно ли пропустить пересбор selection после малого движения anchor.
   */
  private shouldSkipLodSelection(
    anchorLocal: Vector3,
    debugMode: TerrainQuadtreeLodDebugMode,
    nextNearFullResolutionRadius: number
  ): boolean {
    if (this.activeLeaves.length === 0 || !this.lastSelectionAnchorLocal) {
      return false;
    }

    if (debugMode !== this.lastSelectionDebugMode) {
      return false;
    }

    if (
      this.lastSelectionNearFullResolutionRadius === null ||
      Math.abs(nextNearFullResolutionRadius - this.lastSelectionNearFullResolutionRadius) > 1
    ) {
      return false;
    }

    const threshold = Math.max(0, this.lodDescriptor.updateMovementThreshold);
    if (threshold <= 0) {
      return false;
    }

    const dx = anchorLocal.x - this.lastSelectionAnchorLocal.x;
    const dz = anchorLocal.z - this.lastSelectionAnchorLocal.z;
    return Math.sqrt((dx * dx) + (dz * dz)) < threshold;
  }

  private createSelectionLodDescriptor(
    anchorLocal: Vector3,
    anchorSource: TerrainLodAnchor["source"]
  ): ResolvedTerrainQuadtreeLodDescriptor {
    const runtimeDescriptor = this.createRuntimeTunedLodDescriptor();
    const nearFullResolutionRadius = this.resolveEffectiveNearFullResolutionRadius(
      anchorLocal,
      anchorSource,
      runtimeDescriptor
    );
    if (Math.abs(nearFullResolutionRadius - runtimeDescriptor.nearFullResolutionRadius) <= 1e-6) {
      return runtimeDescriptor;
    }

    return {
      ...runtimeDescriptor,
      nearFullResolutionRadius,
      lodRings: this.scaleLodRingsForNearRadius(runtimeDescriptor, nearFullResolutionRadius)
    };
  }

  private resolveEffectiveNearFullResolutionRadius(
    anchorLocal: Vector3,
    anchorSource: TerrainLodAnchor["source"],
    descriptor: ResolvedTerrainQuadtreeLodDescriptor
  ): number {
    const baseRadius = Math.max(0.0001, descriptor.nearFullResolutionRadius);
    if (anchorSource !== "player") {
      return baseRadius;
    }

    const camera = this.scene.activeCamera;
    if (!camera) {
      return baseRadius;
    }

    camera.getViewMatrix();
    const cameraLocal = this.toTerrainLocal(camera.globalPosition.clone());
    const dx = cameraLocal.x - anchorLocal.x;
    const dz = cameraLocal.z - anchorLocal.z;
    const cameraHorizontalDistance = Math.sqrt((dx * dx) + (dz * dz));
    const cameraGuardRadius = cameraHorizontalDistance * TerrainQuadtreeLodController.CAMERA_GUARD_RADIUS_MULTIPLIER;
    const maxGuardRadius = baseRadius * TerrainQuadtreeLodController.CAMERA_GUARD_MAX_NEAR_RADIUS_MULTIPLIER;
    return Math.max(baseRadius, Math.min(maxGuardRadius, cameraGuardRadius));
  }

  private scaleLodRingsForNearRadius(
    descriptor: ResolvedTerrainQuadtreeLodDescriptor,
    nearFullResolutionRadius: number
  ): ResolvedTerrainQuadtreeLodDescriptor["lodRings"] {
    const baseRadius = Math.max(0.0001, descriptor.nearFullResolutionRadius);
    const scale = Math.max(1, nearFullResolutionRadius / baseRadius);
    let previousDistance = 0;
    return descriptor.lodRings.map((ring) => {
      const distance = Math.max(
        nearFullResolutionRadius,
        ring.distance * scale,
        previousDistance + 0.0001
      );
      previousDistance = distance;
      return {
        ...ring,
        distance
      };
    });
  }

  private createRuntimeTunedLodDescriptor(): ResolvedTerrainQuadtreeLodDescriptor {
    if (!this.runtimeTuning) {
      return this.lodDescriptor;
    }

    const tuning = this.normalizeRuntimeTuning(this.runtimeTuning);
    let previousDistance = 0;
    const baseRings = this.lodDescriptor.lodRings.length > 0
      ? this.lodDescriptor.lodRings
      : [
          { distance: tuning.lod0Distance, maxSampleStep: 1 },
          { distance: tuning.lod1Distance, maxSampleStep: 2 }
        ];
    const lodRings = baseRings.map((ring, index) => {
      const requestedDistance =
        index === 0
          ? tuning.lod0Distance
          : index === 1
            ? tuning.lod1Distance
            : ring.distance;
      const distance = Math.max(requestedDistance, previousDistance + 0.0001);
      previousDistance = distance;
      return {
        ...ring,
        distance
      };
    });

    return {
      ...this.lodDescriptor,
      nearFullResolutionRadius: tuning.lod0Distance,
      lodRings
    };
  }

  private createBaseRuntimeTuning(): TerrainQuadtreeLodRuntimeTuning {
    return this.normalizeRuntimeTuning({
      lod0Distance: this.lodDescriptor.nearFullResolutionRadius,
      lod1Distance: this.lodDescriptor.lodRings[1]?.distance ?? (this.lodDescriptor.nearFullResolutionRadius * 2)
    });
  }

  private normalizeRuntimeTuning(tuning: TerrainQuadtreeLodRuntimeTuning): TerrainQuadtreeLodRuntimeTuning {
    const lod0Distance = Math.max(0.0001, tuning.lod0Distance);
    const lod1Distance = Math.max(lod0Distance + 0.0001, tuning.lod1Distance);
    return {
      lod0Distance,
      lod1Distance
    };
  }

  private areRuntimeTuningsEqual(
    left: TerrainQuadtreeLodRuntimeTuning | null,
    right: TerrainQuadtreeLodRuntimeTuning | null
  ): boolean {
    if (left === null || right === null) {
      return left === right;
    }

    return Math.abs(left.lod0Distance - right.lod0Distance) <= 1e-6 &&
      Math.abs(left.lod1Distance - right.lod1Distance) <= 1e-6;
  }

  private invalidateLodSelection(): void {
    this.lastSelectionAnchorLocal = null;
    this.lastSelectionNearFullResolutionRadius = null;
    this.updateAccumulatorSeconds = this.lodDescriptor.updateIntervalSeconds;
  }

  /**
   * Строит signature active leaves для дешевого cache aggregated debug lines.
   */
  private buildDebugLineSignature(debugMode: TerrainQuadtreeLodDebugMode): string {
    return [
      debugMode,
      ...this.activeLeaves
        .map((leaf) => this.leafMeshKeyFactory.make(leaf))
        .sort()
    ].join("|");
  }

  /**
   * Возвращает число активных debug line meshes.
   */
  private getActiveDebugLineMeshCount(): number {
    return this.debugLineMesh && !this.debugLineMesh.isDisposed() && this.debugLineMesh.isEnabled() ? 1 : 0;
  }

  private computeLeafApproxVisibleTriangles(leaf: TerrainQuadtreeLeafSelection): number {
    const buildSampleStep = Math.max(1, Math.round(leaf.buildSampleStep ?? leaf.sampleStep));
    const xSegments = Math.max(1, Math.ceil((leaf.node.ix1 - leaf.node.ix0) / buildSampleStep));
    const zSegments = Math.max(1, Math.ceil((leaf.node.iz1 - leaf.node.iz0) / buildSampleStep));
    const topTriangles = xSegments * zSegments * 2;
    return topTriangles;
  }

  private resolveMaxNeighborSampleStepRatio(
    leaf: TerrainQuadtreeLeafSelection,
    current: number | null
  ): number | null {
    let maxRatio = current;
    for (const stitchInfo of Object.values(leaf.seamInfo ?? {})) {
      if (!stitchInfo) {
        continue;
      }
      const ownSampleStep = Math.max(1, Math.round(stitchInfo.ownSampleStep));
      const neighborSampleStep = Math.max(1, Math.round(stitchInfo.neighborSampleStep));
      const ratio = Math.max(ownSampleStep, neighborSampleStep) / Math.min(ownSampleStep, neighborSampleStep);
      maxRatio = maxRatio === null ? ratio : Math.max(maxRatio, ratio);
    }
    return maxRatio;
  }

  /**
   * Переводит world anchor в локальные координаты terrain root.
   */
  private toTerrainLocal(position: Vector3): Vector3 {
    const inverseWorld = this.terrainRoot.computeWorldMatrix(true).clone().invert();
    return Vector3.TransformCoordinates(position, inverseWorld);
  }

  /**
   * Считает средний горизонтальный scale terrain root.
   */
  private getHorizontalWorldScale(): number {
    const scale = this.terrainRoot.absoluteScaling ?? Vector3.One();
    return (Math.abs(scale.x) + Math.abs(scale.z)) * 0.5;
  }

  /**
   * Предупреждает, если исходный heightfield слишком разреженный для near LOD.
   */
  private warnLowSourceDensityIfNeeded(): void {
    if (this.warnedLowSourceDensity) {
      return;
    }

    const diagnostic = this.sourceDensityWarningPolicy.diagnose(
      this.heightField,
      this.terrainDescriptor.terrainGridStep ?? 1,
      this.getHorizontalWorldScale()
    );
    if (!diagnostic.shouldWarn) {
      return;
    }

    this.warnedLowSourceDensity = true;
    console.warn(
      `[TerrainLOD] Low terrain source density: size=${this.heightField.width}x${this.heightField.depth} ` +
      `resolution=${this.heightField.resolutionX}x${this.heightField.resolutionZ} ` +
      `sourceQuadSize=${diagnostic.sourceQuadSize.toFixed(2)} ` +
      `desiredNearQuadSize=${diagnostic.desiredNearQuadSize.toFixed(2)} ` +
      `warningThreshold=${diagnostic.warningThreshold.toFixed(2)}. ` +
      "Near LOD can only match source heightfield, not add details."
    );
  }
}
