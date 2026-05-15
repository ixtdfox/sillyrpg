import type { AbstractMesh, Engine, Scene } from "@babylonjs/core";
import { EngineInstrumentation, SceneInstrumentation } from "@babylonjs/core/Instrumentation";
import type { RectGridRuntime } from "../../../grid/RectGridRuntime";
import type { SceneShadowRegistry } from "../../../lighting/SceneShadowRegistry";
import type { LocationManager } from "../../../world/location/LocationManager";
import {
  RUNTIME_PERFORMANCE_WARNING_THRESHOLDS,
  type RuntimePerformanceGeometryMetrics,
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
    this.lastGeometryMetrics = { vertexCount: 0, triangleCount: 0 };
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
    const frame = {
      fps: this.engine.getFps(),
      frameMs: this.engine.getDeltaTime(),
      ...this.computeFrameWindowStats()
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
    let enabledMeshCount = 0;
    let visibleMeshCount = 0;
    let lineMeshCount = 0;
    let vertexCount = 0;
    let triangleCount = 0;

    for (const mesh of this.scene.meshes) {
      if (this.isLineMesh(mesh)) {
        lineMeshCount += 1;
      }

      if (!mesh.isEnabled()) {
        continue;
      }

      enabledMeshCount += 1;
      if (mesh.isVisible && mesh.visibility > 0) {
        visibleMeshCount += 1;
      }

      if (shouldSampleGeometry) {
        vertexCount += mesh.getTotalVertices();
        triangleCount += Math.floor(mesh.getTotalIndices() / 3);
      }
    }

    if (shouldSampleGeometry) {
      this.lastGeometryMetrics = { vertexCount, triangleCount };
    }

    return {
      meshCount: this.scene.meshes.length,
      enabledMeshCount,
      visibleMeshCount,
      activeMeshCount: this.scene.getActiveMeshes().length,
      lineMeshCount,
      materialCount: this.scene.materials.length,
      textureCount: this.scene.textures.length,
      lightCount: this.scene.lights.length,
      cameraCount: this.scene.cameras.length
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
    if (snapshot.shadows.casterCount > thresholds.shadowCastersWarning) {
      warnings.push({ severity: "warning", message: `Shadow casters over ${thresholds.shadowCastersWarning}` });
    }
    if (snapshot.debug.rectGridEnabled || snapshot.debug.terrainLodDebugEnabled) {
      warnings.push({ severity: "warning", message: "Debug overlays ON; timings include line/grid overhead" });
    }

    return warnings;
  }

  private isLineMesh(mesh: AbstractMesh): boolean {
    return mesh.getClassName() === "LinesMesh";
  }
}
