import type { Engine, Scene } from "@babylonjs/core";
import type { LangManager } from "../core/lang/LangManager";
import { SceneDescriptorAdapter } from "./adapters/SceneDescriptorAdapter";
import { TerrainCoreAdapter } from "./adapters/TerrainCoreAdapter";
import { EdisonBootstrap } from "./EdisonBootstrap";
import { EdisonCommandRegistry } from "./core/EdisonCommandRegistry";
import type { EdisonPluginContext } from "./core/EdisonContext";
import { EdisonEventBus } from "./core/EdisonEventBus";
import { EdisonObjectRegistry } from "./core/EdisonObjectRegistry";
import { EdisonPersistenceService } from "./core/EdisonPersistenceService";
import { EdisonSceneDocumentService } from "./core/EdisonSceneDocumentService";
import { EdisonSelectionService } from "./core/EdisonSelectionService";
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
  private readonly objects = new EdisonObjectRegistry();
  private readonly tools = new EdisonToolRegistry(this.events);
  private readonly persistence = new EdisonPersistenceService();
  private readonly terrain = new TerrainCoreAdapter();
  private readonly sceneDocuments: EdisonSceneDocumentService;
  private readonly viewport: EdisonViewportService;
  private readonly transforms: EdisonTransformService;
  private readonly pluginManager: EdisonPluginManager;
  private readonly zipInstaller = new EdisonPluginZipInstaller();
  private readonly context: EdisonPluginContext;
  private readonly disposers: Array<() => void> = [];
  private capturedToolPointerId: number | null = null;

  private readonly onPointerDown = (event: PointerEvent): void => {
    if (event.button !== 0 || event.altKey) {
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
    const handled = this.tools.dispatchPointerMove({ nativeEvent: event });
    if (handled) {
      event.preventDefault();
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
    this.transforms = new EdisonTransformService(
      this.sceneDocuments,
      this.objects,
      this.selection,
      this.viewport,
      this.events
    );

    this.context = {
      apiVersion: "1",
      commands: this.commands,
      toolbar: this.toolbar,
      panels: this.panels,
      tools: this.tools,
      selection: this.selection,
      scene: this.sceneDocuments,
      viewport: this.viewport,
      objects: this.objects,
      transforms: this.transforms,
      events: this.events
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
      this.pluginManager.onDidChange(() => {
        this.events.emit("edison.plugins.changed", { plugins: this.pluginManager.listInstalledPlugins() });
      })
    );

    this.canvas.addEventListener("pointerdown", this.onPointerDown);
    this.canvas.addEventListener("pointermove", this.onPointerMove);
    window.addEventListener("pointerup", this.onPointerUp);
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

      this.selection.clear();
      await this.viewport.loadScene(loaded.option, loaded.descriptor);
      this.events.emit("edison.message", { text: "Scene reloaded." });
    } catch (error) {
      this.events.emit("edison.message", { text: error instanceof Error ? error.message : String(error) });
    }
  }

  public dispose(): void {
    this.canvas.removeEventListener("pointerdown", this.onPointerDown);
    this.canvas.removeEventListener("pointermove", this.onPointerMove);
    window.removeEventListener("pointerup", this.onPointerUp);
    for (const dispose of this.disposers.splice(0)) {
      dispose();
    }
    void this.pluginManager.dispose();
    this.tools.dispose();
    this.panels.dispose();
    this.toolbar.dispose();
    this.commands.dispose();
    this.selection.dispose();
    this.viewport.dispose();
    this.events.clear();
    void this.engine;
  }

  private applyToolCursor(): void {
    this.canvas.style.cursor = this.tools.getActiveTool()?.cursor ?? "default";
  }
}
