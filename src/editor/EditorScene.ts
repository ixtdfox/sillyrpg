import { Color4, Engine, HemisphericLight, Scene as BabylonScene, Vector3, type AbstractMesh, type Observer } from "@babylonjs/core";
import type { LangManager } from "../core/lang/LangManager";
import type { Scene } from "../core/scene/Scene";
import { EditorCameraController } from "./EditorCameraController";
import { EditorGridOverlay } from "./EditorGridOverlay";
import { EditorSceneLoader } from "./EditorSceneLoader";
import { EditorSceneRegistry } from "./EditorSceneRegistry";
import { EditorUi } from "./ui/EditorUi";
import type { EditorSceneOption } from "./types";

/**
 * Read-only level editor scene with scene selection, viewport controls, and grid helpers.
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
  private selectedScene: EditorSceneOption | null;
  private sceneOptions: readonly EditorSceneOption[];
  private isLoading: boolean;
  private errorText: string;
  private statusObserver: Observer<BabylonScene> | null;

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
    this.selectedScene = null;
    this.sceneOptions = [];
    this.isLoading = false;
    this.errorText = "";
    this.statusObserver = null;
  }

  public async createScene(): Promise<BabylonScene> {
    const scene = new BabylonScene(this.engine);
    scene.clearColor = new Color4(0.09, 0.11, 0.14, 1);

    const keyLight = new HemisphericLight("editor-key-light", new Vector3(0.3, 1, 0.2), scene);
    keyLight.intensity = 1.0;
    const fillLight = new HemisphericLight("editor-fill-light", new Vector3(-0.4, 0.6, -0.3), scene);
    fillLight.intensity = 0.45;

    this.scene = scene;
    this.gridOverlay = new EditorGridOverlay(scene);
    this.cameraController = new EditorCameraController(scene, this.canvas, {
      onFrameRequested: () => {
        this.frameCurrentScene();
      }
    });
    this.sceneLoader = new EditorSceneLoader(scene);
    this.ui = new EditorUi(scene, this.langManager.getUi(), {
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
      }
    });

    this.statusObserver = scene.onBeforeRenderObservable.add(() => {
      this.refreshStatus();
    });

    scene.onDisposeObservable.addOnce(() => {
      if (this.statusObserver !== null) {
        scene.onBeforeRenderObservable.remove(this.statusObserver);
        this.statusObserver = null;
      }
      this.sceneLoader?.dispose();
      this.sceneLoader = null;
      this.cameraController?.dispose();
      this.cameraController = null;
      this.gridOverlay?.dispose();
      this.gridOverlay = null;
      this.ui?.dispose();
      this.ui = null;
      this.scene = null;
    });

    await this.initializeSceneRegistry();
    this.refreshStatus();
    return scene;
  }

  public processInput(input: string): void {
    console.log(`EditorScene input received: ${input}`);
  }

  private async initializeSceneRegistry(): Promise<void> {
    const registry = new EditorSceneRegistry(this.langManager);

    try {
      this.sceneOptions = await registry.loadSceneOptions();
      this.ui?.setSceneOptions(this.sceneOptions, null);
      this.ui?.bindSceneOptionActions(this.sceneOptions, (sceneId) => {
        void this.handleSceneSelection(sceneId);
      });

      if (this.sceneOptions.length > 0) {
        await this.loadSceneOption(this.sceneOptions[0], true);
      } else {
        this.errorText = "";
      }
    } catch (error) {
      this.errorText = error instanceof Error ? error.message : String(error);
    }
  }

  private async handleSceneSelection(sceneId: string): Promise<void> {
    const option = this.sceneOptions.find((candidate) => candidate.id === sceneId);
    if (!option) {
      return;
    }

    await this.loadSceneOption(option, true);
  }

  private async reloadSelectedScene(): Promise<void> {
    if (!this.selectedScene) {
      return;
    }

    await this.loadSceneOption(this.selectedScene, false);
  }

  private async loadSceneOption(option: EditorSceneOption, frameAfterLoad: boolean): Promise<void> {
    if (!this.sceneLoader || !this.gridOverlay || !this.cameraController || !this.ui) {
      return;
    }

    this.isLoading = true;
    this.errorText = "";
    this.selectedScene = option;
    this.ui.updateSelectedScene(option.id);
    this.ui.setSceneHeader(option.label);
    this.refreshStatus();

    try {
      const content = await this.sceneLoader.load(option);
      this.gridOverlay.refreshFromMeshes(content.renderableMeshes);
      if (frameAfterLoad) {
        this.frameCurrentScene();
      }
    } catch (error) {
      this.sceneLoader.clear();
      this.gridOverlay.refreshFromMeshes([]);
      this.errorText = error instanceof Error ? error.message : String(error);
    } finally {
      this.isLoading = false;
      this.refreshStatus();
    }
  }

  private frameCurrentScene(): void {
    if (!this.cameraController || !this.gridOverlay) {
      return;
    }

    const content = this.sceneLoader?.getCurrentContent();
    const bounds = this.resolveBounds(content?.renderableMeshes ?? []);
    this.cameraController.frameBounds(bounds ?? this.gridOverlay.getGridBounds());
  }

  private resolveBounds(meshes: readonly AbstractMesh[]): { min: Vector3; max: Vector3 } | null {
    const sourceMeshes = meshes.filter((mesh) => {
      if (mesh.isDisposed() || !mesh.isEnabled()) {
        return false;
      }

      const bounds = mesh.getBoundingInfo().boundingBox;
      const min = bounds.minimumWorld;
      const max = bounds.maximumWorld;
      if (![min.x, min.y, min.z, max.x, max.y, max.z].every(Number.isFinite)) {
        return false;
      }

      return max.y >= -100 && min.y >= -100;
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

  private refreshStatus(): void {
    if (!this.ui || !this.cameraController) {
      return;
    }

    const cameraStatus = this.cameraController.getCameraStatus();
    const content = this.sceneLoader?.getCurrentContent();
    const sceneOption = this.selectedScene;
    const selectedLabel = sceneOption?.label ?? (this.langManager.getUi()["editor.noSceneLoaded"] ?? "No scene loaded");
    this.ui.setStatus({
      selectedSceneLabel: selectedLabel,
      selectedSceneId: sceneOption?.id ?? "",
      assetPath: sceneOption?.assetUrl ?? "",
      loadedMeshCount: content?.meshes.length ?? 0,
      renderableMeshCount: content?.renderableMeshes.length ?? 0,
      helperMeshCount: content?.helperMeshes.length ?? 0,
      loadState: this.errorText
        ? (this.langManager.getUi()["editor.error"] ?? "Error")
        : this.isLoading
          ? (this.langManager.getUi()["editor.loading"] ?? "Loading")
          : (this.langManager.getUi()["editor.ready"] ?? "Ready"),
      cameraMode: cameraStatus.mode,
      cameraPosition: this.formatVector(cameraStatus.position),
      cameraTarget: this.formatVector(cameraStatus.target),
      errorText: this.errorText
    });
  }

  private formatVector(vector: Vector3): string {
    return `(${vector.x.toFixed(2)}, ${vector.y.toFixed(2)}, ${vector.z.toFixed(2)})`;
  }
}
