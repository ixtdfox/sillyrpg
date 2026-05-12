import type { SceneGeneratedTerrainDescriptor, SceneTerrainDescriptor } from "../../../core/world/scene/SceneDescriptor";
import { TerrainGenerator } from "../../../core/world/terrain/TerrainGenerator";
import { DEFAULT_TERRAIN_TOOL_SETTINGS, normalizeTerrainBrushSettings, normalizeTerrainToolSettings } from "../../../core/world/terrain/editing/TerrainBrush";
import { TerrainHeightEditor } from "../../../core/world/terrain/editing/TerrainHeightEditor";
import { TerrainHeightSampler } from "../../../core/world/terrain/editing/TerrainHeightSampler";
import { serializeTerrainHeightField } from "../../../core/world/terrain/editing/TerrainHeightSerialization";
import type { TerrainHeightField } from "../../../core/world/terrain/TerrainHeightField";
import type { TerrainBrushCenter, TerrainBrushSettings, TerrainEditToolId, TerrainToolSettings } from "../../../core/world/terrain/editing/TerrainBrushTypes";
import type { TerrainGeneratorPanelStats } from "../EditorTerrainTypes";
import type { EditorSceneLoader } from "../../EditorSceneLoader";
import { EditorTerrainBrushPreview } from "./EditorTerrainBrushPreview";
import { EditorTerrainPicking, type EditorTerrainPickResult } from "./EditorTerrainPicking";
import type { TerrainToolsPanelViewModel } from "./EditorTerrainToolState";
import type { EditorSceneDocument } from "../../state/EditorSceneDocument";
import type { Scene } from "@babylonjs/core";
import { EditorTerrainTextureLayerRegistry } from "./EditorTerrainTextureLayerRegistry";
import { EditorTerrainTexturePaintRuntime } from "./EditorTerrainTexturePaintRuntime";

interface EditorTerrainToolControllerCallbacks {
  readonly onChanged: () => void;
  readonly onTerrainApplied: (terrain: SceneTerrainDescriptor | null, message: string) => void;
}

interface ActiveBrushStroke {
  readonly pointerId: number;
  readonly flattenSampleHeight: number | null;
  lastTimestampMs: number;
}

export class EditorTerrainToolController {
  private readonly scene: Scene;
  private readonly canvas: HTMLCanvasElement;
  private readonly generator: TerrainGenerator;
  private readonly heightEditor: TerrainHeightEditor;
  private readonly heightSampler: TerrainHeightSampler;
  private readonly picking: EditorTerrainPicking;
  private readonly preview: EditorTerrainBrushPreview;
  private readonly texturePaintRuntime: EditorTerrainTexturePaintRuntime;
  private readonly callbacks: EditorTerrainToolControllerCallbacks;
  private document: EditorSceneDocument | null = null;
  private sceneLoader: EditorSceneLoader | null = null;
  private activeTab = false;
  private settings: TerrainToolSettings = DEFAULT_TERRAIN_TOOL_SETTINGS;
  private currentDescriptor: SceneGeneratedTerrainDescriptor | null = null;
  private workingField: TerrainHeightField | null = null;
  private visibleField: TerrainHeightField | null = null;
  private activeStroke: ActiveBrushStroke | null = null;
  private message = "";
  private applyInFlight = false;
  private applyQueued = false;

  public constructor(
    scene: Scene,
    canvas: HTMLCanvasElement,
    callbacks: EditorTerrainToolControllerCallbacks,
    generator = new TerrainGenerator(),
    heightEditor = new TerrainHeightEditor(),
    heightSampler = new TerrainHeightSampler(),
    picking = new EditorTerrainPicking()
  ) {
    this.scene = scene;
    this.canvas = canvas;
    this.callbacks = callbacks;
    this.generator = generator;
    this.heightEditor = heightEditor;
    this.heightSampler = heightSampler;
    this.picking = picking;
    this.preview = new EditorTerrainBrushPreview(scene);
    this.texturePaintRuntime = new EditorTerrainTexturePaintRuntime(scene, new EditorTerrainTextureLayerRegistry().getLayers());
  }

  public bind(document: EditorSceneDocument | null, sceneLoader: EditorSceneLoader | null): void {
    this.document = document;
    this.sceneLoader = sceneLoader;
    this.synchronizeFromTerrain(document?.descriptor.terrain ?? null, "");
  }

  public dispose(): void {
    this.preview.dispose();
    this.texturePaintRuntime.dispose();
  }

  public setTerrainTabActive(isActive: boolean): void {
    this.activeTab = isActive;
    if (!isActive && !this.activeStroke) {
      this.preview.hide();
    }
  }

  public synchronizeFromTerrain(terrain: SceneTerrainDescriptor | null | undefined, message = this.message): void {
    this.currentDescriptor = terrain?.kind === "generated" ? terrain : null;
    this.workingField = this.currentDescriptor ? this.generator.generate(this.currentDescriptor) : null;
    this.visibleField = this.workingField;
    this.activeStroke = null;
    this.message = message || (this.currentDescriptor ? "Hover over terrain to preview the brush. Click and drag to sculpt." : "Generate terrain first.");
    this.resetTexturePaintRuntime();
    if (!this.activeTab || !this.currentDescriptor) {
      this.preview.hide();
    }
    this.callbacks.onChanged();
  }

  public getViewModel(): TerrainToolsPanelViewModel {
    return {
      enabled: this.document !== null && this.sceneLoader !== null,
      hasTerrain: this.currentDescriptor !== null,
      activeTool: this.settings.tool,
      brush: this.settings.brush,
      targetHeight: this.settings.targetHeight,
      snapHeightStep: this.settings.snapHeightStep,
      edited: Boolean(this.currentDescriptor?.editedHeightMap),
      stats: this.computeStats(),
      textureLayers: this.texturePaintRuntime.getLayers().map((layer, index) => ({
        ...layer,
        paintable: index < this.texturePaintRuntime.getPaintableLayerCount()
      })),
      selectedTextureLayerId: this.texturePaintRuntime.getSelectedLayerId(),
      textureLayerLimitMessage: this.texturePaintRuntime.getLayerLimitMessage(),
      message: this.message
    };
  }

  public selectTool(tool: TerrainEditToolId): void {
    this.settings = normalizeTerrainToolSettings({
      ...this.settings,
      tool
    });
    this.message =
      tool === "paintTexture"
        ? this.texturePaintRuntime.getPaintableLayerCount() > 0
          ? this.texturePaintRuntime.getLayerLimitMessage() ||
            "Select a terrain texture, then click and drag to paint runtime texture weights."
          : this.texturePaintRuntime.getLayers().length > 0
            ? this.texturePaintRuntime.getLayerLimitMessage()
            : "No terrain texture files found."
        : tool === "flatten"
        ? "Flatten samples the terrain height on pointer-down, then levels toward it while you drag."
        : tool === "flattenToHeight"
          ? "Flatten To Height levels terrain toward the configured height."
          : "Hover over terrain to preview the brush. Click and drag to sculpt.";
    this.callbacks.onChanged();
  }

  public selectTextureLayer(layerId: string): void {
    const result = this.texturePaintRuntime.selectLayer(layerId);
    this.message = result.message;
    this.callbacks.onChanged();
  }

  public updateBrushSettings(settings: TerrainBrushSettings): void {
    this.settings = normalizeTerrainToolSettings({
      ...this.settings,
      brush: normalizeTerrainBrushSettings(settings)
    });
    this.callbacks.onChanged();
  }

  public updateTargetHeight(height: number): void {
    this.settings = normalizeTerrainToolSettings({
      ...this.settings,
      targetHeight: height
    });
    this.callbacks.onChanged();
  }

  public async flattenAll(): Promise<void> {
    if (!this.currentDescriptor || !this.visibleField) {
      return;
    }

    this.workingField = this.heightEditor.flattenAll(this.visibleField, 0);
    this.visibleField = this.heightEditor.quantizeHeights(this.workingField, this.settings.snapHeightStep);
    this.commitEditedTerrain("Flattened the entire terrain.");
    await this.requestVisualRefresh();
  }

  public async clearEdits(): Promise<void> {
    if (!this.currentDescriptor || !this.document || !this.sceneLoader) {
      return;
    }

    const descriptor = {
      ...this.currentDescriptor,
      editedHeightMap: undefined
    };
    this.document.setTerrain(descriptor);
    this.currentDescriptor = descriptor;
    this.workingField = this.generator.generate(descriptor);
    this.visibleField = this.workingField;
    this.message = "Cleared terrain edits and restored procedural terrain.";
    this.texturePaintRuntime.dispose();
    await this.sceneLoader.setTerrain(descriptor);
    this.resetTexturePaintRuntime();
    this.callbacks.onTerrainApplied(descriptor, this.message);
    this.callbacks.onChanged();
  }

  public handlePointerDown(event: PointerEvent): boolean {
    if (!this.activeTab || !this.currentDescriptor || !this.workingField || !this.sceneLoader) {
      return false;
    }

    const pick = this.pickTerrain(event.clientX, event.clientY);
    if (!pick) {
      return false;
    }

    const sampledHeight =
      this.settings.tool === "flatten"
        ? this.heightSampler.sampleNearest(this.visibleField ?? this.workingField, toBrushCenter(pick))
        : null;
    this.activeStroke = {
      pointerId: event.pointerId,
      flattenSampleHeight: sampledHeight,
      lastTimestampMs: performance.now()
    };
    this.preview.show(this.settings.brush.shape, this.settings.brush.radius, pick.pointWorld, resolveBrushPreviewColor(this.settings.tool));
    this.applyBrushAtPick(pick, 0.12);
    return true;
  }

  public handlePointerMove(event: PointerEvent): boolean {
    if (!this.activeTab || !this.currentDescriptor) {
      this.preview.hide();
      return false;
    }

    const pick = this.pickTerrain(event.clientX, event.clientY);
    if (!pick) {
      if (!this.activeStroke) {
        this.preview.hide();
      }
      return false;
    }

    this.preview.show(this.settings.brush.shape, this.settings.brush.radius, pick.pointWorld, resolveBrushPreviewColor(this.settings.tool));

    if (!this.activeStroke || this.activeStroke.pointerId !== event.pointerId) {
      return false;
    }

    const now = performance.now();
    const deltaTime = Math.max(1 / 120, Math.min(0.2, (now - this.activeStroke.lastTimestampMs) / 1000));
    this.activeStroke.lastTimestampMs = now;
    this.applyBrushAtPick(pick, deltaTime);
    return true;
  }

  public handlePointerUp(event: PointerEvent): boolean {
    if (!this.activeStroke || this.activeStroke.pointerId !== event.pointerId) {
      return false;
    }

    this.activeStroke = null;
    if (!this.activeTab) {
      this.preview.hide();
    }
    return true;
  }

  private pickTerrain(clientX: number, clientY: number): EditorTerrainPickResult | null {
    return this.sceneLoader
      ? this.picking.pick(
          this.scene,
          this.canvas,
          this.sceneLoader.getTerrainInstance(),
          clientX,
          clientY
        )
      : null;
  }

  private applyBrushAtPick(pick: EditorTerrainPickResult, deltaTime: number): void {
    if (!this.currentDescriptor || !this.document || !this.workingField) {
      return;
    }

    const workingSettings = normalizeTerrainToolSettings({
      ...this.settings,
      brush: {
        ...this.settings.brush,
        radius: this.settings.brush.radius * pick.localBrushRadius
      }
    });
    const center = toBrushCenter(pick);
    const sampledHeight = this.activeStroke?.flattenSampleHeight ?? workingSettings.targetHeight;

    if (workingSettings.tool === "paintTexture") {
      const result = this.texturePaintRuntime.paint(center, workingSettings.brush, deltaTime);
      if (result.changedTexelCount > 0) {
        this.message = "Painted terrain texture weights.";
        this.callbacks.onChanged();
      }
      return;
    }

    if (workingSettings.tool === "raise") {
      this.workingField = this.heightEditor.raise(this.workingField, center, workingSettings, deltaTime);
    } else if (workingSettings.tool === "lower") {
      this.workingField = this.heightEditor.lower(this.workingField, center, workingSettings, deltaTime);
    } else if (workingSettings.tool === "smooth") {
      this.workingField = this.heightEditor.smooth(this.workingField, center, workingSettings, deltaTime);
    } else if (workingSettings.tool === "flatten") {
      this.workingField = this.heightEditor.flattenToSample(
        this.workingField,
        center,
        workingSettings,
        sampledHeight,
        deltaTime
      );
    } else {
      this.workingField = this.heightEditor.flattenToHeight(
        this.workingField,
        center,
        workingSettings,
        workingSettings.targetHeight,
        deltaTime
      );
    }

    this.visibleField = this.heightEditor.quantizeHeights(this.workingField, workingSettings.snapHeightStep);
    this.commitEditedTerrain(`Applied ${labelForTool(workingSettings.tool)} brush.`);
    void this.requestVisualRefresh();
  }

  private commitEditedTerrain(message: string): void {
    if (!this.currentDescriptor || !this.document || !this.visibleField) {
      return;
    }

    const descriptor: SceneGeneratedTerrainDescriptor = {
      ...this.currentDescriptor,
      editedHeightMap: serializeTerrainHeightField(this.visibleField)
    };
    this.document.setTerrain(descriptor);
    this.currentDescriptor = descriptor;
    this.message = message;
    this.callbacks.onChanged();
  }

  private async requestVisualRefresh(): Promise<void> {
    if (!this.sceneLoader || !this.currentDescriptor) {
      return;
    }

    if (this.applyInFlight) {
      this.applyQueued = true;
      return;
    }

    this.applyInFlight = true;
    try {
      this.texturePaintRuntime.dispose();
      await this.sceneLoader.setTerrain(this.currentDescriptor);
      this.resetTexturePaintRuntime();
      this.callbacks.onTerrainApplied(this.currentDescriptor, this.message);
    } finally {
      this.applyInFlight = false;
      if (this.applyQueued) {
        this.applyQueued = false;
        await this.requestVisualRefresh();
      }
    }
  }

  private computeStats(): TerrainGeneratorPanelStats | null {
    if (!this.visibleField) {
      return null;
    }

    return {
      minHeight: this.visibleField.minHeight,
      maxHeight: this.visibleField.maxHeight,
      vertexCount: this.visibleField.getVertexCount(),
      triangleCount: this.visibleField.getTriangleCount()
    };
  }

  private resetTexturePaintRuntime(): void {
    this.texturePaintRuntime.resetForTerrain(this.sceneLoader?.getTerrainInstance() ?? null, this.visibleField ?? this.workingField);
  }
}

function toBrushCenter(pick: EditorTerrainPickResult): TerrainBrushCenter {
  return {
    x: pick.pointLocal.x,
    z: pick.pointLocal.z
  };
}

function resolveBrushPreviewColor(tool: TerrainEditToolId): string {
  if (tool === "raise") {
    return "#63E6BE";
  }
  if (tool === "lower") {
    return "#FF922B";
  }
  if (tool === "smooth") {
    return "#74C0FC";
  }
  if (tool === "paintTexture") {
    return "#B2F2BB";
  }
  return "#F7C948";
}

function labelForTool(tool: TerrainEditToolId): string {
  switch (tool) {
    case "raise":
      return "raise";
    case "lower":
      return "lower";
    case "smooth":
      return "smooth";
    case "flatten":
      return "flatten";
    case "flattenToHeight":
      return "flatten to height";
    case "paintTexture":
      return "paint texture";
  }
}
