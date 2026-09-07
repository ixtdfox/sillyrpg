import { AdvancedDynamicTexture, Control, Rectangle, TextBlock } from "@babylonjs/gui";
import type { RuntimePerformanceSampler } from "./RuntimePerformanceSampler";
import type { RuntimePerformanceSnapshot, RuntimePerformanceWarning } from "./RuntimePerformanceTypes";

export interface RuntimePerformancePanelUiOptions {
  readonly updateIntervalSeconds?: number;
}

/**
 * Compact Babylon GUI panel for runtime performance diagnostics.
 */
export class RuntimePerformancePanelUi {
  private readonly texture: AdvancedDynamicTexture;
  private readonly sampler: RuntimePerformanceSampler;
  private readonly root: Rectangle;
  private readonly textBlock: TextBlock;
  private readonly updateIntervalSeconds: number;
  private sampleAccumulatorSeconds: number;
  private elapsedSinceSampleSeconds: number;
  private isDisposed: boolean;

  public constructor(
    texture: AdvancedDynamicTexture,
    sampler: RuntimePerformanceSampler,
    options: RuntimePerformancePanelUiOptions = {}
  ) {
    this.texture = texture;
    this.sampler = sampler;
    this.updateIntervalSeconds = Math.max(0.1, options.updateIntervalSeconds ?? 0.5);
    this.sampleAccumulatorSeconds = this.updateIntervalSeconds;
    this.elapsedSinceSampleSeconds = 0;
    this.isDisposed = false;

    this.root = new Rectangle("runtime-performance-panel");
    this.root.width = "640px";
    this.root.height = "620px";
    this.root.thickness = 1;
    this.root.cornerRadius = 6;
    this.root.color = "#4B5563";
    this.root.background = "#111827E6";
    this.root.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_RIGHT;
    this.root.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
    this.root.left = "-12px";
    this.root.top = "72px";
    this.root.zIndex = 19;
    this.root.isVisible = false;
    this.root.isPointerBlocker = false;

    this.textBlock = new TextBlock("runtime-performance-panel-text", "");
    this.textBlock.color = "#E5E7EB";
    this.textBlock.fontSize = 13;
    this.textBlock.fontFamily = "monospace";
    this.textBlock.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    this.textBlock.textVerticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
    this.textBlock.paddingLeft = "12px";
    this.textBlock.paddingTop = "10px";
    this.textBlock.paddingRight = "12px";
    this.textBlock.paddingBottom = "10px";
    this.textBlock.lineSpacing = "2px";
    this.textBlock.resizeToFit = false;
    this.textBlock.textWrapping = false;
    this.root.addControl(this.textBlock);

    this.texture.addControl(this.root);
  }

  public toggle(): boolean {
    this.setVisible(!this.root.isVisible);
    return this.root.isVisible;
  }

  public setVisible(isVisible: boolean): void {
    if (this.isDisposed || this.root.isVisible === isVisible) {
      return;
    }

    this.root.isVisible = isVisible;
    this.sampler.setEnabled(isVisible);
    if (isVisible) {
      this.sampleAccumulatorSeconds = this.updateIntervalSeconds;
      this.elapsedSinceSampleSeconds = this.updateIntervalSeconds;
    }
  }

  public update(deltaSeconds: number): void {
    if (this.isDisposed || !this.root.isVisible) {
      return;
    }

    this.sampler.recordFrame(deltaSeconds * 1000);
    const safeDeltaSeconds = Math.max(0, deltaSeconds);
    this.sampleAccumulatorSeconds += safeDeltaSeconds;
    this.elapsedSinceSampleSeconds += safeDeltaSeconds;
    if (this.sampleAccumulatorSeconds < this.updateIntervalSeconds) {
      return;
    }

    this.sampleAccumulatorSeconds = 0;
    const snapshot = this.sampler.sample(this.elapsedSinceSampleSeconds);
    this.elapsedSinceSampleSeconds = 0;
    this.textBlock.text = this.formatSnapshot(snapshot);
  }

  public dispose(): void {
    if (this.isDisposed) {
      return;
    }

    this.sampler.dispose();
    this.texture.removeControl(this.root);
    this.root.dispose();
    this.isDisposed = true;
  }

  private formatSnapshot(snapshot: RuntimePerformanceSnapshot): string {
    const warnings = this.formatWarnings(snapshot.warnings);
    const terrainWarning = snapshot.terrainLod.visibleLeafCount > 500 ? " WARN" : "";
    const nearLeafWarning =
      snapshot.terrainLod.visibleLeafCount > 500 &&
      snapshot.terrainLod.minNearLeafWorldSize !== null &&
      snapshot.terrainLod.minNearLeafWorldSize <= 1.25
        ? " WARN"
        : "";
    const debugHint =
      snapshot.debug.rectGridEnabled || snapshot.debug.terrainLodDebugEnabled
        ? "\nDebug overlays ON: timings include grid/line overhead."
        : "";

    return [
      "PERF",
      `FPS: ${snapshot.frame.engineFps.toFixed(1)}   frame: ${this.formatMs(snapshot.frame.frameMs)}   avg: ${this.formatMs(snapshot.frame.averageFrameMs)} (${this.formatRange(snapshot.frame.minFrameMs, snapshot.frame.maxFrameMs, "ms")})`,
      `FPS cap: ${snapshot.frame.fpsCapDiagnostic ?? "not detected"}   render size: ${snapshot.frame.renderWidth}x${snapshot.frame.renderHeight}   hw scale: ${this.formatCompactFloat(snapshot.frame.hardwareScalingLevel)}`,
      `Draw calls: ${this.formatNullableNumber(snapshot.instrumentation.drawCalls)}   approx groups: ${snapshot.geometry.approximateDrawGroupCount}   active meshes: ${snapshot.scene.activeMeshCount}`,
      `Meshes: total ${snapshot.scene.meshCount}   renderable ${snapshot.scene.renderableMeshCount}   enabled ${snapshot.scene.enabledMeshCount}   visible ${snapshot.scene.visibleMeshCount}   pickable ${snapshot.scene.pickableMeshCount}   lines ${snapshot.scene.lineMeshCount}`,
      `Thin instances: batches ${snapshot.scene.thinInstanceBatchMeshCount}   instances ${snapshot.scene.thinInstanceCount}`,
      `Rendered: Verts ${this.formatNumber(snapshot.geometry.renderedVertexCount)}   Tris ${this.formatNumber(snapshot.geometry.renderedTriangleCount)}   Materials: ${snapshot.scene.materialCount} / enabled unique ${snapshot.scene.uniqueEnabledRenderMaterialCount}   Textures: ${snapshot.scene.textureCount}`,
      `Allocated: Verts ${this.formatNumber(snapshot.geometry.allocatedVertexCount)}   Tris ${this.formatNumber(snapshot.geometry.allocatedTriangleCount)}   Hidden/Pick terrain: Verts ${this.formatNumber(snapshot.geometry.hiddenPickOnlyTerrainVertexCount)}   Tris ${this.formatNumber(snapshot.geometry.hiddenPickOnlyTerrainTriangleCount)}`,
      `Render: scene ${this.formatMs(snapshot.instrumentation.frameMs)}   draw ${this.formatMs(snapshot.instrumentation.renderMs)}   active eval ${this.formatMs(snapshot.instrumentation.activeMeshesEvaluationMs)}   targets ${this.formatMs(snapshot.instrumentation.renderTargetsRenderMs)}`,
      `Buckets: ${this.formatGeometryBuckets(snapshot)}`,
      `Draw groups: ${this.formatDrawGroups(snapshot)}`,
      `Building LOD total/enabled/render/active: ${this.formatBuildingLod(snapshot)}`,
      "",
      "TERRAIN LOD",
      `source: ${this.formatTerrainSource(snapshot)}   source quads: ${this.formatNumber(snapshot.terrainLod.sourceQuadCount)}`,
      `visual LOD: leaves ${snapshot.terrainLod.visibleLeafCount}${terrainWarning}   visible tris ${this.formatNumber(snapshot.terrainLod.approxVisibleTriangles)}   lines: ${snapshot.terrainLod.activeDebugLineMeshCount}`,
      `canonical mesh: ${snapshot.terrainLod.canonicalMeshMode}   verts ${this.formatNumber(snapshot.terrainLod.canonicalMeshVertexCount)}   tris ${this.formatNumber(snapshot.terrainLod.canonicalMeshTriangleCount)}   hidden pick tris ${this.formatNumber(snapshot.terrainLod.hiddenPickOnlyTerrainTriangleCount)}`,
      `patch meshes: active ${snapshot.terrainLod.activePatchMeshCount}   inactive ${snapshot.terrainLod.inactivePatchMeshCount}   total ${snapshot.terrainLod.totalPatchMeshCount}   cache ${this.formatOnOff(snapshot.terrainLod.patchCacheEnabled)}`,
      `patch lifecycle: built ${snapshot.terrainLod.patchesBuiltLastUpdate}   reused ${snapshot.terrainLod.patchesReusedLastUpdate}   disabled ${snapshot.terrainLod.patchesDisabledLastUpdate}   disposed ${snapshot.terrainLod.patchesDisposedLastUpdate}`,
      `frustum: ${this.formatOnOff(snapshot.terrainLod.frustumCullingEnabled)}   tested ${snapshot.terrainLod.frustumTestedNodeCount}   rejected ${snapshot.terrainLod.frustumRejectedNodeCount}   near-kept ${snapshot.terrainLod.frustumKeptByNearAnchorCount}`,
      `sample steps: logical ${this.formatSampleStepMap(snapshot.terrainLod.sampleStepCounts)}`,
      `build steps:   actual  ${this.formatSampleStepMap(snapshot.terrainLod.buildSampleStepCounts)}`,
      `seams: adjusted patches ${snapshot.terrainLod.seamAdjustedPatchCount} / ${snapshot.terrainLod.visibleLeafCount}   max ratio: ${this.formatNullableFloat(snapshot.terrainLod.maxNeighborSampleStepRatio)}`,
      `tris by build: ${this.formatSampleStepMap(snapshot.terrainLod.approxTrianglesByBuildSampleStep, true)}`,
      `depths: ${this.formatMap(snapshot.terrainLod.depthCounts)}`,
      `leaf size: ${this.formatRange(snapshot.terrainLod.minLeafWorldSize, snapshot.terrainLod.maxLeafWorldSize)}   near: ${this.formatRange(snapshot.terrainLod.minNearLeafWorldSize, snapshot.terrainLod.maxNearLeafWorldSize)}${nearLeafWarning}`,
      `distance: ${this.formatRange(snapshot.terrainLod.minDistanceToAnchor, snapshot.terrainLod.maxDistanceToAnchor)}   debug mode: ${snapshot.terrainLod.debugMode}`,
      `source quad: ${this.formatRange(snapshot.terrainLod.sourceQuadSizeMin, snapshot.terrainLod.sourceQuadSizeMax)}   patch tris: active ${this.formatNumber(snapshot.terrainLod.activePatchTriangles)} inactive ${this.formatNumber(snapshot.terrainLod.inactivePatchTriangles)} total ${this.formatNumber(snapshot.terrainLod.totalPatchTriangles)}`,
      "",
      "SHADOWS",
      `enabled: ${this.formatYesNo(snapshot.shadows.enabled)}   type: ${snapshot.shadows.generatorKind}   generator: ${this.formatYesNo(snapshot.shadows.hasGenerator)}`,
      `casters: ${snapshot.shadows.casterCount}   receivers: ${snapshot.shadows.receiverCount}   top: ${this.formatShadowBatches(snapshot)}`,
      `building caster roles: ${this.formatShadowBuildingRoles(snapshot)}`,
      "",
      "STREAM / DEBUG",
      `chunks: ${snapshot.streaming.loadedChunkCount}   terrain meshes: ${snapshot.streaming.activeTerrainMeshCount}   object meshes: ${snapshot.streaming.activeSceneObjectMeshCount}`,
      `rect grid: ${this.formatOnOff(snapshot.debug.rectGridEnabled)}   LOD grid: ${this.formatOnOff(snapshot.debug.terrainLodDebugEnabled)}${debugHint}`,
      warnings
    ].filter((line) => line.length > 0).join("\n");
  }

  private formatWarnings(warnings: readonly RuntimePerformanceWarning[]): string {
    if (warnings.length === 0) {
      return "";
    }

    const visibleWarnings = warnings.slice(0, 3).map((warning) => {
      const prefix = warning.severity === "critical" ? "CRIT" : "WARN";
      return `${prefix}: ${warning.message}`;
    });
    if (warnings.length > visibleWarnings.length) {
      visibleWarnings.push(`WARN: +${warnings.length - visibleWarnings.length} more`);
    }
    return `\n${visibleWarnings.join("\n")}`;
  }

  private formatTerrainSource(snapshot: RuntimePerformanceSnapshot): string {
    const x = snapshot.terrainLod.sourceResolutionXMax;
    const z = snapshot.terrainLod.sourceResolutionZMax;
    if (x === null || z === null) {
      return "n/a";
    }

    return `${this.formatNumber(x)}x${this.formatNumber(z)} heightfield`;
  }

  private formatShadowBatches(snapshot: RuntimePerformanceSnapshot): string {
    if (snapshot.shadows.batches.length === 0) {
      return "n/a";
    }

    return [...snapshot.shadows.batches]
      .sort((left, right) => right.casterMeshes + right.receiverMeshes - (left.casterMeshes + left.receiverMeshes))
      .slice(0, 3)
      .map((batch) => `${batch.source}:${batch.casterMeshes}/${batch.receiverMeshes}`)
      .join(" ");
  }

  private formatGeometryBuckets(snapshot: RuntimePerformanceSnapshot): string {
    if (snapshot.geometry.buckets.length === 0) {
      return "n/a";
    }

    return snapshot.geometry.buckets
      .slice(0, 4)
      .map((bucket) =>
        `${bucket.bucket} ${this.formatNumber(bucket.renderedTriangleCount)}/${this.formatNumber(bucket.allocatedTriangleCount)}t`
      )
      .join("  ");
  }

  private formatDrawGroups(snapshot: RuntimePerformanceSnapshot): string {
    if (snapshot.geometry.drawGroups.length === 0) {
      return "n/a";
    }

    return snapshot.geometry.drawGroups
      .slice(0, 4)
      .map((group) => `${this.formatMeshLabel(group.geometry)}:${group.material}:${group.lodRole} ${group.meshCount}/${group.instanceCount}`)
      .join("  ");
  }

  private formatMeshLabel(name: string): string {
    const leafName = name.split(":").pop() ?? name;
    return leafName.length > 24 ? `${leafName.slice(0, 21)}...` : leafName;
  }

  private formatBuildingLod(snapshot: RuntimePerformanceSnapshot): string {
    const format = (bucket: RuntimePerformanceSnapshot["scene"]["buildingLod"]["lod0"]) =>
      `${bucket.total}/${bucket.enabled}/${bucket.renderable}/${bucket.active}`;
    return `L0 ${format(snapshot.scene.buildingLod.lod0)}   L1 ${format(snapshot.scene.buildingLod.lod1)}   proxy ${format(snapshot.scene.buildingLod.shadowProxy)}`;
  }

  private formatShadowBuildingRoles(snapshot: RuntimePerformanceSnapshot): string {
    if (snapshot.shadows.buildingRoles.length === 0) {
      return "n/a";
    }

    return snapshot.shadows.buildingRoles
      .filter((role) => role.casterMeshes > 0)
      .slice(0, 4)
      .map((role) => `${role.buildingId}:${role.lodRole}:${role.casterMeshes}`)
      .join("  ") || "none";
  }

  private formatMap(map: ReadonlyMap<number, number>): string {
    if (map.size === 0) {
      return "n/a";
    }

    return [...map.entries()]
      .sort(([left], [right]) => left - right)
      .slice(0, 8)
      .map(([key, value]) => `${key}:${value}`)
      .join(" ");
  }

  private formatSampleStepMap(map: ReadonlyMap<number, number>, compactValues = false): string {
    const expectedSteps = [1, 2, 4, 8, 16, 32];
    const keys = Array.from(new Set([
      ...expectedSteps,
      ...map.keys()
    ])).sort((left, right) => left - right);
    return keys
      .map((key) => `${key}:${compactValues ? this.formatNumber(map.get(key) ?? 0) : map.get(key) ?? 0}`)
      .join(" ");
  }

  private formatRange(min: number | null, max: number | null, unit = ""): string {
    if (min === null || max === null) {
      return "n/a";
    }

    const suffix = unit ? ` ${unit}` : "";
    return `${this.formatCompactFloat(min)}..${this.formatCompactFloat(max)}${suffix}`;
  }

  private formatMs(value: number | null): string {
    return value === null ? "n/a" : `${value.toFixed(1)} ms`;
  }

  private formatNullableNumber(value: number | null): string {
    return value === null ? "n/a" : this.formatNumber(value);
  }

  private formatNullableFloat(value: number | null): string {
    return value === null ? "n/a" : this.formatCompactFloat(value);
  }

  private formatNumber(value: number): string {
    const abs = Math.abs(value);
    if (abs >= 1_000_000) {
      return `${this.trimFixed(value / 1_000_000, abs >= 10_000_000 ? 1 : 2)}M`;
    }
    if (abs >= 1_000) {
      return `${this.trimFixed(value / 1_000, abs >= 100_000 ? 0 : 1)}k`;
    }
    return `${Math.round(value)}`;
  }

  private formatCompactFloat(value: number): string {
    return this.trimFixed(value, Math.abs(value) >= 100 ? 0 : 1);
  }

  private trimFixed(value: number, digits: number): string {
    return value.toFixed(digits).replace(/\.0+$/, "").replace(/(\.\d*[1-9])0+$/, "$1");
  }

  private formatYesNo(value: boolean): string {
    return value ? "yes" : "no";
  }

  private formatOnOff(value: boolean): string {
    return value ? "ON" : "OFF";
  }
}
