import type { ShadowDiagnostics } from "../../../lighting/SceneShadowRegistry";
import type { DistrictRuntimeDiagnostics, TerrainLodRuntimeDiagnostics } from "../../../world/location/LocationManager";

export interface RuntimePerformanceFrameMetrics {
  readonly fps: number;
  readonly frameMs: number;
  readonly averageFrameMs: number | null;
  readonly minFrameMs: number | null;
  readonly maxFrameMs: number | null;
}

export interface RuntimePerformanceSceneMetrics {
  readonly meshCount: number;
  readonly enabledMeshCount: number;
  readonly visibleMeshCount: number;
  readonly activeMeshCount: number;
  readonly lineMeshCount: number;
  readonly materialCount: number;
  readonly textureCount: number;
  readonly lightCount: number;
  readonly cameraCount: number;
}

export interface RuntimePerformanceGeometryMetrics {
  readonly vertexCount: number;
  readonly triangleCount: number;
}

export interface RuntimePerformanceInstrumentationMetrics {
  readonly drawCalls: number | null;
  readonly activeMeshesEvaluationMs: number | null;
  readonly renderTargetsRenderMs: number | null;
  readonly particlesRenderMs: number | null;
  readonly spritesRenderMs: number | null;
  readonly physicsMs: number | null;
  readonly animationsMs: number | null;
  readonly frameMs: number | null;
  readonly renderMs: number | null;
  readonly cameraRenderMs: number | null;
  readonly shaderCompilationMs: number | null;
  readonly gpuFrameMs: number | null;
}

export type RuntimePerformanceWarningSeverity = "warning" | "critical";

export interface RuntimePerformanceWarning {
  readonly severity: RuntimePerformanceWarningSeverity;
  readonly message: string;
}

export interface RuntimeDebugOverlayDiagnostics {
  readonly rectGridEnabled: boolean;
  readonly terrainLodDebugEnabled: boolean;
}

export interface RuntimePerformanceSnapshot {
  readonly frame: RuntimePerformanceFrameMetrics;
  readonly scene: RuntimePerformanceSceneMetrics;
  readonly geometry: RuntimePerformanceGeometryMetrics;
  readonly instrumentation: RuntimePerformanceInstrumentationMetrics;
  readonly terrainLod: TerrainLodRuntimeDiagnostics;
  readonly shadows: ShadowDiagnostics;
  readonly streaming: DistrictRuntimeDiagnostics;
  readonly debug: RuntimeDebugOverlayDiagnostics;
  readonly warnings: readonly RuntimePerformanceWarning[];
}

export const RUNTIME_PERFORMANCE_WARNING_THRESHOLDS = {
  fpsWarning: 45,
  averageFrameMsWarning: 22,
  drawCallsWarning: 500,
  activeMeshesWarning: 1000,
  totalTrianglesWarning: 1_000_000,
  terrainVisibleLeavesWarning: 500,
  terrainVisibleLeavesCritical: 1000,
  farTerrainDistanceWarning: 160,
  farTerrainExpectedSampleStep: 8,
  shadowCastersWarning: 200,
  tinyNearLeafWorldSize: 1.25
} as const;
