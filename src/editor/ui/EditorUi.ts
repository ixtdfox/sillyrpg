import {
  AdvancedDynamicTexture,
  Button,
  Control,
  Rectangle,
  ScrollViewer,
  StackPanel,
  TextBlock
} from "@babylonjs/gui";
import type { Scene } from "@babylonjs/core";
import type { EditorSceneOption } from "../types";

interface EditorUiCallbacks {
  readonly onBackToMenu: () => void;
  readonly onReloadScene: () => void;
  readonly onFrameScene: () => void;
  readonly onToggleGrid: () => void;
  readonly onToggleAxes: () => void;
}

interface EditorStatusViewModel {
  readonly selectedSceneLabel: string;
  readonly selectedSceneId: string;
  readonly assetPath: string;
  readonly loadedMeshCount: number;
  readonly renderableMeshCount: number;
  readonly helperMeshCount: number;
  readonly loadState: string;
  readonly cameraMode: string;
  readonly cameraPosition: string;
  readonly cameraTarget: string;
  readonly errorText: string;
}

/**
 * Babylon GUI for the level editor.
 */
export class EditorUi {
  private readonly texture: AdvancedDynamicTexture;
  private readonly strings: Record<string, string>;
  private readonly sceneButtons: Map<string, Button>;
  private readonly sceneListPanel: StackPanel;
  private readonly toolbarTitle: TextBlock;
  private readonly toolbarScene: TextBlock;
  private readonly statusPrimary: TextBlock;
  private readonly statusSecondary: TextBlock;
  private readonly statusError: TextBlock;
  private readonly gridButton: Button;
  private readonly axesButton: Button;

  public constructor(scene: Scene, strings: Record<string, string>, callbacks: EditorUiCallbacks) {
    this.texture = AdvancedDynamicTexture.CreateFullscreenUI("editor-ui", true, scene);
    this.strings = strings;
    this.sceneButtons = new Map<string, Button>();

    const root = new Rectangle("editor-root");
    root.thickness = 0;
    this.texture.addControl(root);

    const toolbar = new Rectangle("editor-toolbar");
    toolbar.height = "58px";
    toolbar.thickness = 0;
    toolbar.background = "#121923CC";
    toolbar.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
    root.addControl(toolbar);

    const toolbarContent = new StackPanel("editor-toolbar-content");
    toolbarContent.isVertical = false;
    toolbarContent.height = "58px";
    toolbarContent.width = "100%";
    toolbar.addControl(toolbarContent);

    this.toolbarTitle = this.createText("editor-toolbar-title", strings["editor.title"] ?? "Level Editor", "24px", "#F2F5FA");
    this.toolbarTitle.width = "220px";
    this.toolbarTitle.paddingLeft = "18px";
    this.toolbarTitle.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    toolbarContent.addControl(this.toolbarTitle);

    this.toolbarScene = this.createText("editor-toolbar-scene", strings["editor.noSceneLoaded"] ?? "No scene loaded", "18px", "#C5D0DF");
    this.toolbarScene.width = "420px";
    this.toolbarScene.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    toolbarContent.addControl(this.toolbarScene);

    const actions = new StackPanel("editor-toolbar-actions");
    actions.isVertical = false;
    actions.width = "520px";
    actions.height = "58px";
    actions.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_RIGHT;
    toolbar.addControl(actions);

    const frameButton = this.createButton("editor-frame-button", strings["editor.frameScene"] ?? "Frame Scene", callbacks.onFrameScene);
    const reloadButton = this.createButton("editor-reload-button", strings["editor.reloadScene"] ?? "Reload Scene", callbacks.onReloadScene);
    this.gridButton = this.createButton("editor-grid-button", "", callbacks.onToggleGrid);
    this.axesButton = this.createButton("editor-axes-button", "", callbacks.onToggleAxes);
    const backButton = this.createButton("editor-back-button", strings["editor.backToMenu"] ?? "Back to Menu", callbacks.onBackToMenu);

    actions.addControl(frameButton);
    actions.addControl(reloadButton);
    actions.addControl(this.gridButton);
    actions.addControl(this.axesButton);
    actions.addControl(backButton);

    const sidePanel = new Rectangle("editor-side-panel");
    sidePanel.width = "360px";
    sidePanel.thickness = 0;
    sidePanel.background = "#111822D9";
    sidePanel.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_RIGHT;
    sidePanel.verticalAlignment = Control.VERTICAL_ALIGNMENT_CENTER;
    sidePanel.top = "29px";
    root.addControl(sidePanel);

    const sideContent = new StackPanel("editor-side-content");
    sideContent.width = "100%";
    sideContent.height = "100%";
    sideContent.paddingTop = "18px";
    sideContent.paddingBottom = "90px";
    sidePanel.addControl(sideContent);

    const selectorTitle = this.createText("editor-selector-title", strings["editor.sceneSelector"] ?? "Scenes", "22px", "#F2F5FA");
    selectorTitle.height = "34px";
    sideContent.addControl(selectorTitle);

    const selectorHelp = this.createText("editor-selector-help", "", "14px", "#95A4B9");
    selectorHelp.height = "44px";
    selectorHelp.textWrapping = true;
    selectorHelp.text = "Select a scene chunk to inspect. Labels are localized; ids and paths stay visible for debugging.";
    sideContent.addControl(selectorHelp);

    const sceneListContainer = new Rectangle("editor-scene-list-container");
    sceneListContainer.width = "320px";
    sceneListContainer.height = "620px";
    sceneListContainer.thickness = 0;
    sceneListContainer.background = "#0D142000";
    sideContent.addControl(sceneListContainer);

    const scrollViewer = new ScrollViewer("editor-scene-scroll");
    scrollViewer.width = "320px";
    scrollViewer.height = "620px";
    scrollViewer.thickness = 0;
    scrollViewer.barColor = "#516A8F";
    scrollViewer.background = "#0D142000";
    sceneListContainer.addControl(scrollViewer);

    this.sceneListPanel = new StackPanel("editor-scene-list");
    this.sceneListPanel.width = "100%";
    this.sceneListPanel.spacing = 8;
    scrollViewer.addControl(this.sceneListPanel);

    const statusBar = new Rectangle("editor-status-bar");
    statusBar.height = "94px";
    statusBar.thickness = 0;
    statusBar.background = "#101722E6";
    statusBar.verticalAlignment = Control.VERTICAL_ALIGNMENT_BOTTOM;
    root.addControl(statusBar);

    const statusContent = new StackPanel("editor-status-content");
    statusContent.width = "100%";
    statusContent.height = "100%";
    statusContent.paddingLeft = "16px";
    statusContent.paddingTop = "10px";
    statusContent.paddingRight = "16px";
    statusBar.addControl(statusContent);

    this.statusPrimary = this.createText("editor-status-primary", "", "15px", "#D6DFEC");
    this.statusPrimary.height = "24px";
    this.statusSecondary = this.createText("editor-status-secondary", "", "14px", "#9FB0C7");
    this.statusSecondary.height = "24px";
    this.statusError = this.createText("editor-status-error", "", "14px", "#F48C8C");
    this.statusError.height = "40px";
    this.statusError.textWrapping = true;
    statusContent.addControl(this.statusPrimary);
    statusContent.addControl(this.statusSecondary);
    statusContent.addControl(this.statusError);

    this.setGridVisible(true);
    this.setAxesVisible(true);
  }

  public setSceneOptions(options: readonly EditorSceneOption[], selectedId: string | null): void {
    this.sceneListPanel.clearControls();
    this.sceneButtons.clear();

    if (options.length === 0) {
      const emptyState = this.createText(
        "editor-empty-state",
        this.strings["editor.emptyRegistry"] ?? "No scenes found in location data",
        "16px",
        "#95A4B9"
      );
      emptyState.height = "48px";
      emptyState.textWrapping = true;
      this.sceneListPanel.addControl(emptyState);
      return;
    }

    for (const option of options) {
      const button = this.createButton(option.id, `${option.label}\n${option.assetUrl}`, () => {
        this.updateSelectedScene(option.id);
        this.toolbarScene.text = option.label;
      });
      const label = button.children[0] as TextBlock;
      label.fontSize = 14;
      label.textWrapping = true;
      button.height = "72px";
      button.width = "320px";
      this.sceneButtons.set(option.id, button);
      this.sceneListPanel.addControl(button);
    }

    this.updateSelectedScene(selectedId);
  }

  public bindSceneOptionActions(options: readonly EditorSceneOption[], onSelectScene: (sceneId: string) => void): void {
    for (const option of options) {
      const button = this.sceneButtons.get(option.id);
      button?.onPointerUpObservable.clear();
      button?.onPointerUpObservable.add(() => {
        this.updateSelectedScene(option.id);
        this.toolbarScene.text = option.label;
        onSelectScene(option.id);
      });
    }
  }

  public updateSelectedScene(selectedId: string | null): void {
    for (const [sceneId, button] of this.sceneButtons.entries()) {
      const isSelected = sceneId === selectedId;
      button.background = isSelected ? "#233247" : "#162231";
      button.color = isSelected ? "#F3D87A" : "#49607E";
      button.thickness = isSelected ? 2 : 1;
      const label = button.children[0] as TextBlock;
      label.color = isSelected ? "#FFF7D4" : "#DBE4F1";
    }
  }

  public setSceneHeader(label: string): void {
    this.toolbarScene.text = label;
  }

  public setGridVisible(isVisible: boolean): void {
    (this.gridButton.children[0] as TextBlock).text = `${this.strings["editor.showGrid"] ?? "Show Grid"}: ${isVisible ? "On" : "Off"}`;
  }

  public setAxesVisible(isVisible: boolean): void {
    (this.axesButton.children[0] as TextBlock).text = `${this.strings["editor.showAxes"] ?? "Show Axes"}: ${isVisible ? "On" : "Off"}`;
  }

  public setStatus(viewModel: EditorStatusViewModel): void {
    this.statusPrimary.text =
      `${this.strings["editor.loadedScene"] ?? "Loaded Scene"}: ${viewModel.selectedSceneLabel} ` +
      `| state=${viewModel.loadState} | meshes=${viewModel.loadedMeshCount} | renderable=${viewModel.renderableMeshCount} | helpers=${viewModel.helperMeshCount} | camera=${viewModel.cameraMode}`;
    this.statusSecondary.text =
      `sceneId=${viewModel.selectedSceneId || "none"} | asset=${viewModel.assetPath || "none"} | ` +
      `pos=${viewModel.cameraPosition} | target=${viewModel.cameraTarget}`;
    this.statusError.text = viewModel.errorText;
  }

  public dispose(): void {
    this.texture.dispose();
  }

  private createButton(name: string, text: string, onClick: () => void): Button {
    const button = Button.CreateSimpleButton(name, text);
    button.width = "100px";
    button.height = "36px";
    button.thickness = 1;
    button.color = "#49607E";
    button.background = "#162231";
    button.cornerRadius = 4;
    button.paddingLeft = "8px";
    button.paddingRight = "8px";
    button.onPointerUpObservable.add(onClick);

    const label = button.children[0] as TextBlock;
    label.fontSize = 14;
    label.color = "#DBE4F1";
    label.textWrapping = true;
    return button;
  }

  private createText(name: string, text: string, fontSize: string, color: string): TextBlock {
    const block = new TextBlock(name, text);
    block.fontSize = fontSize;
    block.color = color;
    block.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    return block;
  }
}
