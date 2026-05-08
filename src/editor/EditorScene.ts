import {
  Color3,
  Color4,
  Engine,
  HemisphericLight,
  HighlightLayer,
  Matrix,
  Mesh,
  Plane,
  Scene as BabylonScene,
  Vector3,
  type AbstractMesh
} from "@babylonjs/core";
import type { LangManager } from "../core/lang/LangManager";
import { loadSceneDescriptor } from "../core/world/scene/SceneDescriptorLoader";
import { BuildingThumbnailService } from "./assets/BuildingThumbnailService";
import { EditorCameraController } from "./EditorCameraController";
import { EditorGridOverlay } from "./EditorGridOverlay";
import { EditorObjectMoveController } from "./EditorObjectMoveController";
import { snapEditorPlacement } from "./EditorPlacementSnapping";
import { EditorSceneLoader } from "./EditorSceneLoader";
import { EditorSceneRegistry } from "./EditorSceneRegistry";
import { EditorSceneDocument } from "./state/EditorSceneDocument";
import type { EditorMoveAxisMode } from "./state/EditorMoveAxisMode";
import { saveSceneDescriptor, exportSceneDescriptorJson } from "./state/EditorScenePersistence";
import { EditorSelectionState } from "./state/EditorSelectionState";
import type { EditorTransformMode } from "./state/EditorTransformMode";
import { EditorTerrainController } from "./terrain/EditorTerrainController";
import { EditorUi } from "./ui/EditorUi";
import type { EditorBounds, EditorBuildingAssetOption, EditorSceneOption } from "./types";
import type { Scene } from "../core/scene/Scene";

interface PendingClickState {
  readonly pointerId: number;
  readonly clientX: number;
  readonly clientY: number;
}

/**
 * JSON-driven level editor with drag/drop placement and simple transform tools.
 */
export class EditorScene implements Scene {
  private readonly engine: Engine;
  private readonly canvas: HTMLCanvasElement;
  private readonly langManager: LangManager;
  private readonly onBackToMenu: () => void;
  private scene: BabylonScene | null;
  private ui: EditorUi | null;
  private gridOverlay: EditorGridOverlay | null;
  private cameraController: EditorCameraController | null;
  private sceneLoader: EditorSceneLoader | null;
  private highlightLayer: HighlightLayer | null;
  private thumbnailService: BuildingThumbnailService | null;
  private terrainController: EditorTerrainController | null;
  private readonly selectionState: EditorSelectionState;
  private document: EditorSceneDocument | null;
  private selectedScene: EditorSceneOption | null;
  private selectedBuilding: EditorBuildingAssetOption | null;
  private sceneOptions: readonly EditorSceneOption[];
  private buildingOptions: readonly EditorBuildingAssetOption[];
  private transformMode: EditorTransformMode;
  private moveAxisMode: EditorMoveAxisMode;
  private isLoading: boolean;
  private statusMessage: string;
  private readonly highlightedMeshes: Mesh[];
  private readonly objectMoveController: EditorObjectMoveController;
  private pendingClick: PendingClickState | null;
  private readonly onCanvasDragOver: (event: DragEvent) => void;
  private readonly onCanvasDrop: (event: DragEvent) => void;
  private readonly onCanvasPointerDown: (event: PointerEvent) => void;
  private readonly onCanvasPointerMove: (event: PointerEvent) => void;
  private readonly onCanvasPointerUp: (event: PointerEvent) => void;

  public constructor(
    engine: Engine,
    canvas: HTMLCanvasElement,
    langManager: LangManager,
    onBackToMenu: () => void
  ) {
    this.engine = engine;
    this.canvas = canvas;
    this.langManager = langManager;
    this.onBackToMenu = onBackToMenu;
    this.scene = null;
    this.ui = null;
    this.gridOverlay = null;
    this.cameraController = null;
    this.sceneLoader = null;
    this.highlightLayer = null;
    this.thumbnailService = null;
    this.terrainController = null;
    this.selectionState = new EditorSelectionState();
    this.document = null;
    this.selectedScene = null;
    this.selectedBuilding = null;
    this.sceneOptions = [];
    this.buildingOptions = [];
    this.transformMode = "select";
    this.moveAxisMode = "xz";
    this.isLoading = false;
    this.statusMessage = "";
    this.highlightedMeshes = [];
    this.objectMoveController = new EditorObjectMoveController();
    this.pendingClick = null;

    this.onCanvasDragOver = (event) => {
      if (event.dataTransfer?.types.includes("application/x-sillyrpg-building-asset-id")) {
        event.preventDefault();
      }
    };
    this.onCanvasDrop = (event) => {
      void this.handleCanvasDrop(event);
    };
    this.onCanvasPointerDown = (event) => {
      this.handleCanvasPointerDown(event);
    };
    this.onCanvasPointerMove = (event) => {
      this.handleCanvasPointerMove(event);
    };
    this.onCanvasPointerUp = (event) => {
      this.handleCanvasPointerUp(event);
    };
  }

  public async createScene(): Promise<BabylonScene> {
    const scene = new BabylonScene(this.engine);
    scene.clearColor = new Color4(0.08, 0.1, 0.13, 1);

    const keyLight = new HemisphericLight("editor-key-light", new Vector3(0.35, 1, 0.22), scene);
    keyLight.intensity = 1.05;
    const fillLight = new HemisphericLight("editor-fill-light", new Vector3(-0.45, 0.6, -0.2), scene);
    fillLight.intensity = 0.42;

    this.scene = scene;
    this.gridOverlay = new EditorGridOverlay(scene);
    this.cameraController = new EditorCameraController(scene, this.canvas, {
      onFrameRequested: () => {
        this.frameCurrentScene();
      }
    });
    this.sceneLoader = new EditorSceneLoader(scene);
    this.terrainController = new EditorTerrainController({
      onChanged: () => {
        this.refreshUi();
      },
      onTerrainApplied: () => {
        this.gridOverlay?.refreshFromMeshes(this.sceneLoader?.getRenderableMeshes() ?? []);
        this.refreshUi();
      },
      onStatusMessageChanged: (message) => {
        this.statusMessage = message;
        this.refreshUi();
      }
    });
    this.highlightLayer = new HighlightLayer("editor-selection-highlight", scene);
    this.thumbnailService = new BuildingThumbnailService();
    this.ui = new EditorUi(this.langManager.getUi(), {
      onBackToMenu: this.onBackToMenu,
      onReloadScene: () => {
        void this.reloadSelectedScene();
      },
      onFrameScene: () => {
        this.frameCurrentScene();
      },
      onToggleGrid: () => {
        this.toggleGridVisibility();
      },
      onToggleAxes: () => {
        this.toggleAxesVisibility();
      },
      onSelectTab: (tab) => {
        void tab;
      },
      onSelectScene: (sceneId) => {
        void this.handleSceneSelection(sceneId);
      },
      onSelectBuilding: (buildingId) => {
        this.handleBuildingSelection(buildingId);
      },
      onAddTerrain: () => {
        void this.handleAddTerrain();
      },
      terrainPanel: {
        onChangeTerrainDraft: (draft) => {
          this.terrainController?.updateDraft(draft);
        },
        onSelectTerrainPreset: (presetId) => {
          this.terrainController?.selectPreset(presetId);
        },
        onGenerateTerrain: () => this.terrainController?.generateNow() ?? Promise.resolve(),
        onRandomizeSeed: () => this.terrainController?.randomizeSeed() ?? Promise.resolve(),
        onFlattenTerrain: () => this.terrainController?.flatten() ?? Promise.resolve(),
        onResetTerrainPreset: (presetId) => this.terrainController?.resetPreset(presetId) ?? Promise.resolve()
      },
      onSetTransformMode: (mode) => {
        this.transformMode = mode;
        this.statusMessage = mode === "move" ? getMoveAxisDescription(this.moveAxisMode) : "Selection mode active.";
        this.refreshUi();
      },
      onSetMoveAxisMode: (mode) => {
        this.moveAxisMode = mode;
        this.statusMessage = getMoveAxisDescription(mode);
        this.refreshUi();
      },
      onRotateSelected: (direction) => {
        this.rotateSelectedObject(direction);
      },
      onDeleteSelected: () => {
        this.deleteSelectedObject();
      },
      onSaveScene: () => {
        void this.handleSaveScene();
      },
      onExportScene: () => {
        this.handleExportScene();
      }
    });

    this.ui.setGridVisible(true);
    this.ui.setAxesVisible(true);
    this.ui.setMoveAxisMode(this.moveAxisMode);

    this.canvas.addEventListener("dragover", this.onCanvasDragOver);
    this.canvas.addEventListener("drop", this.onCanvasDrop);
    this.canvas.addEventListener("pointerdown", this.onCanvasPointerDown);
    this.canvas.addEventListener("pointermove", this.onCanvasPointerMove);
    window.addEventListener("pointerup", this.onCanvasPointerUp);

    scene.onDisposeObservable.addOnce(() => {
      this.canvas.removeEventListener("dragover", this.onCanvasDragOver);
      this.canvas.removeEventListener("drop", this.onCanvasDrop);
      this.canvas.removeEventListener("pointerdown", this.onCanvasPointerDown);
      this.canvas.removeEventListener("pointermove", this.onCanvasPointerMove);
      window.removeEventListener("pointerup", this.onCanvasPointerUp);
      this.highlightLayer?.dispose();
      this.highlightLayer = null;
      this.thumbnailService?.dispose();
      this.thumbnailService = null;
      this.sceneLoader?.dispose();
      this.sceneLoader = null;
      this.terrainController?.dispose();
      this.terrainController = null;
      this.cameraController?.dispose();
      this.cameraController = null;
      this.gridOverlay?.dispose();
      this.gridOverlay = null;
      this.ui?.dispose();
      this.ui = null;
      this.objectMoveController.cancelMove();
      this.scene = null;
    });

    await this.initializeSceneRegistry();
    this.refreshUi();
    return scene;
  }

  public processInput(input: string): void {
    console.log(`EditorScene input received: ${input}`);
  }

  private async initializeSceneRegistry(): Promise<void> {
    const registry = new EditorSceneRegistry(this.langManager);

    try {
      const [sceneOptions, buildingOptions] = await Promise.all([
        registry.loadSceneOptions(),
        registry.loadBuildingOptions()
      ]);

      this.sceneOptions = sceneOptions;
      this.buildingOptions = buildingOptions;
      this.ui?.setSceneOptions(this.sceneOptions, null);
      this.ui?.setBuildingOptions(this.buildingOptions, null);

      for (const building of this.buildingOptions) {
        const thumbnailPromise = this.thumbnailService?.getThumbnail(building);
        if (thumbnailPromise) {
          void thumbnailPromise.then((thumbnailUrl) => {
            this.ui?.setBuildingThumbnail(building.id, thumbnailUrl);
          });
        }
      }

      if (this.sceneOptions.length > 0) {
        await this.loadSceneOption(this.sceneOptions[0], true);
      } else {
        this.statusMessage = "";
      }
    } catch (error) {
      this.statusMessage = error instanceof Error ? error.message : String(error);
    }
  }

  private async handleSceneSelection(sceneId: string): Promise<void> {
    const option = this.sceneOptions.find((candidate) => candidate.id === sceneId);
    if (!option) {
      return;
    }

    await this.loadSceneOption(option, true);
  }

  private handleBuildingSelection(buildingId: string): void {
    this.selectedBuilding = this.buildingOptions.find((candidate) => candidate.id === buildingId) ?? null;
    this.ui?.updateSelectedBuilding(this.selectedBuilding?.id ?? null);
  }

  private async reloadSelectedScene(): Promise<void> {
    if (!this.selectedScene) {
      return;
    }

    await this.loadSceneOption(this.selectedScene, false);
  }

  private async loadSceneOption(option: EditorSceneOption, frameAfterLoad: boolean): Promise<void> {
    if (!this.sceneLoader || !this.gridOverlay) {
      return;
    }

    this.isLoading = true;
    this.statusMessage = `Loading ${option.rawDescriptorPath}`;
    this.selectedScene = option;
    this.ui?.updateSelectedScene(option.id);
    this.refreshUi();

    try {
      const loadedDescriptor = await loadSceneDescriptor(option.rawDescriptorPath);
      this.document = new EditorSceneDocument(option.rawDescriptorPath, loadedDescriptor.descriptor);
      await this.sceneLoader.load(option, this.document.descriptor);
      this.terrainController?.bind(this.document, this.sceneLoader);
      this.objectMoveController.cancelMove();
      this.clearSelection();
      this.gridOverlay.refreshFromMeshes(this.sceneLoader.getRenderableMeshes());
      this.statusMessage = "";
      if (frameAfterLoad) {
        this.frameCurrentScene();
      }
    } catch (error) {
      this.statusMessage = error instanceof Error ? error.message : String(error);
      this.sceneLoader.clear();
      this.terrainController?.bind(null, null);
      this.document = null;
    } finally {
      this.isLoading = false;
      this.refreshUi();
    }
  }

  private async handleAddTerrain(): Promise<void> {
    if (!this.ui) {
      return;
    }
    this.ui.setActiveTab("terrain");
  }

  private async handleCanvasDrop(event: DragEvent): Promise<void> {
    const assetId = event.dataTransfer?.getData("application/x-sillyrpg-building-asset-id");
    if (!assetId) {
      return;
    }

    event.preventDefault();

    const asset = this.buildingOptions.find((candidate) => candidate.id === assetId);
    if (!asset || !this.document || !this.sceneLoader || !this.gridOverlay) {
      return;
    }

    const placementPoint = this.pickPlacementPoint(event.clientX, event.clientY) ?? Vector3.Zero();
    const snappedPosition = snapEditorPlacement(placementPoint, 0);
    const objectDescriptor = this.document.addObjectFromAsset(asset, snappedPosition);
    await this.sceneLoader.addObject(objectDescriptor);
    this.gridOverlay.refreshFromMeshes(this.sceneLoader.getRenderableMeshes());
    this.selectedBuilding = asset;
    this.ui?.updateSelectedBuilding(asset.id);
    this.setSelectedObject(objectDescriptor.id);
    this.statusMessage = `Placed ${asset.title}.`;
    this.refreshUi();
  }

  private handleCanvasPointerDown(event: PointerEvent): void {
    if (event.button !== 0 || event.altKey) {
      return;
    }

    if (this.transformMode === "move") {
      const objectId = this.pickSelectableObjectId(event.clientX, event.clientY);
      const selectedObjectId = this.selectionState.getSelectedObjectId();
      if (objectId && objectId === selectedObjectId) {
        const objectDescriptor = this.document?.getObject(objectId);
        const currentHit = this.pickPlacementPoint(event.clientX, event.clientY);
        if (objectDescriptor) {
          const didStartMove = this.objectMoveController.beginMove({
            pointerId: event.pointerId,
            clientY: event.clientY,
            objectId,
            objectPosition: new Vector3(
              objectDescriptor.position[0],
              objectDescriptor.position[1],
              objectDescriptor.position[2]
            ),
            axisMode: this.moveAxisMode,
            placementPoint: currentHit
          });
          if (didStartMove) {
            this.canvas.setPointerCapture(event.pointerId);
            event.preventDefault();
            return;
          }
        }
      }
    }

    this.pendingClick = {
      pointerId: event.pointerId,
      clientX: event.clientX,
      clientY: event.clientY
    };
  }

  private handleCanvasPointerMove(event: PointerEvent): void {
    if (!this.document || !this.sceneLoader || !this.gridOverlay) {
      return;
    }

    if (this.objectMoveController.isMovingPointer(event.pointerId)) {
      const movingObjectId = this.objectMoveController.getActiveObjectId();
      if (!movingObjectId) {
        return;
      }

      const objectDescriptor = this.document.getObject(movingObjectId);
      if (!objectDescriptor) {
        return;
      }

      const nextMove = this.objectMoveController.updateMove({
        pointerId: event.pointerId,
        clientY: event.clientY,
        currentPosition: new Vector3(
          objectDescriptor.position[0],
          objectDescriptor.position[1],
          objectDescriptor.position[2]
        ),
        placementPoint: this.moveAxisMode === "y" ? null : this.pickPlacementPoint(event.clientX, event.clientY)
      });
      if (!nextMove) {
        return;
      }

      this.document.updateObjectTransform(nextMove.objectId, { position: nextMove.nextPosition });
      const nextDescriptor = this.document.getObject(nextMove.objectId);
      if (!nextDescriptor) {
        return;
      }

      this.sceneLoader.updateObjectTransform(nextMove.objectId, nextDescriptor);
      this.refreshUi();
      event.preventDefault();
    }
  }

  private handleCanvasPointerUp(event: PointerEvent): void {
    if (this.objectMoveController.isMovingPointer(event.pointerId)) {
      if (this.canvas.hasPointerCapture(event.pointerId)) {
        this.canvas.releasePointerCapture(event.pointerId);
      }
      this.objectMoveController.cancelMove(event.pointerId);
      this.statusMessage = "Object moved.";
      this.refreshUi();
      return;
    }

    if (!this.pendingClick || this.pendingClick.pointerId !== event.pointerId) {
      return;
    }

    const distance = Math.hypot(event.clientX - this.pendingClick.clientX, event.clientY - this.pendingClick.clientY);
    this.pendingClick = null;
    if (distance > 4) {
      return;
    }

    const objectId = this.pickSelectableObjectId(event.clientX, event.clientY);
    this.setSelectedObject(objectId);
  }

  private setSelectedObject(objectId: string | null): void {
    this.selectionState.setSelectedObjectId(objectId);
    this.refreshSelectionHighlight();
    this.refreshUi();
  }

  private clearSelection(): void {
    this.selectionState.clear();
    this.refreshSelectionHighlight();
    this.refreshUi();
  }

  private refreshSelectionHighlight(): void {
    if (this.highlightLayer) {
      for (const mesh of this.highlightedMeshes) {
        this.highlightLayer.removeMesh(mesh);
      }
    }
    this.highlightedMeshes.length = 0;

    const objectId = this.selectionState.getSelectedObjectId();
    if (!objectId || !this.sceneLoader || !this.highlightLayer) {
      return;
    }

    const instance = this.sceneLoader.getObjectInstance(objectId);
    if (!instance) {
      return;
    }

    for (const mesh of instance.renderableMeshes) {
      if (mesh instanceof Mesh) {
        this.highlightLayer.addMesh(mesh, Color3.FromHexString("#F7C948"));
        this.highlightedMeshes.push(mesh);
      }
    }
  }

  private rotateSelectedObject(direction: -1 | 1): void {
    if (!this.document || !this.sceneLoader) {
      return;
    }

    const objectId = this.selectionState.getSelectedObjectId();
    if (!objectId) {
      return;
    }

    const objectDescriptor = this.document.getObject(objectId);
    if (!objectDescriptor) {
      return;
    }

    const quarterTurn = Math.PI / 2;
    const nextRotationY = normalizeQuarterTurn(objectDescriptor.rotation[1] + direction * quarterTurn);
    this.document.updateObjectTransform(objectId, {
      rotation: new Vector3(objectDescriptor.rotation[0], nextRotationY, objectDescriptor.rotation[2])
    });

    const updatedDescriptor = this.document.getObject(objectId);
    if (!updatedDescriptor) {
      return;
    }

    this.sceneLoader.updateObjectTransform(objectId, updatedDescriptor);
    this.statusMessage = `Rotated ${direction > 0 ? "+90°" : "-90°"}.`;
    this.refreshUi();
  }

  private deleteSelectedObject(): void {
    if (!this.document || !this.sceneLoader || !this.gridOverlay) {
      return;
    }

    const objectId = this.selectionState.getSelectedObjectId();
    if (!objectId) {
      return;
    }

    this.document.removeObject(objectId);
    this.sceneLoader.removeObject(objectId);
    this.clearSelection();
    this.gridOverlay.refreshFromMeshes(this.sceneLoader.getRenderableMeshes());
    this.statusMessage = "Object deleted.";
    this.refreshUi();
  }

  private async handleSaveScene(): Promise<void> {
    if (!this.document) {
      return;
    }

    try {
      await saveSceneDescriptor(this.document.descriptorPath, this.document.descriptor);
      this.document.markSaved();
      this.statusMessage = "Scene saved.";
    } catch (error) {
      this.statusMessage = error instanceof Error ? error.message : String(error);
    }

    this.refreshUi();
  }

  private handleExportScene(): void {
    if (!this.document) {
      return;
    }

    exportSceneDescriptorJson(this.createExportFileName(this.document.descriptorPath), this.document.toJson());
    this.statusMessage = "Scene JSON exported.";
    this.refreshUi();
  }

  private refreshUi(): void {
    const sceneLabel = this.selectedScene?.label ?? (this.langManager.getUi()["editor.noSceneLoaded"] ?? "No scene loaded");
    const descriptorPath = this.document?.descriptorPath ?? this.selectedScene?.rawDescriptorPath ?? "";
    const terrainStatus = this.describeTerrainStatus();
    const objectCount = this.document?.descriptor.objects.length ?? 0;
    const dirty = this.document?.dirty ?? false;
    const message = this.isLoading ? "Loading..." : this.statusMessage;

    this.ui?.updateSelectedScene(this.selectedScene?.id ?? null);
    this.ui?.updateSelectedBuilding(this.selectedBuilding?.id ?? null);
    this.ui?.setScenePanel({
      sceneLabel,
      descriptorPath,
      terrainStatus,
      objectCount,
      dirty,
      message
    });
    this.ui?.setTerrainPanel(
      this.terrainController?.getViewModel() ?? {
        enabled: false,
        descriptor: null,
        presets: [],
        stats: null,
        dirty: false,
        draftDirty: false,
        appliedSummary: "none"
      }
    );
    this.ui?.setSelectedObject(this.selectionState.getSelectedObjectId() ? this.document?.getObject(this.selectionState.getSelectedObjectId()!) ?? null : null);
    this.ui?.setTransformMode(this.transformMode);
    this.ui?.setMoveAxisMode(this.moveAxisMode);
  }

  private describeTerrainStatus(): string {
    const terrain = this.document?.descriptor.terrain;
    if (!terrain) {
      return "none";
    }

    if (terrain.kind === "plane") {
      return `plane ${terrain.size[0]} x ${terrain.size[1]}`;
    }

    if (terrain.kind === "generated") {
      return `generated ${terrain.generator.preset} ${terrain.resolution[0]} x ${terrain.resolution[1]}`;
    }

    return terrain.model;
  }

  private frameCurrentScene(): void {
    if (!this.cameraController || !this.sceneLoader || !this.gridOverlay) {
      return;
    }

    const bounds = this.resolveBounds(this.sceneLoader.getRenderableMeshes());
    this.cameraController.frameBounds(bounds ?? this.gridOverlay.getGridBounds());
  }

  private resolveBounds(meshes: readonly AbstractMesh[]): EditorBounds | null {
    const sourceMeshes = meshes.filter((mesh) => {
      if (mesh.isDisposed() || !mesh.isEnabled()) {
        return false;
      }

      const bounds = mesh.getBoundingInfo().boundingBox;
      const min = bounds.minimumWorld;
      const max = bounds.maximumWorld;
      return [min.x, min.y, min.z, max.x, max.y, max.z].every(Number.isFinite);
    });

    if (sourceMeshes.length === 0) {
      return null;
    }

    let minX = Number.POSITIVE_INFINITY;
    let minY = Number.POSITIVE_INFINITY;
    let minZ = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY;
    let maxY = Number.NEGATIVE_INFINITY;
    let maxZ = Number.NEGATIVE_INFINITY;

    for (const mesh of sourceMeshes) {
      const bounds = mesh.getBoundingInfo().boundingBox;
      minX = Math.min(minX, bounds.minimumWorld.x);
      minY = Math.min(minY, bounds.minimumWorld.y);
      minZ = Math.min(minZ, bounds.minimumWorld.z);
      maxX = Math.max(maxX, bounds.maximumWorld.x);
      maxY = Math.max(maxY, bounds.maximumWorld.y);
      maxZ = Math.max(maxZ, bounds.maximumWorld.z);
    }

    return {
      min: new Vector3(minX, minY, minZ),
      max: new Vector3(maxX, maxY, maxZ)
    };
  }

  private toggleGridVisibility(): void {
    if (!this.gridOverlay || !this.ui) {
      return;
    }

    this.gridOverlay.setGridVisible(!this.gridOverlay.getGridVisible());
    this.ui.setGridVisible(this.gridOverlay.getGridVisible());
  }

  private toggleAxesVisibility(): void {
    if (!this.gridOverlay || !this.ui) {
      return;
    }

    this.gridOverlay.setAxesVisible(!this.gridOverlay.getAxesVisible());
    this.ui.setAxesVisible(this.gridOverlay.getAxesVisible());
  }

  private pickSelectableObjectId(clientX: number, clientY: number): string | null {
    if (!this.scene) {
      return null;
    }

    const coordinates = this.toCanvasRenderCoordinates(clientX, clientY);
    const pick = this.scene.pick(coordinates.x, coordinates.y, (mesh) => {
      return mesh.metadata?.sceneObjectId != null && mesh.metadata?.editorSelectable !== false;
    });

    if (!pick?.hit || !pick.pickedMesh) {
      return null;
    }

    return this.resolveSceneObjectIdFromMesh(pick.pickedMesh);
  }

  private resolveSceneObjectIdFromMesh(mesh: AbstractMesh): string | null {
    let current: { metadata?: unknown; parent?: unknown } | null = mesh;
    while (current) {
      const metadata = (current.metadata ?? null) as Record<string, unknown> | null;
      const objectId = typeof metadata?.sceneObjectId === "string" ? metadata.sceneObjectId : null;
      if (objectId) {
        return objectId;
      }
      current = (current.parent as { metadata?: unknown; parent?: unknown } | null) ?? null;
    }

    return null;
  }

  private pickPlacementPoint(clientX: number, clientY: number): Vector3 | null {
    if (!this.scene || !this.scene.activeCamera) {
      return null;
    }

    const coordinates = this.toCanvasRenderCoordinates(clientX, clientY);
    const terrainPick = this.scene.pick(coordinates.x, coordinates.y, (mesh) => {
      return mesh.metadata?.editorTerrain === true;
    });

    if (terrainPick?.hit && terrainPick.pickedPoint) {
      return terrainPick.pickedPoint.clone();
    }

    const ray = this.scene.createPickingRay(coordinates.x, coordinates.y, Matrix.Identity(), this.scene.activeCamera);
    const distance = ray.intersectsPlane(Plane.FromPositionAndNormal(Vector3.Zero(), Vector3.Up()));
    if (distance === null || distance < 0) {
      return null;
    }

    return ray.origin.add(ray.direction.scale(distance));
  }

  private toCanvasRenderCoordinates(clientX: number, clientY: number): { x: number; y: number } {
    const rect = this.canvas.getBoundingClientRect();
    const x = ((clientX - rect.left) / rect.width) * this.engine.getRenderWidth();
    const y = ((clientY - rect.top) / rect.height) * this.engine.getRenderHeight();
    return { x, y };
  }

  private createExportFileName(descriptorPath: string): string {
    const segments = descriptorPath.split("/");
    return segments[segments.length - 1] ?? "scene.json";
  }
}

function getMoveAxisDescription(mode: EditorMoveAxisMode): string {
  if (mode === "x") {
    return "Move X: drag selected object horizontally on X only. Snaps to 1m grid.";
  }
  if (mode === "z") {
    return "Move Z: drag selected object horizontally on Z only. Snaps to 1m grid.";
  }
  if (mode === "y") {
    return "Move Y: drag up or down to move selected object vertically. Snaps to 1m grid.";
  }
  return "Move X/Z: drag selected object on the ground plane. Snaps to 1m grid.";
}

function normalizeQuarterTurn(value: number): number {
  const fullTurn = Math.PI * 2;
  const normalized = ((value % fullTurn) + fullTurn) % fullTurn;
  return Math.round(normalized / (Math.PI / 2)) * (Math.PI / 2);
}
