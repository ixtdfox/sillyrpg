import {
  Color3,
  MeshBuilder,
  Vector3,
  type LinesMesh,
  type Mesh,
  type Scene,
  type TransformNode
} from "@babylonjs/core";
import type { SceneGeneratedTerrainDescriptor } from "../../scene/SceneDescriptor";
import type { TerrainHeightField } from "../TerrainHeightField";
import { TerrainQuadtreeLodBuilder } from "./TerrainQuadtreeLodBuilder";
import { TerrainQuadtreePatchMeshBuilder } from "./TerrainQuadtreePatchMeshBuilder";
import {
  TerrainQuadSizeCalculator,
  TerrainQuadtreeLodDescriptorResolver,
  TerrainSourceDensityWarningPolicy,
  type ResolvedTerrainQuadtreeLodDescriptor,
  type TerrainLodAnchor,
  type TerrainQuadtreeLeafSelection,
  type TerrainQuadtreeLodDescriptor,
  type TerrainQuadtreeLodDebugMode,
  type TerrainQuadtreeLodDiagnostics,
  type TerrainQuadtreeNode
} from "./TerrainQuadtreeLodTypes";

/**
 * Dependency object для TerrainQuadtreeLodController.
 */
export interface TerrainQuadtreeLodControllerOptions {
  readonly scene: Scene;
  readonly terrainRoot: TransformNode;
  readonly canonicalMesh: Mesh;
  readonly descriptor: SceneGeneratedTerrainDescriptor;
  readonly heightField: TerrainHeightField;
  readonly lod?: TerrainQuadtreeLodDescriptor | null;
}

/**
 * Factory ключей meshes для выбранных quadtree leaves.
 */
class TerrainLeafMeshKeyFactory {
  /**
   * Создает стабильный ключ mesh по node id и sample step.
   */
  public make(leaf: TerrainQuadtreeLeafSelection): string {
    return `${leaf.node.id}:step:${leaf.sampleStep}`;
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
 * Управляет жизненным циклом patch meshes, переключает видимость canonical mesh
 * и обновляет набор visible leaves относительно player/camera anchor.
 */
export class TerrainQuadtreeLodController {
  private readonly scene: Scene;
  private readonly terrainRoot: TransformNode;
  private readonly canonicalMesh: Mesh;
  private readonly terrainDescriptor: SceneGeneratedTerrainDescriptor;
  private readonly heightField: TerrainHeightField;
  private readonly lodDescriptor: ResolvedTerrainQuadtreeLodDescriptor;
  private readonly lodBuilder: TerrainQuadtreeLodBuilder;
  private readonly patchBuilder: TerrainQuadtreePatchMeshBuilder;
  private readonly lodDescriptorResolver: TerrainQuadtreeLodDescriptorResolver;
  private readonly quadSizeCalculator: TerrainQuadSizeCalculator;
  private readonly sourceDensityWarningPolicy: TerrainSourceDensityWarningPolicy;
  private readonly leafMeshKeyFactory: TerrainLeafMeshKeyFactory;
  private readonly debugStyle: TerrainLodDebugStyle;
  private readonly debugFormatter: TerrainLodDebugFormatter;
  private readonly rootNode: TerrainQuadtreeNode;
  private readonly patchMeshes: Map<string, Mesh>;
  private readonly originalCanonicalVisibility: number;
  private readonly originalCanonicalIsVisible: boolean;
  private readonly originalCanonicalIsPickable: boolean;
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

  public constructor(
    options: TerrainQuadtreeLodControllerOptions,
    lodBuilder = new TerrainQuadtreeLodBuilder(),
    patchBuilder = new TerrainQuadtreePatchMeshBuilder(),
    lodDescriptorResolver = new TerrainQuadtreeLodDescriptorResolver(),
    quadSizeCalculator = new TerrainQuadSizeCalculator(),
    sourceDensityWarningPolicy = new TerrainSourceDensityWarningPolicy(),
    leafMeshKeyFactory = new TerrainLeafMeshKeyFactory(),
    debugStyle = new TerrainLodDebugStyle(),
    debugFormatter = new TerrainLodDebugFormatter()
  ) {
    this.scene = options.scene;
    this.terrainRoot = options.terrainRoot;
    this.canonicalMesh = options.canonicalMesh;
    this.terrainDescriptor = options.descriptor;
    this.heightField = options.heightField;
    this.lodDescriptorResolver = lodDescriptorResolver;
    this.lodDescriptor = this.lodDescriptorResolver.resolve(options.lod, options.heightField);
    this.lodBuilder = lodBuilder;
    this.patchBuilder = patchBuilder;
    this.quadSizeCalculator = quadSizeCalculator;
    this.sourceDensityWarningPolicy = sourceDensityWarningPolicy;
    this.leafMeshKeyFactory = leafMeshKeyFactory;
    this.debugStyle = debugStyle;
    this.debugFormatter = debugFormatter;
    this.rootNode = this.lodBuilder.buildRoot(this.heightField, this.lodDescriptor.maxDepth);
    this.patchMeshes = new Map();
    this.originalCanonicalVisibility = this.canonicalMesh.visibility;
    this.originalCanonicalIsVisible = this.canonicalMesh.isVisible;
    this.originalCanonicalIsPickable = this.canonicalMesh.isPickable;
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
    if (this.shouldSkipLodSelection(anchorLocal, debugMode)) {
      this.updateAccumulatorSeconds = 0;
      this.maybeLogDiagnostics(anchor);
      return;
    }

    this.updateAccumulatorSeconds = 0;
    const leaves = this.lodBuilder.selectVisibleLeaves(
      this.rootNode,
      anchorLocal,
      this.lodDescriptor,
      this.heightField,
      this.getHorizontalWorldScale()
    );
    this.applyVisibleLeaves(leaves);
    this.hideCanonicalVisualSurface();
    this.syncDebugLineMeshes();
    this.lastSelectionAnchorLocal = anchorLocal.clone();
    this.lastSelectionDebugMode = debugMode;
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

  /**
   * Собирает диагностику текущего LOD selection.
   */
  public getDiagnostics(): TerrainQuadtreeLodDiagnostics {
    const depthCounts = new Map<number, number>();
    const sampleStepCounts = new Map<number, number>();
    const approxTrianglesBySampleStep = new Map<number, number>();
    const horizontalWorldScale = this.getHorizontalWorldScale();
    const sourceQuadSize = this.quadSizeCalculator.compute(this.heightField) * horizontalWorldScale;
    let approxVisibleTriangles = 0;
    let maxDepth = 0;
    let minLeafWorldSize: number | null = null;
    let maxLeafWorldSize: number | null = null;
    let minNearLeafWorldSize: number | null = null;
    let maxNearLeafWorldSize: number | null = null;
    let minDistanceToAnchor: number | null = null;
    let maxDistanceToAnchor: number | null = null;
    for (const leaf of this.activeLeaves) {
      const node = leaf.node;
      const leafWorldSize = Math.max(node.sizeWorldX, node.sizeWorldZ) * horizontalWorldScale;
      const leafApproxTriangles = this.computeLeafApproxVisibleTriangles(leaf);
      approxVisibleTriangles += leafApproxTriangles;
      depthCounts.set(node.depth, (depthCounts.get(node.depth) ?? 0) + 1);
      sampleStepCounts.set(leaf.sampleStep, (sampleStepCounts.get(leaf.sampleStep) ?? 0) + 1);
      approxTrianglesBySampleStep.set(
        leaf.sampleStep,
        (approxTrianglesBySampleStep.get(leaf.sampleStep) ?? 0) + leafApproxTriangles
      );
      maxDepth = Math.max(maxDepth, node.depth);
      minLeafWorldSize = minLeafWorldSize === null ? leafWorldSize : Math.min(minLeafWorldSize, leafWorldSize);
      maxLeafWorldSize = maxLeafWorldSize === null ? leafWorldSize : Math.max(maxLeafWorldSize, leafWorldSize);
      if (leaf.distanceToAnchor <= this.lodDescriptor.nearFullResolutionRadius) {
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
      approxTrianglesBySampleStep,
      sourceQuadSize,
      desiredNearPatchWorldSize: this.lodDescriptor.nearPatchWorldSize,
      activePatchMeshCount: this.activeLeaves.length,
      activeDebugLineMeshCount: this.getActiveDebugLineMeshCount(),
      approxVisibleTriangles,
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
   * Освобождает созданные patch/debug meshes и восстанавливает canonical mesh.
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
    if (!this.canonicalMesh.isDisposed()) {
      this.canonicalMesh.visibility = this.originalCanonicalVisibility;
      this.canonicalMesh.isVisible = this.originalCanonicalIsVisible;
      this.canonicalMesh.isPickable = this.originalCanonicalIsPickable;
    }
    this.disposed = true;
  }

  /**
   * Синхронизирует кеш patch meshes с новым набором visible leaves.
   */
  private applyVisibleLeaves(leaves: readonly TerrainQuadtreeLeafSelection[]): void {
    const nextLeafKeys = new Set(leaves.map((leaf) => this.leafMeshKeyFactory.make(leaf)));
    for (const [leafKey, mesh] of this.patchMeshes) {
      if (!nextLeafKeys.has(leafKey)) {
        mesh.setEnabled(false);
      }
    }

    for (const leaf of leaves) {
      const mesh = this.getOrCreatePatchMesh(leaf);
      mesh.setEnabled(true);
    }

    this.activeLeaves = leaves;
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

    const mesh = this.patchBuilder.buildPatchMesh(this.scene, {
      node,
      heightField: this.heightField,
      descriptor: this.terrainDescriptor,
      sampleStep: leaf.sampleStep,
      skirtDepth: this.lodDescriptor.skirtDepth,
      material: this.canonicalMesh.material,
      name: `terrain:${this.terrainDescriptor.id}:lod:node:${node.depth}:${node.ix0}:${node.iz0}:${node.ix1}:${node.iz1}:step:${leaf.sampleStep}`
    });
    mesh.setParent(this.terrainRoot, false);
    this.patchMeshes.set(leafKey, mesh);
    return mesh;
  }

  /**
   * Скрывает визуальную canonical surface, оставляя ее pickable для gameplay.
   */
  private hideCanonicalVisualSurface(): void {
    // Babylon excludes visibility=0 meshes from active rendering, while keeping isVisible=true preserves ray picking.
    this.canonicalMesh.visibility = 0;
    this.canonicalMesh.isVisible = true;
    this.canonicalMesh.isPickable = true;
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
      terrainQuadtreeDebugDescription: debugMode === "fullPatchGrid" ? "actual decimated geometry grid" : "patch borders only",
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
    const trianglesByStepSummary = Array.from(diagnostics.approxTrianglesBySampleStep.entries())
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
      `patchMeshes=${diagnostics.activePatchMeshCount} debugLineMeshes=${diagnostics.activeDebugLineMeshCount} ` +
      `approxTriangles=${diagnostics.approxVisibleTriangles} debugMode=${diagnostics.debugMode} ` +
      `anchor=${diagnostics.anchorSource ?? "none"} depths=[${depthSummary}] ` +
      `samples=[${sampleStepSummary}] trisByStep=[${trianglesByStepSummary}] ` +
      `skirtDepth=${this.lodDescriptor.skirtDepth.toFixed(2)} ` +
      `sourceQuad=${diagnostics.sourceQuadSize.toFixed(2)} ` +
      `nearRadius=${this.lodDescriptor.nearFullResolutionRadius.toFixed(1)} ` +
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
  private shouldSkipLodSelection(anchorLocal: Vector3, debugMode: TerrainQuadtreeLodDebugMode): boolean {
    if (this.activeLeaves.length === 0 || !this.lastSelectionAnchorLocal) {
      return false;
    }

    if (debugMode !== this.lastSelectionDebugMode) {
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
    const xSegments = Math.max(1, Math.ceil((leaf.node.ix1 - leaf.node.ix0) / leaf.sampleStep));
    const zSegments = Math.max(1, Math.ceil((leaf.node.iz1 - leaf.node.iz0) / leaf.sampleStep));
    const topTriangles = xSegments * zSegments * 2;
    const skirtTriangles = this.lodDescriptor.skirtDepth > 0 ? (xSegments + zSegments) * 4 : 0;
    return topTriangles + skirtTriangles;
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
