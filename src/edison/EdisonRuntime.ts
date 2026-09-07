import { Vector3, type Engine, type Scene } from "@babylonjs/core";
import type { LangManager } from "../core/lang/LangManager";
import { RECT_TILE_SIZE, WORLD_GRID_ORIGIN_X, WORLD_GRID_ORIGIN_Y, WORLD_GRID_ORIGIN_Z } from "../core/grid/WorldGridConstants";
import { SceneDescriptorAdapter } from "./adapters/SceneDescriptorAdapter";
import { TerrainCoreAdapter } from "./adapters/TerrainCoreAdapter";
import { readEdisonConnectedObjectDragData } from "./assets/EdisonConnectedObjectDragDrop";
import { readEdisonModelAssetDragData } from "./assets/EdisonModelDragDrop";
import { EdisonBootstrap } from "./EdisonBootstrap";
import { EdisonCommandRegistry } from "./core/EdisonCommandRegistry";
import { EdisonConnectedObjectService } from "./core/EdisonConnectedObjectService";
import type { EdisonPluginContext } from "./core/EdisonContext";
import { EdisonEventBus } from "./core/EdisonEventBus";
import { EdisonInteriorEditService } from "./core/EdisonInteriorEditService";
import { EdisonObjectRegistry } from "./core/EdisonObjectRegistry";
import { EdisonPlacementService, type EdisonPlacementAsset } from "./core/EdisonPlacementService";
import { EdisonPersistenceService } from "./core/EdisonPersistenceService";
import { EdisonPreferencesService } from "./core/EdisonPreferencesService";
import { EdisonSceneDocumentService } from "./core/EdisonSceneDocumentService";
import { EdisonSelectionService } from "./core/EdisonSelectionService";
import { EdisonTerrainSnapService } from "./core/EdisonTerrainSnapService";
import { EdisonTransformService } from "./core/EdisonTransformService";
import { EdisonViewportService } from "./core/EdisonViewportService";
import { EdisonPanelRegistry } from "./layout/EdisonPanelRegistry";
import { EdisonToolbarRegistry } from "./layout/EdisonToolbarRegistry";
import { EdisonPluginManager } from "./plugins/EdisonPluginManager";
import { EdisonPluginZipInstaller } from "./plugins/EdisonPluginZipInstaller";
import { EdisonToolRegistry } from "./tools/EdisonToolRegistry";

export class EdisonRuntime {
  private readonly events = new EdisonEventBus();
  private readonly commands = new EdisonCommandRegistry();
  private readonly toolbar = new EdisonToolbarRegistry();
  private readonly panels = new EdisonPanelRegistry();
  private readonly selection = new EdisonSelectionService();
  private readonly interiorEdit = new EdisonInteriorEditService();
  private readonly objects = new EdisonObjectRegistry();
  private readonly placement = new EdisonPlacementService();
  private readonly tools = new EdisonToolRegistry(this.events);
  private readonly persistence = new EdisonPersistenceService();
  private readonly preferences = new EdisonPreferencesService();
  private readonly terrain = new TerrainCoreAdapter();
  private readonly sceneDocuments: EdisonSceneDocumentService;
  private readonly viewport: EdisonViewportService;
  private readonly terrainSnap: EdisonTerrainSnapService;
  private readonly transforms: EdisonTransformService;
  private readonly connectedObjects: EdisonConnectedObjectService;
  private readonly pluginManager: EdisonPluginManager;
  private readonly zipInstaller = new EdisonPluginZipInstaller();
  private readonly context: EdisonPluginContext;
  private readonly disposers: Array<() => void> = [];
  private capturedToolPointerId: number | null = null;
  private lastPlacementPoint: Vector3 | null = null;
  private placementUpdateRequest = 0;

  private readonly onKeyDown = (event: KeyboardEvent): void => {
    if (event.code !== "Delete" || this.isEditingText(event.target)) {
      return;
    }

    if (this.placement.getSelectedAsset()) {
      this.placement.clear();
      event.preventDefault();
      return;
    }

    const selectedObjectId = this.selection.getSelectedObjectId();
    if (selectedObjectId) {
      if (!this.interiorEdit.canEditObject(this.sceneDocuments.getObject(selectedObjectId))) {
        this.selection.clear();
        event.preventDefault();
        return;
      }

      this.transforms.deleteSelected();
      event.preventDefault();
    }
  };

  private readonly onPointerDown = (event: PointerEvent): void => {
    if (event.button !== 0 || event.altKey) {
      return;
    }

    if (this.placement.getSelectedAsset()) {
      void this.commitPlacement(event.clientX, event.clientY);
      event.preventDefault();
      return;
    }

    const handled = this.tools.dispatchPointerDown({ nativeEvent: event });
    if (handled) {
      this.capturedToolPointerId = event.pointerId;
      this.canvas.setPointerCapture(event.pointerId);
      event.preventDefault();
    }
  };

  private readonly onPointerMove = (event: PointerEvent): void => {
    const placement = this.placement.getSelectedAsset();
    if (placement) {
      this.updatePlacementPreview(event.clientX, event.clientY, placement);
      event.preventDefault();
      return;
    }

    const handled = this.tools.dispatchPointerMove({ nativeEvent: event });
    if (handled) {
      event.preventDefault();
    }
  };

  private readonly onPointerLeave = (): void => {
    if (this.placement.getSelectedAsset()) {
      this.viewport.setPlacementPreviewVisible(false);
    }
  };

  private readonly onPointerUp = (event: PointerEvent): void => {
    const handled = this.tools.dispatchPointerUp({ nativeEvent: event });
    if (this.capturedToolPointerId === event.pointerId) {
      if (this.canvas.hasPointerCapture(event.pointerId)) {
        this.canvas.releasePointerCapture(event.pointerId);
      }
      this.capturedToolPointerId = null;
    }

    if (handled) {
      event.preventDefault();
    }
  };

  private readonly onCanvasDragOver = (event: DragEvent): void => {
    if (!readEdisonModelAssetDragData(event.dataTransfer) && !readEdisonConnectedObjectDragData(event.dataTransfer)) {
      return;
    }

    event.preventDefault();
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = "copy";
    }
  };

  private readonly onCanvasDrop = (event: DragEvent): void => {
    const connectedObject = readEdisonConnectedObjectDragData(event.dataTransfer);
    if (connectedObject) {
      event.preventDefault();
      if (this.interiorEdit.isActive()) {
        this.events.emit("edison.message", { text: "Interior edit mode only accepts Interior models." });
        return;
      }
      void this.placeDroppedConnectedObject(connectedObject.presetId, event.clientX, event.clientY);
      return;
    }

    const model = readEdisonModelAssetDragData(event.dataTransfer);
    if (!model) {
      return;
    }

    event.preventDefault();
    void this.placeDroppedModel(model, event.clientX, event.clientY);
  };

  public constructor(
    private readonly engine: Engine,
    private readonly babylonScene: Scene,
    private readonly canvas: HTMLCanvasElement,
    langManager: LangManager,
    private readonly onBackToMenu: () => void
  ) {
    this.sceneDocuments = new EdisonSceneDocumentService(
      new SceneDescriptorAdapter(langManager),
      this.persistence,
      this.terrain,
      this.events
    );
    this.viewport = new EdisonViewportService(engine, babylonScene, canvas, this.objects, this.events);
    this.terrainSnap = new EdisonTerrainSnapService(this.sceneDocuments, this.objects, this.viewport, this.events);
    this.transforms = new EdisonTransformService(
      this.sceneDocuments,
      this.objects,
      this.selection,
      this.viewport,
      this.events
    );
    this.connectedObjects = new EdisonConnectedObjectService(
      this.sceneDocuments,
      this.objects,
      this.viewport,
      this.events,
      this.terrainSnap
    );
    this.disposers.push(
      this.placement.onDidChange((asset) => {
        this.applyToolCursor();
        void this.updatePlacementAsset(asset);
      })
    );

    this.context = {
      apiVersion: "1",
      commands: this.commands,
      connectedObjects: this.connectedObjects,
      interiorEdit: this.interiorEdit,
      toolbar: this.toolbar,
      panels: this.panels,
      tools: this.tools,
      selection: this.selection,
      scene: this.sceneDocuments,
      terrainSnap: this.terrainSnap,
      viewport: this.viewport,
      objects: this.objects,
      placement: this.placement,
      transforms: this.transforms,
      events: this.events,
      preferences: this.preferences
    };
    this.tools.bindContext(this.context);
    this.pluginManager = new EdisonPluginManager(this.context);

    this.disposers.push(
      this.tools.onDidChange(() => {
        this.applyToolCursor();
      }),
      this.selection.onDidChange((selection) => {
        this.viewport.updateSelectionHighlight(selection);
        this.events.emit("edison.selection.changed", { selection });
      }),
      this.interiorEdit.onDidChange((state) => {
        const selectedAsset = this.placement.getSelectedAsset();
        if (state && selectedAsset && selectedAsset.objectType !== "interior") {
          this.placement.clear();
        }
        this.viewport.applyInteriorEditState(state);
        this.synchronizeInteriorEditSelection(state);
        this.events.emit("edison.interiorEdit.changed", { state });
      }),
      this.pluginManager.onDidChange(() => {
        this.events.emit("edison.plugins.changed", { plugins: this.pluginManager.listInstalledPlugins() });
      })
    );

    this.canvas.addEventListener("pointerdown", this.onPointerDown);
    this.canvas.addEventListener("pointermove", this.onPointerMove);
    this.canvas.addEventListener("pointerleave", this.onPointerLeave);
    this.canvas.addEventListener("dragover", this.onCanvasDragOver);
    this.canvas.addEventListener("drop", this.onCanvasDrop);
    window.addEventListener("pointerup", this.onPointerUp);
    window.addEventListener("keydown", this.onKeyDown);
  }

  public getContext(): EdisonPluginContext {
    return this.context;
  }

  public async initialize(): Promise<void> {
    const bootstrap = new EdisonBootstrap({
      context: this.context,
      pluginManager: this.pluginManager,
      zipInstaller: this.zipInstaller,
      onBackToMenu: this.onBackToMenu,
      reloadSceneContent: () => this.reloadSceneContent(),
      loadInitialSceneContent: () => this.loadInitialSceneContent()
    });
    await bootstrap.start();
    this.applyToolCursor();
  }

  public update(deltaSeconds: number): void {
    this.viewport.update(deltaSeconds);
  }

  public async loadInitialSceneContent(): Promise<void> {
    try {
      const loaded = await this.sceneDocuments.loadInitialScene();
      if (!loaded) {
        this.events.emit("edison.message", { text: "Edison opened with no scene content." });
        return;
      }

      await this.viewport.loadScene(loaded.option, loaded.descriptor);
      await this.connectedObjects.refreshAll({ markDirty: false });
      this.events.emit("edison.message", { text: "Edison scene loaded." });
    } catch (error) {
      this.events.emit("edison.message", { text: error instanceof Error ? error.message : String(error) });
    }
  }

  public async reloadSceneContent(): Promise<void> {
    try {
      const loaded = await this.sceneDocuments.reload();
      if (!loaded) {
        return;
      }

      this.placement.clear();
      this.interiorEdit.exit();
      this.selection.clear();
      await this.viewport.loadScene(loaded.option, loaded.descriptor);
      await this.connectedObjects.refreshAll({ markDirty: false });
      this.events.emit("edison.message", { text: "Scene reloaded." });
    } catch (error) {
      this.events.emit("edison.message", { text: error instanceof Error ? error.message : String(error) });
    }
  }

  public dispose(): void {
    this.canvas.removeEventListener("pointerdown", this.onPointerDown);
    this.canvas.removeEventListener("pointermove", this.onPointerMove);
    this.canvas.removeEventListener("pointerleave", this.onPointerLeave);
    this.canvas.removeEventListener("dragover", this.onCanvasDragOver);
    this.canvas.removeEventListener("drop", this.onCanvasDrop);
    window.removeEventListener("pointerup", this.onPointerUp);
    window.removeEventListener("keydown", this.onKeyDown);
    for (const dispose of this.disposers.splice(0)) {
      dispose();
    }
    void this.pluginManager.dispose();
    this.tools.dispose();
    this.panels.dispose();
    this.toolbar.dispose();
    this.commands.dispose();
    this.selection.dispose();
    this.interiorEdit.dispose();
    this.placement.dispose();
    this.connectedObjects.dispose();
    this.terrainSnap.dispose();
    this.viewport.dispose();
    this.events.clear();
    void this.engine;
  }

  private applyToolCursor(): void {
    this.canvas.style.cursor = this.placement.getSelectedAsset() ? "crosshair" : this.tools.getActiveTool()?.cursor ?? "default";
  }

  private async placeDroppedModel(
    model: {
      readonly id: string;
      readonly title: string;
      readonly modelPath: string;
      readonly objectType: string;
      readonly defaultScale?: number;
      readonly connectedPresetId?: string;
    },
    clientX: number,
    clientY: number
  ): Promise<void> {
    try {
      if (!this.canPlaceModelInCurrentMode(model.objectType)) {
        return;
      }

      const placementPoint = this.pickPlacementPoint(clientX, clientY, model);
      if (!placementPoint) {
        this.events.emit("edison.message", {
          text: this.interiorEdit.isActive()
            ? "Drop over the selected building floor to place interior models."
            : "Drop over terrain or the ground plane to place a model."
        });
        return;
      }

      if (model.connectedPresetId) {
        const objectId = await this.connectedObjects.place(model.connectedPresetId, placementPoint);
        this.selection.selectSceneObject(objectId);
        return;
      }

      const snappedPosition = this.resolvePlacementPosition(placementPoint, model);
      if (!snappedPosition) {
        this.events.emit("edison.message", { text: "Drop interior models on or near the selected floor grid." });
        return;
      }
      const objectDescriptor = this.sceneDocuments.createObjectDescriptorFromModel(
        model,
        snappedPosition,
        this.createPlacementDescriptorOptions(model.objectType)
      );
      this.sceneDocuments.addObject(objectDescriptor, `Placed ${model.title}.`);
      try {
        await this.viewport.addSceneObject(objectDescriptor);
        await this.terrainSnap.refreshAll();
        this.selection.selectSceneObject(objectDescriptor.id);
        this.events.emit("edison.message", { text: `Placed ${model.title}.` });
      } catch (error) {
        this.sceneDocuments.removeObject(objectDescriptor.id);
        throw error;
      }
    } catch (error) {
      this.events.emit("edison.message", { text: error instanceof Error ? error.message : String(error) });
    }
  }

  private async placeDroppedConnectedObject(presetId: string, clientX: number, clientY: number): Promise<void> {
    try {
      const placementPoint = this.viewport.pickGroundPoint(clientX, clientY);
      if (!placementPoint) {
        this.events.emit("edison.message", { text: "Drop over terrain or the ground plane to place a connected object." });
        return;
      }

      const objectId = await this.connectedObjects.place(presetId, placementPoint);
      this.selection.selectSceneObject(objectId);
    } catch (error) {
      this.events.emit("edison.message", { text: error instanceof Error ? error.message : String(error) });
    }
  }

  private async updatePlacementAsset(asset: EdisonPlacementAsset | null): Promise<void> {
    const request = ++this.placementUpdateRequest;
    this.lastPlacementPoint = null;
    this.viewport.clearPlacementPreview();
    if (!asset || !this.objects.getContent()) {
      return;
    }

    try {
      await this.viewport.setPlacementPreview({
        id: `placement-preview-${asset.id}`,
        type: asset.objectType,
        asset: asset.modelPath,
        position: [0, this.getPlacementY(asset), 0],
        rotation: [0, 0, 0],
        scale: this.toUniformScaleTuple(asset.defaultScale ?? 1),
        ...this.createPlacementDescriptorOptions(asset.objectType)
      });
      if (request !== this.placementUpdateRequest || this.placement.getSelectedAsset()?.id !== asset.id) {
        return;
      }
      if (this.lastPlacementPoint) {
        this.updatePlacementPreviewAtPoint(this.lastPlacementPoint, asset);
      }
    } catch (error) {
      if (request !== this.placementUpdateRequest || this.placement.getSelectedAsset()?.id !== asset.id) {
        return;
      }
      this.events.emit("edison.message", { text: error instanceof Error ? error.message : String(error) });
      this.placement.clear();
    }
  }

  private updatePlacementPreview(clientX: number, clientY: number, asset: EdisonPlacementAsset): void {
    const placementPoint = this.pickPlacementPoint(clientX, clientY, asset);
    if (!placementPoint) {
      this.viewport.setPlacementPreviewVisible(false);
      return;
    }

    this.lastPlacementPoint = placementPoint;
    this.updatePlacementPreviewAtPoint(placementPoint, asset);
  }

  private updatePlacementPreviewAtPoint(point: Vector3, asset: EdisonPlacementAsset): void {
    const position = this.resolvePlacementPosition(point, asset);
    if (!position) {
      this.viewport.setPlacementPreviewVisible(false);
      return;
    }

    this.viewport.setPlacementPreviewVisible(true);
    this.viewport.updatePlacementPreviewPosition(position);
  }

  private async commitPlacement(clientX: number, clientY: number): Promise<void> {
    const asset = this.placement.getSelectedAsset();
    if (!asset) {
      return;
    }

    if (!this.canPlaceModelInCurrentMode(asset.objectType)) {
      return;
    }

    const placementPoint = this.pickPlacementPoint(clientX, clientY, asset);
    if (!placementPoint) {
      this.events.emit("edison.message", {
        text: this.interiorEdit.isActive()
          ? "Click over the selected building floor to place interior models."
          : "Click over terrain or the ground plane to place an object."
      });
      return;
    }

    const snappedPosition = this.resolvePlacementPosition(placementPoint, asset);
    if (!snappedPosition) {
      this.events.emit("edison.message", { text: "Place interior models on or near the selected floor grid." });
      return;
    }
    try {
      if (asset.connectedPresetId) {
        const objectId = await this.connectedObjects.place(asset.connectedPresetId, snappedPosition);
        this.selection.selectSceneObject(objectId);
        return;
      }

      const objectDescriptor = this.sceneDocuments.createObjectDescriptorFromModel({
        id: asset.id,
        title: asset.title,
        modelPath: asset.modelPath,
        objectType: asset.objectType,
        defaultScale: asset.defaultScale
      }, snappedPosition, this.createPlacementDescriptorOptions(asset.objectType));
      this.sceneDocuments.addObject(objectDescriptor, `Placed ${asset.title}.`);
      try {
        await this.viewport.addSceneObject(objectDescriptor);
        await this.terrainSnap.refreshAll();
        this.selection.selectSceneObject(objectDescriptor.id);
        this.events.emit("edison.message", { text: `Placed ${asset.title}.` });
      } catch (error) {
        this.sceneDocuments.removeObject(objectDescriptor.id);
        throw error;
      }
    } catch (error) {
      this.events.emit("edison.message", { text: error instanceof Error ? error.message : String(error) });
    }
  }

  private resolvePlacementPosition(point: Vector3, asset: { readonly objectType: string; readonly connectedPresetId?: string; readonly gridSize?: number }): Vector3 | null {
    const state = this.interiorEdit.getState();
    if (state && asset.objectType === "interior") {
      return this.viewport.snapInteriorFloorPoint(point, state.activeBuildingId, state.activeStoryIndex);
    }

    const snappedPosition = this.snapPlacementPoint(point, asset.gridSize, this.getPlacementY(asset, point.y));
    return asset.connectedPresetId
      ? snappedPosition
      : this.viewport.projectPointOntoTerrain(snappedPosition);
  }

  private snapPlacementPoint(point: Vector3, gridSize = RECT_TILE_SIZE, placementY = point.y): Vector3 {
    return new Vector3(
      WORLD_GRID_ORIGIN_X + Math.round((point.x - WORLD_GRID_ORIGIN_X) / gridSize) * gridSize,
      placementY,
      WORLD_GRID_ORIGIN_Z + Math.round((point.z - WORLD_GRID_ORIGIN_Z) / gridSize) * gridSize
    );
  }

  private getPlacementY(asset: { readonly connectedPresetId?: string }, pickedY = WORLD_GRID_ORIGIN_Y): number {
    if (!asset.connectedPresetId) {
      return pickedY;
    }

    return this.connectedObjects.getDefinition(asset.connectedPresetId)?.placementY ?? WORLD_GRID_ORIGIN_Y;
  }

  private pickPlacementPoint(clientX: number, clientY: number, asset: { readonly objectType: string }): Vector3 | null {
    const state = this.interiorEdit.getState();
    if (state && asset.objectType === "interior") {
      return this.viewport.pickInteriorFloorPoint(clientX, clientY, state.activeBuildingId, state.activeStoryIndex);
    }

    return this.viewport.pickGroundPoint(clientX, clientY);
  }

  private createPlacementDescriptorOptions(objectType: string): { readonly interiorBuildingId?: string } {
    const activeBuildingId = this.interiorEdit.getActiveBuildingId();
    return activeBuildingId && objectType === "interior"
      ? { interiorBuildingId: activeBuildingId }
      : {};
  }

  private canPlaceModelInCurrentMode(objectType: string): boolean {
    if (!this.interiorEdit.isActive() || objectType === "interior") {
      return true;
    }

    this.events.emit("edison.message", { text: "Interior edit mode only accepts Interior models." });
    return false;
  }

  private synchronizeInteriorEditSelection(state: ReturnType<EdisonInteriorEditService["getState"]>): void {
    if (!state) {
      return;
    }

    const selection = this.selection.getSelection();
    if (selection?.kind !== "scene-object") {
      this.selection.clear();
      return;
    }

    if (!this.interiorEdit.canEditObject(this.sceneDocuments.getObject(selection.objectId))) {
      this.selection.clear();
    }
  }

  private toUniformScaleTuple(scale: number): readonly [number, number, number] {
    return [scale, scale, scale] as const;
  }

  private isEditingText(target: EventTarget | null): boolean {
    return target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement ||
      (target instanceof HTMLElement && target.isContentEditable);
  }
}
