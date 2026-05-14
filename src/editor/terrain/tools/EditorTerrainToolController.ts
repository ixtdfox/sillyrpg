import {
  cloneSceneDescriptor,
  type SceneDescriptor,
  type SceneGeneratedTerrainDescriptor,
  type SceneTerrainDescriptor
} from "../../../core/world/scene/SceneDescriptor";
import { TerrainGenerator } from "../../../core/world/terrain/TerrainGenerator";
import { DEFAULT_TERRAIN_TOOL_SETTINGS, TerrainBrushSettingsNormalizer } from "../../../core/world/terrain/editing/TerrainBrush";
import { TerrainHeightEditor } from "../../../core/world/terrain/editing/TerrainHeightEditor";
import { TerrainHeightSampler } from "../../../core/world/terrain/editing/TerrainHeightSampler";
import { TerrainHeightFieldSerializer } from "../../../core/world/terrain/editing/TerrainHeightSerialization";
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
import { EditorTerrainTextureBakeService, resolveTerrainBakeResolution } from "./EditorTerrainTextureBakeService";
import { EditorTerrainTextureMapPersistence } from "./EditorTerrainTextureMapPersistence";
import { EditorTerrainTexturePaintRuntime } from "./EditorTerrainTexturePaintRuntime";
import { resolveTexturePaintStrokeAction, type TexturePaintRawLoadState } from "./EditorTerrainTexturePaintRecovery";
import type { EditorSceneSaveAsset } from "../../state/EditorScenePersistence";

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
  private readonly brushSettingsNormalizer: TerrainBrushSettingsNormalizer;
  private readonly heightFieldSerializer: TerrainHeightFieldSerializer;
  private readonly picking: EditorTerrainPicking;
  private readonly preview: EditorTerrainBrushPreview;
  private readonly texturePaintRuntime: EditorTerrainTexturePaintRuntime;
  private readonly textureBakeService: EditorTerrainTextureBakeService;
  private readonly textureMapPersistence: EditorTerrainTextureMapPersistence;
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
  private texturePaintLoadRequestId = 0;
  private texturePaintRawLoadState: TexturePaintRawLoadState = "idle";

  public constructor(
    scene: Scene,
    canvas: HTMLCanvasElement,
    callbacks: EditorTerrainToolControllerCallbacks,
    generator = new TerrainGenerator(),
    heightEditor = new TerrainHeightEditor(),
    heightSampler = new TerrainHeightSampler(),
    brushSettingsNormalizer = new TerrainBrushSettingsNormalizer(),
    heightFieldSerializer = new TerrainHeightFieldSerializer(),
    picking = new EditorTerrainPicking(),
    textureBakeService = new EditorTerrainTextureBakeService(),
    textureMapPersistence = new EditorTerrainTextureMapPersistence()
  ) {
    this.scene = scene;
    this.canvas = canvas;
    this.callbacks = callbacks;
    this.generator = generator;
    this.heightEditor = heightEditor;
    this.heightSampler = heightSampler;
    this.brushSettingsNormalizer = brushSettingsNormalizer;
    this.heightFieldSerializer = heightFieldSerializer;
    this.picking = picking;
    this.preview = new EditorTerrainBrushPreview(scene);
    this.texturePaintRuntime = new EditorTerrainTexturePaintRuntime(scene, new EditorTerrainTextureLayerRegistry().getLayers());
    this.textureBakeService = textureBakeService;
    this.textureMapPersistence = textureMapPersistence;
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
    this.texturePaintRawLoadState = "idle";
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
    const previousTool = this.settings.tool;
    this.settings = this.brushSettingsNormalizer.normalizeTool({
      ...this.settings,
      tool
    });
    if (previousTool !== tool) {
      this.resetTexturePaintRuntime();
    }
    this.message =
      tool === "paintTexture"
          ? this.currentDescriptor?.material?.kind === "bakedTexture" &&
            !this.currentDescriptor.editedTextureMap &&
            !this.texturePaintRuntime.hasEditableTextureMap()
            ? "This baked terrain has no editable paint data yet. Paint to start a new texture map."
            : this.texturePaintRuntime.getPaintableLayerCount() > 0
            ? this.texturePaintRuntime.getLayerLimitMessage() ||
            "Select a terrain texture, then click and drag to paint terrain texture weights."
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
    this.settings = this.brushSettingsNormalizer.normalizeTool({
      ...this.settings,
      brush: this.brushSettingsNormalizer.normalizeBrush(settings)
    });
    this.callbacks.onChanged();
  }

  public updateTargetHeight(height: number): void {
    this.settings = this.brushSettingsNormalizer.normalizeTool({
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

  public async prepareTerrainForSceneSave(descriptor: SceneDescriptor): Promise<{
    readonly descriptor: SceneDescriptor;
    readonly assets: readonly EditorSceneSaveAsset[];
  }> {
    const nextDescriptor = cloneSceneDescriptor(descriptor);
    const terrain = nextDescriptor.terrain;
    if (terrain?.kind !== "generated") {
      return {
        descriptor: nextDescriptor,
        assets: []
      };
    }

    const splatMap = this.texturePaintRuntime.createBakeSnapshot();
    if (!splatMap) {
      return {
        descriptor: nextDescriptor,
        assets: []
      };
    }

    const bakedAssetPath = `assets/generated/terrain/${nextDescriptor.id}/${terrain.id}_albedo.png`;
    const bakeResolution = resolveBakeResolutionTuple(this.currentDescriptor ?? terrain);
    const bakedTexture = await this.textureBakeService.bakeToDataUrl({
      splatMap,
      layers: this.texturePaintRuntime.getActiveLayers(),
      terrainWidth: terrain.size[0],
      terrainDepth: terrain.size[1],
      outputResolution: bakeResolution
    });
    const serializedTextureMap = await this.textureMapPersistence.serialize({
      sceneId: nextDescriptor.id,
      terrainId: terrain.id,
      splatMap,
      layers: this.texturePaintRuntime.getActiveLayers(),
      bakedTexturePath: bakedAssetPath,
      bakeResolution
    });

    return {
      descriptor: {
        ...nextDescriptor,
        terrain: {
          ...terrain,
          material: {
            kind: "bakedTexture",
            texture: bakedAssetPath,
            color: terrain.material?.color,
            emissive: terrain.material?.emissive
          },
          editedTextureMap: serializedTextureMap.editedTextureMap
        }
      },
      assets: [
        {
          path: bakedAssetPath,
          encoding: "dataUrl",
          mimeType: "image/png",
          data: bakedTexture
        },
        ...serializedTextureMap.assets
      ]
    };
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

    const workingSettings = this.brushSettingsNormalizer.normalizeTool({
      ...this.settings,
      brush: {
        ...this.settings.brush,
        radius: this.settings.brush.radius * pick.localBrushRadius
      }
    });
    const center = toBrushCenter(pick);
    const sampledHeight = this.activeStroke?.flattenSampleHeight ?? workingSettings.targetHeight;

    if (workingSettings.tool === "paintTexture") {
      if (!this.texturePaintRuntime.isReadyToPaint()) {
        if (!this.startTexturePaintRuntimeForStroke()) {
          return;
        }
      }

      const result = this.texturePaintRuntime.paint(center, workingSettings.brush, deltaTime);
      if (result.changedTexelCount > 0) {
        this.document.markDirty();
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
      editedHeightMap: this.heightFieldSerializer.serialize(this.visibleField)
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
    const terrainInstance = this.sceneLoader?.getTerrainInstance() ?? null;
    const heightField = this.visibleField ?? this.workingField;
    if (!terrainInstance || !heightField) {
      this.texturePaintRuntime.dispose();
      return;
    }

    if (this.texturePaintRuntime.hasEditableTextureMap()) {
      this.texturePaintRawLoadState = "loaded";
      this.texturePaintRuntime.resetForTerrainWithOptions(terrainInstance, heightField, {
        allowCreateDefault: true
      });
      return;
    }

    if (this.settings.tool === "paintTexture") {
      void this.ensureTexturePaintRuntimeReady(false);
      return;
    }

    this.texturePaintRuntime.dispose();
  }

  private async ensureTexturePaintRuntimeReady(allowCreateDefault: boolean): Promise<void> {
    const terrain = this.currentDescriptor;
    const terrainInstance = this.sceneLoader?.getTerrainInstance() ?? null;
    const heightField = this.visibleField ?? this.workingField;
    if (!terrain || !terrainInstance || !heightField) {
      this.texturePaintRuntime.dispose();
      this.texturePaintRawLoadState = "idle";
      this.callbacks.onChanged();
      return;
    }

    if (this.texturePaintRuntime.hasEditableTextureMap()) {
      this.texturePaintRawLoadState = "loaded";
      this.texturePaintRuntime.resetForTerrainWithOptions(terrainInstance, heightField, {
        allowCreateDefault: true
      });
      this.callbacks.onChanged();
      return;
    }

    if (this.texturePaintRawLoadState === "loading") {
      this.callbacks.onChanged();
      return;
    }

    if (this.texturePaintRawLoadState === "failed" && terrain.editedTextureMap) {
      this.leaveBakedTerrainVisible(
        terrain,
        "Saved terrain texture paint data could not be loaded. Keeping baked terrain preview."
      );
      return;
    }

    const requestId = ++this.texturePaintLoadRequestId;
    if (terrain.editedTextureMap) {
      this.texturePaintRawLoadState = "loading";
      this.message = "Loading saved terrain texture paint data.";
      this.callbacks.onChanged();
      try {
        const loaded = await this.textureMapPersistence.load({
          editedTextureMap: terrain.editedTextureMap,
          availableLayers: this.texturePaintRuntime.getLayers(),
          maxPaintableLayerCount: this.texturePaintRuntime.getPaintableLayerCount()
        });
        if (requestId !== this.texturePaintLoadRequestId || this.currentDescriptor !== terrain) {
          return;
        }
        if (!loaded) {
          this.texturePaintRawLoadState = "failed";
          this.leaveBakedTerrainVisible(terrain, "Unable to load saved terrain texture paint data. Keeping baked terrain preview.");
          return;
        }

        this.texturePaintRuntime.resetForTerrainWithOptions(terrainInstance, heightField, {
          initialSplatMap: loaded.splatMap
        });
        if (!this.texturePaintRuntime.isReadyToPaint()) {
          this.texturePaintRawLoadState = "failed";
          this.leaveBakedTerrainVisible(terrain, "Saved terrain texture paint data could not be activated. Keeping baked terrain preview.");
          return;
        }
        this.texturePaintRawLoadState = "loaded";
        this.message =
          this.settings.tool === "paintTexture"
            ? "Loaded saved terrain texture paint data."
            : this.message;
      } catch (error) {
        if (requestId !== this.texturePaintLoadRequestId || this.currentDescriptor !== terrain) {
          return;
        }
        this.texturePaintRawLoadState = "failed";
        this.leaveBakedTerrainVisible(
          terrain,
          `Saved terrain paint data is broken or missing. Baked preview is kept. Paint again to start a new editable texture map. ${error instanceof Error ? error.message : String(error)}`
        );
        return;
      }
      this.callbacks.onChanged();
      return;
    }

    if (!allowCreateDefault) {
      this.texturePaintRawLoadState = "idle";
      this.leaveBakedTerrainVisible(
        terrain,
        terrain.material?.kind === "bakedTexture"
          ? "This baked terrain has no editable paint data yet. Paint to start a new texture map."
          : "Select a terrain texture, then click and drag to paint terrain texture weights."
      );
      return;
    }

    this.texturePaintRuntime.resetForTerrainWithOptions(terrainInstance, heightField, {
      allowCreateDefault: true
    });
    this.texturePaintRawLoadState = this.texturePaintRuntime.isReadyToPaint() ? "loaded" : "idle";
    this.message = "Started a new terrain texture paint map.";
    this.callbacks.onChanged();
  }

  private startTexturePaintRuntimeForStroke(): boolean {
    if (!this.currentDescriptor || !this.sceneLoader || !(this.visibleField ?? this.workingField)) {
      return false;
    }

    if (this.currentDescriptor.editedTextureMap) {
      const action = resolveTexturePaintStrokeAction({
        hasEditedTextureMap: true,
        rawLoadState: this.texturePaintRawLoadState,
        runtimeReady: this.texturePaintRuntime.isReadyToPaint()
      });

      if (action === "block") {
        return false;
      }
      if (action === "paintLoadedMap") {
        return this.texturePaintRuntime.isReadyToPaint();
      }
      if (action === "startNewMap") {
        this.texturePaintRuntime.resetForTerrainWithOptions(
          this.sceneLoader.getTerrainInstance(),
          this.visibleField ?? this.workingField,
          { allowCreateDefault: true }
        );
        if (this.texturePaintRuntime.isReadyToPaint()) {
          this.texturePaintRawLoadState = "loaded";
          this.message = "Started a new terrain texture paint map because saved raw paint data is broken.";
          this.callbacks.onChanged();
          return true;
        }
        return false;
      }

      this.message = "Loading saved terrain texture paint data before painting.";
      void this.ensureTexturePaintRuntimeReady(false);
      this.callbacks.onChanged();
      return false;
    }

    this.texturePaintRuntime.resetForTerrainWithOptions(
      this.sceneLoader.getTerrainInstance(),
      this.visibleField ?? this.workingField,
      { allowCreateDefault: true }
    );
    return this.texturePaintRuntime.isReadyToPaint();
  }

  private leaveBakedTerrainVisible(terrain: SceneGeneratedTerrainDescriptor, message: string): void {
    this.texturePaintRuntime.resetForTerrainWithOptions(this.sceneLoader?.getTerrainInstance() ?? null, this.visibleField ?? this.workingField, {
      allowCreateDefault: false
    });
    if (this.settings.tool === "paintTexture" || terrain.material?.kind === "bakedTexture") {
      this.message = message;
    }
    this.callbacks.onChanged();
  }
}

function resolveBakeResolutionTuple(terrain: SceneGeneratedTerrainDescriptor) {
  return terrain.editedTextureMap?.bakeResolution ?? resolveTerrainBakeResolution(terrain.size[0], terrain.size[1]);
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
