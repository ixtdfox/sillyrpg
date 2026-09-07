import type { AbstractMesh, Engine, Scene } from "@babylonjs/core";
import { EngineInstrumentation, SceneInstrumentation } from "@babylonjs/core/Instrumentation";
import type { RectGridRuntime } from "../../../grid/RectGridRuntime";
import type { SceneShadowRegistry } from "../../../lighting/SceneShadowRegistry";
import { parseBuildingVisibilityMesh } from "../../visibility/BuildingVisibilityMetadata";
import type { LocationManager } from "../../../world/location/LocationManager";
import {
  RUNTIME_PERFORMANCE_WARNING_THRESHOLDS,
  type RuntimePerformanceGeometryMetrics,
  type RuntimePerformanceGeometryBucketMetrics,
  type RuntimePerformanceBuildingLodMetrics,
  type RuntimePerformanceBuildingMeshCount,
  type RuntimePerformanceDrawGroupMetrics,
  type RuntimePerformanceInstrumentationMetrics,
  type RuntimePerformanceSceneMetrics,
  type RuntimePerformanceSnapshot,
  type RuntimePerformanceWarning
} from "./RuntimePerformanceTypes";

export interface RuntimePerformanceSamplerOptions {
  readonly engine: Engine;
  readonly scene: Scene;
  readonly locationManager: LocationManager;
  readonly gridRuntime: RectGridRuntime;
  readonly shadowRegistry: SceneShadowRegistry;
  readonly frameWindowSize?: number;
  readonly geometrySampleIntervalSeconds?: number;
}

/**
 * Samples Babylon and project-specific runtime counters for the performance panel.
 */
export class RuntimePerformanceSampler {
  private readonly engine: Engine;
  private readonly scene: Scene;
  private readonly locationManager: LocationManager;
  private readonly gridRuntime: RectGridRuntime;
  private readonly shadowRegistry: SceneShadowRegistry;
  private readonly frameWindow: number[];
  private readonly geometrySampleIntervalSeconds: number;
  private sceneInstrumentation: SceneInstrumentation | null;
  private engineInstrumentation: EngineInstrumentation | null;
  private frameWindowIndex: number;
  private frameWindowCount: number;
  private geometrySampleAccumulatorSeconds: number;
  private lastGeometryMetrics: RuntimePerformanceGeometryMetrics;
  private enabled: boolean;

  public constructor(options: RuntimePerformanceSamplerOptions) {
    this.engine = options.engine;
    this.scene = options.scene;
    this.locationManager = options.locationManager;
    this.gridRuntime = options.gridRuntime;
    this.shadowRegistry = options.shadowRegistry;
    this.frameWindow = new Array(Math.max(1, options.frameWindowSize ?? 120)).fill(0);
    this.geometrySampleIntervalSeconds = Math.max(0.1, options.geometrySampleIntervalSeconds ?? 1);
    this.sceneInstrumentation = null;
    this.engineInstrumentation = null;
    this.frameWindowIndex = 0;
    this.frameWindowCount = 0;
    this.geometrySampleAccumulatorSeconds = this.geometrySampleIntervalSeconds;
    this.lastGeometryMetrics = {
      vertexCount: 0,
      triangleCount: 0,
      renderedVertexCount: 0,
      renderedTriangleCount: 0,
      allocatedVertexCount: 0,
      allocatedTriangleCount: 0,
      hiddenPickOnlyTerrainVertexCount: 0,
      hiddenPickOnlyTerrainTriangleCount: 0,
      buckets: [],
      approximateDrawGroupCount: 0,
      drawGroups: [],
      cullingFlagWarningMeshCount: 0,
      cullingFlagWarningTriangleCount: 0,
      cullingFlagWarningMeshNames: []
    };
    this.enabled = false;
  }

  public setEnabled(isEnabled: boolean): void {
    if (this.enabled === isEnabled) {
      return;
    }

    this.enabled = isEnabled;
    if (isEnabled) {
      this.createInstrumentation();
      this.geometrySampleAccumulatorSeconds = this.geometrySampleIntervalSeconds;
      return;
    }

    this.disposeInstrumentation();
  }

  public recordFrame(frameMs: number = this.engine.getDeltaTime()): void {
    if (!this.enabled || !Number.isFinite(frameMs)) {
      return;
    }

    this.frameWindow[this.frameWindowIndex] = Math.max(0, frameMs);
    this.frameWindowIndex = (this.frameWindowIndex + 1) % this.frameWindow.length;
    this.frameWindowCount = Math.min(this.frameWindowCount + 1, this.frameWindow.length);
  }

  public sample(elapsedSeconds: number): RuntimePerformanceSnapshot {
    const shouldSampleGeometry = this.shouldSampleGeometry(elapsedSeconds);
    const sceneMetrics = this.sampleSceneMetrics(shouldSampleGeometry);
    const instrumentation = this.sampleInstrumentation();
    const terrainLod = this.locationManager.getTerrainLodDiagnostics();
    const shadows = this.shadowRegistry.getDiagnostics();
    const streaming = this.locationManager.getDistrictRuntimeDiagnostics();
    const debug = {
      rectGridEnabled: this.gridRuntime.getIsDebugEnabled(),
      terrainLodDebugEnabled: this.locationManager.getTerrainLodDebugEnabled()
    };
    const engineFps = this.engine.getFps();
    const frameStats = this.computeFrameWindowStats();
    const frame = {
      fps: engineFps,
      engineFps,
      frameMs: this.engine.getDeltaTime(),
      ...frameStats,
      renderWidth: this.engine.getRenderWidth(),
      renderHeight: this.engine.getRenderHeight(),
      hardwareScalingLevel: this.engine.getHardwareScalingLevel(),
      fpsCapDiagnostic: this.detectFpsCap(engineFps, this.engine.getDeltaTime(), frameStats.averageFrameMs, instrumentation)
    };
    const snapshotWithoutWarnings = {
      frame,
      scene: sceneMetrics,
      geometry: this.lastGeometryMetrics,
      instrumentation,
      terrainLod,
      shadows,
      streaming,
      debug,
      warnings: []
    };

    return {
      ...snapshotWithoutWarnings,
      warnings: this.createWarnings(snapshotWithoutWarnings)
    };
  }

  public dispose(): void {
    this.disposeInstrumentation();
  }

  private createInstrumentation(): void {
    if (!this.sceneInstrumentation) {
      this.sceneInstrumentation = new SceneInstrumentation(this.scene);
      this.sceneInstrumentation.captureActiveMeshesEvaluationTime = true;
      this.sceneInstrumentation.captureRenderTargetsRenderTime = true;
      this.sceneInstrumentation.captureParticlesRenderTime = true;
      this.sceneInstrumentation.captureSpritesRenderTime = true;
      this.sceneInstrumentation.capturePhysicsTime = true;
      this.sceneInstrumentation.captureAnimationsTime = true;
      this.sceneInstrumentation.captureFrameTime = true;
      this.sceneInstrumentation.captureRenderTime = true;
      this.sceneInstrumentation.captureCameraRenderTime = true;
    }

    if (!this.engineInstrumentation) {
      this.engineInstrumentation = new EngineInstrumentation(this.engine);
      this.engineInstrumentation.captureShaderCompilationTime = true;
    }
  }

  private disposeInstrumentation(): void {
    this.sceneInstrumentation?.dispose();
    this.engineInstrumentation?.dispose();
    this.sceneInstrumentation = null;
    this.engineInstrumentation = null;
  }

  private shouldSampleGeometry(elapsedSeconds: number): boolean {
    this.geometrySampleAccumulatorSeconds += Math.max(0, elapsedSeconds);
    if (this.geometrySampleAccumulatorSeconds < this.geometrySampleIntervalSeconds) {
      return false;
    }

    this.geometrySampleAccumulatorSeconds = 0;
    return true;
  }

  private sampleSceneMetrics(shouldSampleGeometry: boolean): RuntimePerformanceSceneMetrics {
    const activeMeshes = this.scene.getActiveMeshes();
    const activeMeshSet = this.createActiveMeshSet(activeMeshes);
    let renderableMeshCount = 0;
    let enabledMeshCount = 0;
    let visibleMeshCount = 0;
    let pickableMeshCount = 0;
    let thinInstanceBatchMeshCount = 0;
    let thinInstanceCount = 0;
    let lineMeshCount = 0;
    let renderedVertexCount = 0;
    let renderedTriangleCount = 0;
    let allocatedVertexCount = 0;
    let allocatedTriangleCount = 0;
    let hiddenPickOnlyTerrainVertexCount = 0;
    let hiddenPickOnlyTerrainTriangleCount = 0;
    const bucketAccumulators = new Map<string, RuntimePerformanceGeometryBucketAccumulator>();
    const drawGroupAccumulators = new Map<string, RuntimePerformanceDrawGroupAccumulator>();
    const enabledRenderMaterialIds = new Set<number>();
    const buildingLod = this.createEmptyBuildingLodMetrics();
    let cullingFlagWarningMeshCount = 0;
    let cullingFlagWarningTriangleCount = 0;
    const cullingFlagWarningMeshNames: string[] = [];

    for (const mesh of this.scene.meshes) {
      if (mesh.isDisposed()) {
        continue;
      }

      if (this.isLineMesh(mesh)) {
        lineMeshCount += 1;
      }

      const meshVertexCount = mesh.getTotalVertices();
      const hasRenderableGeometry = meshVertexCount > 0;
      const isEnabled = mesh.isEnabled();
      const isVisibleByFlags = isEnabled && mesh.isVisible && mesh.visibility > 0;
      const isRenderableByFlags = hasRenderableGeometry && isVisibleByFlags && this.isVisibleToActiveCamera(mesh);
      const isRenderedGeometry = isRenderableByFlags && activeMeshSet.has(mesh);
      const meshThinInstanceCount = (mesh as AbstractMesh & { readonly thinInstanceCount?: number }).thinInstanceCount ?? 0;
      if (meshThinInstanceCount > 0) {
        thinInstanceBatchMeshCount += 1;
        thinInstanceCount += meshThinInstanceCount;
      }
      if (hasRenderableGeometry) {
        renderableMeshCount += 1;
      }
      if (isEnabled) {
        enabledMeshCount += 1;
      }
      if (isVisibleByFlags) {
        visibleMeshCount += 1;
      }
      if (hasRenderableGeometry && isEnabled && mesh.isPickable) {
        pickableMeshCount += 1;
      }
      if (isRenderableByFlags) {
        for (const material of this.getEffectiveMaterials(mesh)) {
          enabledRenderMaterialIds.add(material.uniqueId);
        }
      }
      this.addBuildingLodMesh(buildingLod, mesh, isEnabled, isRenderableByFlags, isRenderedGeometry);

      if (shouldSampleGeometry) {
        const meshTriangleCount = Math.floor(mesh.getTotalIndices() / 3);
        allocatedVertexCount += meshVertexCount;
        allocatedTriangleCount += meshTriangleCount;
        this.addMeshToBucket(
          bucketAccumulators,
          this.classifyMeshBucket(mesh),
          mesh,
          isEnabled,
          isRenderableByFlags,
          isRenderedGeometry,
          meshVertexCount,
          meshTriangleCount,
          Math.max(1, meshThinInstanceCount)
        );
        if (isRenderedGeometry) {
          renderedVertexCount += meshVertexCount * Math.max(1, meshThinInstanceCount);
          renderedTriangleCount += meshTriangleCount * Math.max(1, meshThinInstanceCount);
          this.addMeshToDrawGroups(drawGroupAccumulators, mesh);
        } else if (this.isHiddenPickOnlyTerrain(mesh)) {
          hiddenPickOnlyTerrainVertexCount += meshVertexCount;
          hiddenPickOnlyTerrainTriangleCount += meshTriangleCount;
        }
        if (this.hasLargeCullingOverride(mesh, meshVertexCount, meshTriangleCount)) {
          cullingFlagWarningMeshCount += 1;
          cullingFlagWarningTriangleCount += meshTriangleCount;
          if (cullingFlagWarningMeshNames.length < 5) {
            cullingFlagWarningMeshNames.push(mesh.name);
          }
        }
      }
    }

    if (shouldSampleGeometry) {
      this.lastGeometryMetrics = {
        vertexCount: renderedVertexCount,
        triangleCount: renderedTriangleCount,
        renderedVertexCount,
        renderedTriangleCount,
        allocatedVertexCount,
        allocatedTriangleCount,
        hiddenPickOnlyTerrainVertexCount,
        hiddenPickOnlyTerrainTriangleCount,
        buckets: this.createSortedBuckets(bucketAccumulators),
        approximateDrawGroupCount: drawGroupAccumulators.size,
        drawGroups: this.createSortedDrawGroups(drawGroupAccumulators),
        cullingFlagWarningMeshCount,
        cullingFlagWarningTriangleCount,
        cullingFlagWarningMeshNames
      };
    }

    return {
      meshCount: this.scene.meshes.length,
      renderableMeshCount,
      enabledMeshCount,
      visibleMeshCount,
      pickableMeshCount,
      activeMeshCount: activeMeshes.length,
      thinInstanceBatchMeshCount,
      thinInstanceCount,
      lineMeshCount,
      materialCount: this.scene.materials.length,
      uniqueEnabledRenderMaterialCount: enabledRenderMaterialIds.size,
      textureCount: this.scene.textures.length,
      lightCount: this.scene.lights.length,
      cameraCount: this.scene.cameras.length,
      buildingLod
    };
  }

  private sampleInstrumentation(): RuntimePerformanceInstrumentationMetrics {
    const sceneInstrumentation = this.sceneInstrumentation;
    const engineInstrumentation = this.engineInstrumentation;

    return {
      drawCalls: sceneInstrumentation?.drawCallsCounter.current ?? null,
      activeMeshesEvaluationMs: sceneInstrumentation?.activeMeshesEvaluationTimeCounter.current ?? null,
      renderTargetsRenderMs: sceneInstrumentation?.renderTargetsRenderTimeCounter.current ?? null,
      particlesRenderMs: sceneInstrumentation?.particlesRenderTimeCounter.current ?? null,
      spritesRenderMs: sceneInstrumentation?.spritesRenderTimeCounter.current ?? null,
      physicsMs: sceneInstrumentation?.physicsTimeCounter.current ?? null,
      animationsMs: sceneInstrumentation?.animationsTimeCounter.current ?? null,
      frameMs: sceneInstrumentation?.frameTimeCounter.current ?? null,
      renderMs: sceneInstrumentation?.renderTimeCounter.current ?? null,
      cameraRenderMs: sceneInstrumentation?.cameraRenderTimeCounter.current ?? null,
      shaderCompilationMs: engineInstrumentation?.shaderCompilationTimeCounter.current ?? null,
      gpuFrameMs: null
    };
  }

  private computeFrameWindowStats(): Pick<RuntimePerformanceSnapshot["frame"], "averageFrameMs" | "minFrameMs" | "maxFrameMs"> {
    if (this.frameWindowCount === 0) {
      return {
        averageFrameMs: null,
        minFrameMs: null,
        maxFrameMs: null
      };
    }

    let total = 0;
    let min = Number.POSITIVE_INFINITY;
    let max = 0;
    for (let index = 0; index < this.frameWindowCount; index += 1) {
      const value = this.frameWindow[index];
      total += value;
      min = Math.min(min, value);
      max = Math.max(max, value);
    }

    return {
      averageFrameMs: total / this.frameWindowCount,
      minFrameMs: min,
      maxFrameMs: max
    };
  }

  private createWarnings(snapshot: Omit<RuntimePerformanceSnapshot, "warnings">): RuntimePerformanceWarning[] {
    const warnings: RuntimePerformanceWarning[] = [];
    const thresholds = RUNTIME_PERFORMANCE_WARNING_THRESHOLDS;

    if (snapshot.frame.fps > 0 && snapshot.frame.fps < thresholds.fpsWarning) {
      warnings.push({ severity: "warning", message: `FPS below ${thresholds.fpsWarning}` });
    }
    if ((snapshot.frame.averageFrameMs ?? 0) > thresholds.averageFrameMsWarning) {
      warnings.push({ severity: "warning", message: `Average frame over ${thresholds.averageFrameMsWarning} ms` });
    }
    if ((snapshot.instrumentation.drawCalls ?? 0) > thresholds.drawCallsWarning) {
      warnings.push({ severity: "warning", message: `Draw calls over ${thresholds.drawCallsWarning}` });
    }
    if (snapshot.scene.activeMeshCount > thresholds.activeMeshesWarning) {
      warnings.push({ severity: "warning", message: `Active meshes over ${thresholds.activeMeshesWarning}` });
    }
    if (snapshot.geometry.triangleCount > thresholds.totalTrianglesWarning) {
      warnings.push({ severity: "warning", message: "Triangles over 1M" });
    }
    if (snapshot.terrainLod.visibleLeafCount > thresholds.terrainVisibleLeavesCritical) {
      warnings.push({ severity: "critical", message: `LOD leaves over ${thresholds.terrainVisibleLeavesCritical}` });
    } else if (snapshot.terrainLod.visibleLeafCount > thresholds.terrainVisibleLeavesWarning) {
      warnings.push({ severity: "warning", message: `LOD leaves over ${thresholds.terrainVisibleLeavesWarning}` });
    }
    if (
      snapshot.terrainLod.visibleLeafCount > thresholds.terrainVisibleLeavesWarning &&
      snapshot.terrainLod.minNearLeafWorldSize !== null &&
      snapshot.terrainLod.minNearLeafWorldSize <= thresholds.tinyNearLeafWorldSize
    ) {
      warnings.push({ severity: "warning", message: "Near LOD patches are very small with many leaves" });
    }
    if (
      (snapshot.terrainLod.maxDistanceToAnchor ?? 0) > thresholds.farTerrainDistanceWarning &&
      this.resolveMaxSampleStep(snapshot.terrainLod.sampleStepCounts) < thresholds.farTerrainExpectedSampleStep
    ) {
      warnings.push({
        severity: "warning",
        message: `Far terrain visible but no sampleStep >= ${thresholds.farTerrainExpectedSampleStep}`
      });
    }
    if (snapshot.shadows.casterCount > thresholds.shadowCastersWarning) {
      warnings.push({ severity: "warning", message: `Shadow casters over ${thresholds.shadowCastersWarning}` });
    }
    if (snapshot.debug.rectGridEnabled || snapshot.debug.terrainLodDebugEnabled) {
      warnings.push({ severity: "warning", message: "Debug overlays ON; timings include line/grid overhead" });
    }
    if (snapshot.geometry.cullingFlagWarningMeshCount > 0) {
      warnings.push({
        severity: "warning",
        message: `Large meshes bypassing frustum culling: ${snapshot.geometry.cullingFlagWarningMeshNames.join(", ")}`
      });
    }

    return warnings;
  }

  private detectFpsCap(
    fps: number,
    frameMs: number,
    averageFrameMs: number | null,
    instrumentation: RuntimePerformanceInstrumentationMetrics
  ): string | null {
    const measuredFrameMs = averageFrameMs ?? frameMs;
    if (fps < 57 || fps > 63 || measuredFrameMs < 15.5 || measuredFrameMs > 17.8) {
      return null;
    }

    const measuredCosts = [
      instrumentation.renderMs,
      instrumentation.activeMeshesEvaluationMs,
      instrumentation.renderTargetsRenderMs,
      instrumentation.cameraRenderMs
    ].filter((value): value is number => value !== null && Number.isFinite(value));
    if (measuredCosts.length === 0) {
      return null;
    }

    return Math.max(...measuredCosts) <= 8 ? "likely display/VSync limited" : null;
  }

  private isLineMesh(mesh: AbstractMesh): boolean {
    return mesh.getClassName() === "LinesMesh";
  }

  private addMeshToBucket(
    buckets: Map<string, RuntimePerformanceGeometryBucketAccumulator>,
    bucket: string,
    mesh: AbstractMesh,
    isEnabled: boolean,
    isRenderableByFlags: boolean,
    isRenderedGeometry: boolean,
    vertexCount: number,
    triangleCount: number,
    renderInstanceCount: number
  ): void {
    let accumulator = buckets.get(bucket);
    if (!accumulator) {
      accumulator = {
        bucket,
        meshCount: 0,
        enabledMeshCount: 0,
        visibleMeshCount: 0,
        renderedVertexCount: 0,
        renderedTriangleCount: 0,
        allocatedVertexCount: 0,
        allocatedTriangleCount: 0
      };
      buckets.set(bucket, accumulator);
    }

    accumulator.meshCount += 1;
    accumulator.enabledMeshCount += isEnabled ? 1 : 0;
    accumulator.visibleMeshCount += isRenderableByFlags ? 1 : 0;
    accumulator.allocatedVertexCount += vertexCount;
    accumulator.allocatedTriangleCount += triangleCount;
    if (isRenderedGeometry) {
      accumulator.renderedVertexCount += vertexCount * renderInstanceCount;
      accumulator.renderedTriangleCount += triangleCount * renderInstanceCount;
    }
  }

  private createActiveMeshSet(activeMeshes: { readonly length: number; readonly data: readonly AbstractMesh[] }): Set<AbstractMesh> {
    const activeMeshSet = new Set<AbstractMesh>();
    for (let index = 0; index < activeMeshes.length; index += 1) {
      const mesh = activeMeshes.data[index];
      if (mesh && !mesh.isDisposed()) {
        activeMeshSet.add(mesh);
      }
    }
    return activeMeshSet;
  }

  private createSortedBuckets(
    buckets: ReadonlyMap<string, RuntimePerformanceGeometryBucketAccumulator>
  ): readonly RuntimePerformanceGeometryBucketMetrics[] {
    return [...buckets.values()]
      .sort((left, right) => {
        if (right.allocatedTriangleCount !== left.allocatedTriangleCount) {
          return right.allocatedTriangleCount - left.allocatedTriangleCount;
        }
        return left.bucket.localeCompare(right.bucket);
      })
      .map((bucket) => ({ ...bucket }));
  }

  private addMeshToDrawGroups(
    groups: Map<string, RuntimePerformanceDrawGroupAccumulator>,
    mesh: AbstractMesh
  ): void {
    const sourceMesh = (mesh as AbstractMesh & { readonly sourceMesh?: AbstractMesh }).sourceMesh ?? mesh;
    const geometry = (sourceMesh as AbstractMesh & { readonly geometry?: { readonly uniqueId?: number; readonly id?: string } }).geometry;
    const geometryId = geometry?.uniqueId ?? geometry?.id ?? sourceMesh.uniqueId;
    const building = parseBuildingVisibilityMesh(mesh);
    const visibilityRole = building?.role ?? "none";
    const lodRole = building?.lodRole ?? "none";
    const materials = this.getEffectiveMaterials(mesh);
    const drawMaterials = materials.length > 0
      ? materials.map((material) => ({ id: `${material.uniqueId}`, name: material.name || material.getClassName() }))
      : [{ id: "none", name: "none" }];
    const thinInstanceCount = (mesh as AbstractMesh & { readonly thinInstanceCount?: number }).thinInstanceCount ?? 0;
    const instanceCount = Math.max(1, thinInstanceCount);

    for (const material of drawMaterials) {
      const key = `${material.id}|${geometryId}|${visibilityRole}|${lodRole}`;
      let accumulator = groups.get(key);
      if (!accumulator) {
        accumulator = {
          material: material.name,
          geometry: sourceMesh.name,
          visibilityRole,
          lodRole,
          meshCount: 0,
          instanceCount: 0
        };
        groups.set(key, accumulator);
      }

      accumulator.meshCount += 1;
      accumulator.instanceCount += instanceCount;
    }
  }

  private createSortedDrawGroups(
    groups: ReadonlyMap<string, RuntimePerformanceDrawGroupAccumulator>
  ): readonly RuntimePerformanceDrawGroupMetrics[] {
    return [...groups.values()]
      .sort((left, right) => {
        if (right.instanceCount !== left.instanceCount) {
          return right.instanceCount - left.instanceCount;
        }
        return left.geometry.localeCompare(right.geometry);
      })
      .map((group) => ({ ...group }));
  }

  private getEffectiveMaterials(mesh: AbstractMesh) {
    const materials = new Map<number, NonNullable<AbstractMesh["material"]>>();
    for (const subMesh of mesh.subMeshes ?? []) {
      const material = subMesh.getMaterial();
      if (material) {
        materials.set(material.uniqueId, material);
      }
    }
    if (materials.size === 0 && mesh.material) {
      materials.set(mesh.material.uniqueId, mesh.material);
    }
    return [...materials.values()];
  }

  private isVisibleToActiveCamera(mesh: AbstractMesh): boolean {
    const camera = this.scene.activeCamera;
    return !camera || (mesh.layerMask & camera.layerMask) !== 0;
  }

  private createEmptyBuildingLodMetrics(): RuntimePerformanceBuildingLodMetrics {
    return {
      lod0: this.createEmptyBuildingMeshCount(),
      lod1: this.createEmptyBuildingMeshCount(),
      shadowProxy: this.createEmptyBuildingMeshCount()
    };
  }

  private createEmptyBuildingMeshCount(): RuntimePerformanceBuildingMeshCountAccumulator {
    return { total: 0, enabled: 0, renderable: 0, active: 0 };
  }

  private addBuildingLodMesh(
    metrics: RuntimePerformanceBuildingLodMetrics,
    mesh: AbstractMesh,
    isEnabled: boolean,
    isRenderable: boolean,
    isActive: boolean
  ): void {
    const building = parseBuildingVisibilityMesh(mesh);
    const rawMetadata = building?.rawMetadata;
    if (
      !building ||
      (rawMetadata?.sceneObjectType !== "building" && rawMetadata?.buildingVisibilityInstanceId === undefined)
    ) {
      return;
    }

    let bucket: RuntimePerformanceBuildingMeshCount | null = null;
    if (building.lodRole === "shadow_proxy") {
      bucket = metrics.shadowProxy;
    } else if (building.lodLevel === 0) {
      bucket = metrics.lod0;
    } else if (building.lodLevel === 1) {
      bucket = metrics.lod1;
    }
    if (!bucket) {
      return;
    }

    const mutableBucket = bucket as RuntimePerformanceBuildingMeshCountAccumulator;
    mutableBucket.total += 1;
    mutableBucket.enabled += isEnabled ? 1 : 0;
    mutableBucket.renderable += isRenderable ? 1 : 0;
    mutableBucket.active += isActive ? 1 : 0;
  }

  private classifyMeshBucket(mesh: AbstractMesh): string {
    const metadata = mesh.metadata as Record<string, unknown> | null | undefined;
    const terrainKind = typeof metadata?.terrainKind === "string" ? metadata.terrainKind : "";
    const name = mesh.name.toLowerCase();
    if (terrainKind === "generated-lod-visual") {
      return "terrain_lod_patch";
    }
    if (metadata?.terrainSurfaceCanonical === true || terrainKind === "generated") {
      return "terrain_canonical_pick";
    }
    if (metadata?.terrainDebugOnly === true || terrainKind.includes("terrain-grid") || name.includes("terrain") && name.includes("debug")) {
      return "terrain_debug_lines";
    }
    if (name.includes("rect-grid") || name.includes("grid-") || name.includes("grid_")) {
      return "grid_debug_lines";
    }
    if (
      metadata?.buildingVisibilityInstanceId !== undefined ||
      metadata?.sceneObjectType === "building" ||
      name.includes("building")
    ) {
      return "building";
    }
    if (metadata?.characterId !== undefined || metadata?.entityKind === "character" || name.includes("character")) {
      return "character";
    }
    if (metadata?.shadowHelper === true || name.includes("shadow-helper") || name.includes("shadowhelper")) {
      return "shadow_helper";
    }
    if (metadata?.editorTerrainPreview === true || metadata?.editorHelper === true || name.includes("editor-preview")) {
      return "editor_preview";
    }
    return "other";
  }

  private hasLargeCullingOverride(mesh: AbstractMesh, vertexCount: number, triangleCount: number): boolean {
    const cullingFlags = mesh as AbstractMesh & { readonly skipFrustumClipping?: boolean };
    if (!mesh.alwaysSelectAsActiveMesh && cullingFlags.skipFrustumClipping !== true) {
      return false;
    }

    if (this.isAllowedSmallCullingOverride(mesh)) {
      return false;
    }

    return triangleCount >= 512 || vertexCount >= 1000;
  }

  private isAllowedSmallCullingOverride(mesh: AbstractMesh): boolean {
    const metadata = mesh.metadata as Record<string, unknown> | null | undefined;
    if (metadata?.gameHelper === true || metadata?.editorTerrainPreview === true || metadata?.editorHelper === true) {
      return true;
    }

    return this.isLineMesh(mesh) && mesh.getTotalVertices() <= 256;
  }

  private isHiddenPickOnlyTerrain(mesh: AbstractMesh): boolean {
    const metadata = mesh.metadata as {
      generatedTerrainDescriptor?: unknown;
      terrainSurfaceCanonical?: unknown;
    } | null | undefined;

    return (
      metadata?.generatedTerrainDescriptor !== undefined &&
      metadata.terrainSurfaceCanonical === true
    );
  }

  private resolveMaxSampleStep(sampleStepCounts: ReadonlyMap<number, number>): number {
    let maxSampleStep = 0;
    for (const [sampleStep, count] of sampleStepCounts) {
      if (count > 0) {
        maxSampleStep = Math.max(maxSampleStep, sampleStep);
      }
    }
    return maxSampleStep;
  }
}

interface RuntimePerformanceGeometryBucketAccumulator {
  bucket: string;
  meshCount: number;
  enabledMeshCount: number;
  visibleMeshCount: number;
  renderedVertexCount: number;
  renderedTriangleCount: number;
  allocatedVertexCount: number;
  allocatedTriangleCount: number;
}

interface RuntimePerformanceDrawGroupAccumulator {
  material: string;
  geometry: string;
  visibilityRole: string;
  lodRole: string;
  meshCount: number;
  instanceCount: number;
}

interface RuntimePerformanceBuildingMeshCountAccumulator {
  total: number;
  enabled: number;
  renderable: number;
  active: number;
}
