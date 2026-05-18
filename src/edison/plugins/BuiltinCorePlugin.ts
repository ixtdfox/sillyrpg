import type { EdisonPlugin, EdisonPluginContext } from "./EdisonPlugin";
import type { EdisonPluginManifest } from "./EdisonPluginManifest";
import type { EdisonPluginZipInstallResult } from "./EdisonPluginZipInstaller";
import { createDeleteTool } from "../tools/DeleteTool";
import { createMoveTool } from "../tools/MoveTool";
import { createRotateTool } from "../tools/RotateTool";
import { createSelectTool } from "../tools/SelectTool";
import { HierarchyPanel } from "../ui/panels/HierarchyPanel";
import { InspectorPanel } from "../ui/panels/InspectorPanel";
import { ModelsPanel } from "../ui/panels/ModelsPanel";
import { SceneViewPanel } from "../ui/panels/SceneViewPanel";

export interface BuiltinCorePluginOptions {
  readonly installPluginZip: (file: File) => Promise<EdisonPluginZipInstallResult>;
  readonly onBackToMenu: () => void;
  readonly reloadSceneContent: () => Promise<void>;
}

export class BuiltinCorePlugin implements EdisonPlugin {
  public readonly manifest: EdisonPluginManifest = {
    id: "edison.core",
    name: "Edison Core",
    version: "0.1.0",
    author: "SillyRPG",
    description: "Core Edison editor shell, layout, tools, commands, and plugin manager.",
    entry: "builtin",
    edisonApiVersion: "1"
  };

  private readonly disposers: Array<() => void> = [];

  public constructor(private readonly options: BuiltinCorePluginOptions) {}

  public activate(context: EdisonPluginContext): void {
    this.restoreEditorPreferences(context);
    this.registerCommands(context);
    this.registerToolbar(context);
    this.registerTools(context);
    this.registerPanels(context);
  }

  public deactivate(): void {
    for (const dispose of this.disposers.splice(0)) {
      dispose();
    }
  }

  private registerCommands(context: EdisonPluginContext): void {
    this.disposers.push(
      context.commands.register({
        id: "edison.save",
        title: "Save",
        execute: async () => {
          await context.scene.save();
        },
        isEnabled: () => context.scene.getSnapshot().descriptor !== null
      }),
      context.commands.register({
        id: "edison.exportJson",
        title: "Export JSON",
        execute: () => context.scene.exportJson(),
        isEnabled: () => context.scene.getSnapshot().descriptor !== null
      }),
      context.commands.register({
        id: "edison.reload",
        title: "Reload",
        execute: this.options.reloadSceneContent,
        isEnabled: () => context.scene.getSnapshot().option !== null
      }),
      context.commands.register({
        id: "edison.undo",
        title: "Undo",
        execute: () => undefined,
        isEnabled: () => false
      }),
      context.commands.register({
        id: "edison.redo",
        title: "Redo",
        execute: () => undefined,
        isEnabled: () => false
      }),
      context.commands.register({
        id: "edison.frameScene",
        title: "Fit View",
        execute: () => context.viewport.frameScene()
      }),
      context.commands.register({
        id: "edison.toggleGrid",
        title: "Grid",
        execute: () => {
          const nextVisible = !context.viewport.getGridVisible();
          context.viewport.setGridVisible(nextVisible);
          context.preferences.set("edison.viewport.gridVisible", nextVisible);
        }
      }),
      context.commands.register({
        id: "edison.toggleAxes",
        title: "Axes",
        execute: () => {
          const nextVisible = !context.viewport.getAxesVisible();
          context.viewport.setAxesVisible(nextVisible);
          context.preferences.set("edison.viewport.axesVisible", nextVisible);
        }
      }),
      context.commands.register({
        id: "edison.openPluginManager",
        title: "Plugin Manager",
        execute: () => {
          context.events.emit("edison.pluginManager.open", {});
        }
      }),
      context.commands.register({
        id: "edison.installPluginZip",
        title: "Install Plugin from ZIP",
        execute: async () => {
          const input = document.createElement("input");
          input.type = "file";
          input.accept = ".zip";
          input.style.display = "none";
          document.body.appendChild(input);

          const file = await new Promise<File | null>((resolve) => {
            input.addEventListener("change", () => {
              resolve(input.files?.[0] ?? null);
            }, { once: true });
            input.click();
          });

          input.remove();
          if (!file) {
            return;
          }

          const result = await this.options.installPluginZip(file);
          context.events.emit("edison.message", { text: result.message });
        }
      }),
      context.commands.register({
        id: "edison.back",
        title: "Back",
        execute: this.options.onBackToMenu
      }),
      context.commands.register({
        id: "edison.rotateLeft",
        title: "Rotate -90",
        execute: () => context.transforms.rotateSelectedY(-1),
        isEnabled: () => context.selection.getSelectedObjectId() !== null
      }),
      context.commands.register({
        id: "edison.rotateRight",
        title: "Rotate +90",
        execute: () => context.transforms.rotateSelectedY(1),
        isEnabled: () => context.selection.getSelectedObjectId() !== null
      }),
      context.commands.register({
        id: "edison.deleteSelected",
        title: "Delete",
        execute: () => context.transforms.deleteSelected(),
        isEnabled: () => context.selection.getSelectedObjectId() !== null
      })
    );
  }

  private restoreEditorPreferences(context: EdisonPluginContext): void {
    context.viewport.setGridVisible(context.preferences.get("edison.viewport.gridVisible", context.viewport.getGridVisible()));
    context.viewport.setAxesVisible(context.preferences.get("edison.viewport.axesVisible", context.viewport.getAxesVisible()));
  }

  private registerToolbar(context: EdisonPluginContext): void {
    void context;
  }

  private registerTools(context: EdisonPluginContext): void {
    this.disposers.push(
      context.tools.registerTool(createSelectTool()),
      context.tools.registerTool(createMoveTool()),
      context.tools.registerTool(createRotateTool()),
      context.tools.registerTool(createDeleteTool())
    );
    context.tools.setActiveTool("select");
  }

  private registerPanels(context: EdisonPluginContext): void {
    const sceneView = new SceneViewPanel();
    const hierarchy = new HierarchyPanel();
    const inspector = new InspectorPanel();
    const models = new ModelsPanel();

    this.disposers.push(
      context.panels.registerPanel({
        id: "edison.sceneView",
        title: "Scene View",
        slot: "center.sceneView",
        order: 0,
        render: (host, panelContext) => sceneView.render(host, panelContext)
      }),
      context.panels.registerPanel({
        id: "edison.hierarchy",
        title: "Hierarchy",
        slot: "left.hierarchy",
        order: 0,
        render: (host, panelContext) => hierarchy.render(host, panelContext)
      }),
      context.panels.registerPanel({
        id: "edison.inspector",
        title: "Inspector",
        slot: "right.inspector",
        order: 0,
        render: (host, panelContext) => inspector.render(host, panelContext)
      }),
      context.panels.registerPanel({
        id: "edison.models",
        title: "Models",
        slot: "right.plugins",
        order: -1000,
        render: (host, panelContext) => models.render(host, panelContext)
      }),
      () => {
        models.dispose();
      }
    );
  }
}
