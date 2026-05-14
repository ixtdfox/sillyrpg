import {
  Color3,
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
  type ResolvedTerrainQuadtreeLodDescriptor,
  type TerrainLodAnchor,
  type TerrainQuadtreeLeafSelection,
  type TerrainQuadtreeLodDescriptor,
  type TerrainQuadtreeLodDiagnostics,
  type TerrainQuadtreeNode
} from "./TerrainQuadtreeLodTypes";

/**
 * Dependency object для runtime TerrainQuadtreeLodController.
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
   * Возвращает контрастный цвет patch по depth/sample step.
   */
  public resolveDebugColor(leaf: TerrainQuadtreeLeafSelection): Color3 {
    const colors = [
      new Color3(0.12, 0.78, 1),
      new Color3(0.35, 1, 0.44),
      new Color3(1, 0.85, 0.2),
      new Color3(1, 0.48, 0.18),
      new Color3(1, 0.22, 0.56)
    ];
    return colors[(leaf.node.depth + Math.round(Math.log2(leaf.sampleStep))) % colors.length] ?? Color3.White();
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
 * Controller runtime quadtree LOD meshes.
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
  private readonly leafMeshKeyFactory: TerrainLeafMeshKeyFactory;
  private readonly debugStyle: TerrainLodDebugStyle;
  private readonly debugFormatter: TerrainLodDebugFormatter;
  private readonly rootNode: TerrainQuadtreeNode;
  private readonly patchMeshes: Map<string, Mesh>;
  private readonly debugLineMeshes: Map<string, LinesMesh>;
  private readonly originalCanonicalVisibility: number;
  private activeLeaves: readonly TerrainQuadtreeLeafSelection[];
  private updateAccumulatorSeconds: number;
  private debugLogAccumulatorSeconds: number;
  private debugEnabled: boolean;
  private disposed: boolean;
  private warnedCameraFallback: boolean;
  private warnedLowSourceDensity: boolean;
  private lastAnchorSource: TerrainLodAnchor["source"] | null;

  public constructor(
    options: TerrainQuadtreeLodControllerOptions,
    lodBuilder = new TerrainQuadtreeLodBuilder(),
    patchBuilder = new TerrainQuadtreePatchMeshBuilder(),
    lodDescriptorResolver = new TerrainQuadtreeLodDescriptorResolver(),
    quadSizeCalculator = new TerrainQuadSizeCalculator(),
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
    this.leafMeshKeyFactory = leafMeshKeyFactory;
    this.debugStyle = debugStyle;
    this.debugFormatter = debugFormatter;
    this.rootNode = this.lodBuilder.buildRoot(this.heightField, this.lodDescriptor.maxDepth);
    this.patchMeshes = new Map();
    this.debugLineMeshes = new Map();
    this.originalCanonicalVisibility = this.canonicalMesh.visibility;
    this.activeLeaves = [];
    this.updateAccumulatorSeconds = this.lodDescriptor.updateIntervalSeconds;
    this.debugLogAccumulatorSeconds = 0;
    this.debugEnabled = false;
    this.disposed = false;
    this.warnedCameraFallback = false;
    this.warnedLowSourceDensity = false;
    this.lastAnchorSource = null;
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

    this.updateAccumulatorSeconds = 0;
    const anchorLocal = this.toTerrainLocal(anchor.position);
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
    let maxDepth = 0;
    let minDistanceToAnchor: number | null = null;
    let maxDistanceToAnchor: number | null = null;
    for (const leaf of this.activeLeaves) {
      const node = leaf.node;
      depthCounts.set(node.depth, (depthCounts.get(node.depth) ?? 0) + 1);
      sampleStepCounts.set(leaf.sampleStep, (sampleStepCounts.get(leaf.sampleStep) ?? 0) + 1);
      maxDepth = Math.max(maxDepth, node.depth);
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
   * Скрывает визуальную canonical surface, оставляя ее pickable для gameplay/editor.
   */
  private hideCanonicalVisualSurface(): void {
    this.canonicalMesh.visibility = 0;
    this.canonicalMesh.isVisible = true;
    this.canonicalMesh.isPickable = true;
  }

  /**
   * Синхронизирует debug line meshes с active leaves.
   */
  private syncDebugLineMeshes(): void {
    if (!this.debugEnabled) {
      return;
    }

    const activeKeys = new Set(this.activeLeaves.map((leaf) => this.leafMeshKeyFactory.make(leaf)));
    for (const [leafKey, lineMesh] of this.debugLineMeshes) {
      if (!activeKeys.has(leafKey)) {
        lineMesh.dispose(false);
        this.debugLineMeshes.delete(leafKey);
      }
    }

    for (const leaf of this.activeLeaves) {
      const node = leaf.node;
      const leafKey = this.leafMeshKeyFactory.make(leaf);
      let lineMesh = this.debugLineMeshes.get(leafKey);
      if (!lineMesh || lineMesh.isDisposed()) {
        lineMesh = this.patchBuilder.buildDebugLineMesh(this.scene, {
          node,
          heightField: this.heightField,
          sampleStep: leaf.sampleStep,
          name: `terrain:${this.terrainDescriptor.id}:lod:debug:${node.depth}:${node.ix0}:${node.iz0}:${node.ix1}:${node.iz1}:step:${leaf.sampleStep}`
        });
        lineMesh.color = this.debugStyle.resolveDebugColor(leaf);
        lineMesh.setParent(this.terrainRoot, false);
        this.debugLineMeshes.set(leafKey, lineMesh);
      }
      lineMesh.setEnabled(true);
    }
  }

  /**
   * Удаляет все debug line meshes.
   */
  private disposeDebugLineMeshes(): void {
    for (const lineMesh of this.debugLineMeshes.values()) {
      if (!lineMesh.isDisposed()) {
        lineMesh.dispose(false);
      }
    }
    this.debugLineMeshes.clear();
  }

  /**
   * Периодически пишет diagnostic log в debug mode.
   */
  private maybeLogDiagnostics(anchor: TerrainLodAnchor): void {
    if (!this.debugEnabled && !this.lodDescriptor.debug) {
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
    const distanceRange =
      diagnostics.minDistanceToAnchor === null || diagnostics.maxDistanceToAnchor === null
        ? "n/a"
        : `${diagnostics.minDistanceToAnchor.toFixed(1)}..${diagnostics.maxDistanceToAnchor.toFixed(1)}`;
    console.debug(
      `${prefix} visibleLeaves=${diagnostics.visibleLeafCount} maxDepth=${diagnostics.maxDepth} ` +
      `anchor=${diagnostics.anchorSource ?? "none"} depths=[${depthSummary}] ` +
      `sampleSteps=[${sampleStepSummary}] skirtDepth=${this.lodDescriptor.skirtDepth.toFixed(2)} ` +
      `nearRadius=${this.lodDescriptor.nearFullResolutionRadius.toFixed(1)} ` +
      `nearPatchQuads=${this.lodDescriptor.nearFullResolutionPatchQuads} ` +
      `targetPatchQuads=${this.lodDescriptor.targetPatchQuads} distance=${distanceRange}`
    );
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

    const quadSize = this.quadSizeCalculator.compute(this.heightField);
    if (quadSize <= 4) {
      return;
    }

    this.warnedLowSourceDensity = true;
    console.warn(
      `[TerrainLOD] Low terrain source density: size=${this.heightField.width}x${this.heightField.depth} ` +
      `resolution=${this.heightField.resolutionX}x${this.heightField.resolutionZ} quadSize=${quadSize.toFixed(2)}. ` +
      "Near LOD can only match source heightfield, not add details."
    );
  }
}
