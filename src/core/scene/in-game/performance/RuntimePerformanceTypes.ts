import type { ShadowDiagnostics } from "../../../lighting/SceneShadowRegistry";
import type { DistrictRuntimeDiagnostics, TerrainLodRuntimeDiagnostics } from "../../../world/location/LocationManager";

export interface RuntimePerformanceFrameMetrics {
  readonly fps: number;
  readonly engineFps: number;
  readonly frameMs: number;
  readonly averageFrameMs: number | null;
  readonly minFrameMs: number | null;
  readonly maxFrameMs: number | null;
  readonly renderWidth: number;
  readonly renderHeight: number;
  readonly hardwareScalingLevel: number;
  readonly fpsCapDiagnostic: string | null;
}

export interface RuntimePerformanceSceneMetrics {
  readonly meshCount: number;
  readonly renderableMeshCount: number;
  readonly enabledMeshCount: number;
  readonly visibleMeshCount: number;
  readonly pickableMeshCount: number;
  readonly activeMeshCount: number;
  readonly thinInstanceBatchMeshCount: number;
  readonly thinInstanceCount: number;
  readonly lineMeshCount: number;
  readonly materialCount: number;
  readonly uniqueEnabledRenderMaterialCount: number;
  readonly textureCount: number;
  readonly lightCount: number;
  readonly cameraCount: number;
  readonly buildingLod: RuntimePerformanceBuildingLodMetrics;
}

export interface RuntimePerformanceBuildingMeshCount {
  readonly total: number;
  readonly enabled: number;
  readonly renderable: number;
  readonly active: number;
}

export interface RuntimePerformanceBuildingLodMetrics {
  readonly lod0: RuntimePerformanceBuildingMeshCount;
  readonly lod1: RuntimePerformanceBuildingMeshCount;
  readonly shadowProxy: RuntimePerformanceBuildingMeshCount;
}

export interface RuntimePerformanceGeometryMetrics {
  readonly vertexCount: number;
  readonly triangleCount: number;
  readonly renderedVertexCount: number;
  readonly renderedTriangleCount: number;
  readonly allocatedVertexCount: number;
  readonly allocatedTriangleCount: number;
  readonly hiddenPickOnlyTerrainVertexCount: number;
  readonly hiddenPickOnlyTerrainTriangleCount: number;
  readonly buckets: readonly RuntimePerformanceGeometryBucketMetrics[];
  readonly approximateDrawGroupCount: number;
  readonly drawGroups: readonly RuntimePerformanceDrawGroupMetrics[];
  readonly cullingFlagWarningMeshCount: number;
  readonly cullingFlagWarningTriangleCount: number;
  readonly cullingFlagWarningMeshNames: readonly string[];
}

export interface RuntimePerformanceDrawGroupMetrics {
  readonly material: string;
  readonly geometry: string;
  readonly visibilityRole: string;
  readonly lodRole: string;
  readonly meshCount: number;
  readonly instanceCount: number;
}

export interface RuntimePerformanceGeometryBucketMetrics {
  readonly bucket: string;
  readonly meshCount: number;
  readonly enabledMeshCount: number;
  readonly visibleMeshCount: number;
  readonly renderedVertexCount: number;
  readonly renderedTriangleCount: number;
  readonly allocatedVertexCount: number;
  readonly allocatedTriangleCount: number;
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
