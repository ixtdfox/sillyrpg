import type { SceneObjectDescriptor } from "../../core/world/scene/SceneDescriptor";
import type {
  TerrainGeneratorPanelCallbacks,
  TerrainGeneratorPanelViewModel
} from "../terrain/EditorTerrainTypes";
import type { TerrainToolsPanelCallbacks, TerrainToolsPanelViewModel } from "../terrain/tools/EditorTerrainToolState";
import type { EditorBrowserTab, EditorBuildingAssetOption, EditorSceneOption } from "../types";
import type { EditorMoveAxisMode } from "../state/EditorMoveAxisMode";
import type { EditorTransformMode } from "../state/EditorTransformMode";
import { editorIconSvg, type EditorIconName } from "./EditorIcons";
import { TerrainGeneratorPanel } from "./TerrainGeneratorPanel";
import { TerrainToolsPanel } from "./TerrainToolsPanel";

interface EditorUiCallbacks {
  readonly onBackToMenu: () => void;
  readonly onReloadScene: () => void;
  readonly onFrameScene: () => void;
  readonly onToggleGrid: () => void;
  readonly onToggleAxes: () => void;
  readonly onSelectTab: (tab: EditorBrowserTab) => void;
  readonly onSelectScene: (sceneId: string) => void;
  readonly onSelectBuilding: (buildingId: string) => void;
  readonly onAddTerrain: () => void;
  readonly terrainPanel: TerrainGeneratorPanelCallbacks;
  readonly terrainToolsPanel: TerrainToolsPanelCallbacks;
  readonly onSetTransformMode: (mode: EditorTransformMode) => void;
  readonly onSetMoveAxisMode: (mode: EditorMoveAxisMode) => void;
  readonly onRotateSelected: (direction: -1 | 1) => void;
  readonly onDeleteSelected: () => void;
  readonly onSaveScene: () => void;
  readonly onExportScene: () => void;
}

interface ScenePanelViewModel {
  readonly sceneLabel: string;
  readonly descriptorPath: string;
  readonly terrainStatus: string;
  readonly objectCount: number;
  readonly dirty: boolean;
  readonly message: string;
}

interface IconButtonOptions {
  readonly className: string;
  readonly label: string;
  readonly tooltip?: string;
  readonly icon: EditorIconName;
  readonly iconSize?: number;
  readonly compact?: boolean;
  readonly onClick: () => void;
}

interface TabButtonState {
  readonly button: HTMLButtonElement;
  readonly panel: HTMLElement;
}

export class EditorUi {
  private readonly strings: Record<string, string>;
  private readonly callbacks: EditorUiCallbacks;
  private readonly root: HTMLDivElement;
  private readonly styleElement: HTMLStyleElement;
  private readonly sceneList: HTMLDivElement;
  private readonly buildingGrid: HTMLDivElement;
  private readonly terrainPanelHost: HTMLDivElement;
  private readonly terrainPanel: TerrainGeneratorPanel;
  private readonly terrainToolsPanel: TerrainToolsPanel;
  private readonly inspector: HTMLDivElement;
  private readonly sceneInfo: HTMLDivElement;
  private readonly messageBadge: HTMLDivElement;
  private readonly dirtyBadge: HTMLDivElement;
  private readonly gridButton: HTMLButtonElement;
  private readonly axesButton: HTMLButtonElement;
  private readonly addTerrainButton: HTMLButtonElement;
  private readonly selectToolButton: HTMLButtonElement;
  private readonly moveToolButton: HTMLButtonElement;
  private readonly moveAxisStrip: HTMLDivElement;
  private readonly moveAxisButtons: Record<EditorMoveAxisMode, HTMLButtonElement>;
  private readonly sceneButtons: Map<string, HTMLButtonElement>;
  private readonly buildingCards: Map<string, HTMLButtonElement>;
  private readonly tabs: Record<EditorBrowserTab, TabButtonState>;

  public constructor(strings: Record<string, string>, callbacks: EditorUiCallbacks) {
    this.strings = strings;
    this.callbacks = callbacks;
    this.sceneButtons = new Map();
    this.buildingCards = new Map();

    this.styleElement = document.createElement("style");
    this.styleElement.textContent = buildEditorCss();
    document.head.appendChild(this.styleElement);

    this.root = document.createElement("div");
    this.root.className = "editor-shell";

    const toolbar = document.createElement("div");
    toolbar.className = "editor-toolbar";
    this.root.appendChild(toolbar);

    const titleBlock = document.createElement("div");
    titleBlock.className = "editor-toolbar__title";
    titleBlock.innerHTML = `
      <div class="editor-kicker">${escapeHtml(this.strings["editor.title"] ?? "Level Editor")}</div>
      <div class="editor-subtitle">JSON scene workflow</div>
    `;
    toolbar.appendChild(titleBlock);

    const toolbarButtons = document.createElement("div");
    toolbarButtons.className = "editor-toolbar__buttons";
    toolbar.appendChild(toolbarButtons);

    toolbarButtons.appendChild(
      this.createIconButton({
        className: "editor-toolbar-button",
        label: "Save Scene",
        tooltip: "Save scene descriptor",
        icon: "save",
        onClick: callbacks.onSaveScene
      })
    );
    toolbarButtons.appendChild(
      this.createIconButton({
        className: "editor-toolbar-button",
        label: "Export JSON",
        tooltip: "Export current scene JSON",
        icon: "export",
        onClick: callbacks.onExportScene
      })
    );
    toolbarButtons.appendChild(
      this.createIconButton({
        className: "editor-toolbar-button",
        label: "Reload Scene",
        tooltip: "Reload current scene from disk",
        icon: "reload",
        onClick: callbacks.onReloadScene
      })
    );
    toolbarButtons.appendChild(
      this.createIconButton({
        className: "editor-toolbar-button",
        label: "Undo",
        tooltip: "Undo is not implemented yet",
        icon: "undo",
        onClick: () => void 0
      })
    );
    toolbarButtons.appendChild(
      this.createIconButton({
        className: "editor-toolbar-button",
        label: "Redo",
        tooltip: "Redo is not implemented yet",
        icon: "redo",
        onClick: () => void 0
      })
    );
    toolbarButtons.appendChild(
      this.createIconButton({
        className: "editor-toolbar-button",
        label: "Frame Scene",
        tooltip: "Frame loaded scene",
        icon: "frame",
        onClick: callbacks.onFrameScene
      })
    );
    this.gridButton = this.createIconButton({
      className: "editor-toolbar-button",
      label: "Grid On",
      tooltip: "Toggle grid overlay",
      icon: "grid",
      onClick: callbacks.onToggleGrid
    });
    toolbarButtons.appendChild(this.gridButton);
    this.axesButton = this.createIconButton({
      className: "editor-toolbar-button",
      label: "Axes On",
      tooltip: "Toggle world axes",
      icon: "axes",
      onClick: callbacks.onToggleAxes
    });
    toolbarButtons.appendChild(this.axesButton);
    toolbarButtons.appendChild(
      this.createIconButton({
        className: "editor-toolbar-button",
        label: "Camera",
        tooltip: "Camera tools placeholder",
        icon: "camera",
        onClick: () => void 0
      })
    );
    toolbarButtons.appendChild(
      this.createIconButton({
        className: "editor-toolbar-button",
        label: "Settings",
        tooltip: "Editor settings placeholder",
        icon: "settings",
        onClick: () => void 0
      })
    );
    toolbarButtons.appendChild(
      this.createIconButton({
        className: "editor-toolbar-button",
        label: this.strings["editor.backToMenuShort"] ?? "Back",
        tooltip: "Return to main menu",
        icon: "back",
        onClick: callbacks.onBackToMenu
      })
    );

    const main = document.createElement("div");
    main.className = "editor-main";
    this.root.appendChild(main);

    const leftColumn = document.createElement("div");
    leftColumn.className = "editor-left-column";
    main.appendChild(leftColumn);

    const toolRail = document.createElement("div");
    toolRail.className = "editor-tool-rail";
    leftColumn.appendChild(toolRail);

    this.selectToolButton = this.createIconButton({
      className: "editor-tool-button",
      label: "Select",
      tooltip: "Select object",
      icon: "select",
      compact: true,
      onClick: () => callbacks.onSetTransformMode("select")
    });
    toolRail.appendChild(this.selectToolButton);

    this.moveToolButton = this.createIconButton({
      className: "editor-tool-button",
      label: "Move",
      tooltip: "Move selected object",
      icon: "move",
      compact: true,
      onClick: () => callbacks.onSetTransformMode("move")
    });
    toolRail.appendChild(this.moveToolButton);

    this.moveAxisStrip = document.createElement("div");
    this.moveAxisStrip.className = "editor-move-axis-strip";
    this.moveAxisButtons = {
      xz: this.createMoveAxisButton("XZ", "Move on X/Z plane", () => callbacks.onSetMoveAxisMode("xz")),
      x: this.createMoveAxisButton("X", "Move on X axis", () => callbacks.onSetMoveAxisMode("x")),
      z: this.createMoveAxisButton("Z", "Move on Z axis", () => callbacks.onSetMoveAxisMode("z")),
      y: this.createMoveAxisButton("Y", "Move on Y axis", () => callbacks.onSetMoveAxisMode("y"))
    };
    for (const mode of ["xz", "x", "z", "y"] as const) {
      this.moveAxisStrip.appendChild(this.moveAxisButtons[mode]);
    }
    toolRail.appendChild(this.moveAxisStrip);

    toolRail.appendChild(
      this.createIconButton({
        className: "editor-tool-button",
        label: "Rotate -90",
        tooltip: "Rotate selected object -90 degrees",
        icon: "rotateLeft",
        compact: true,
        onClick: () => callbacks.onRotateSelected(-1)
      })
    );
    toolRail.appendChild(
      this.createIconButton({
        className: "editor-tool-button",
        label: "Rotate +90",
        tooltip: "Rotate selected object +90 degrees",
        icon: "rotateRight",
        compact: true,
        onClick: () => callbacks.onRotateSelected(1)
      })
    );
    toolRail.appendChild(
      this.createIconButton({
        className: "editor-tool-button",
        label: "Delete",
        tooltip: "Delete selected object",
        icon: "delete",
        compact: true,
        onClick: callbacks.onDeleteSelected
      })
    );
    this.addTerrainButton = this.createIconButton({
      className: "editor-tool-button",
      label: "Terrain",
      tooltip: "Open the terrain generator",
      icon: "terrain",
      compact: true,
      onClick: callbacks.onAddTerrain
    });
    toolRail.appendChild(this.addTerrainButton);

    const viewportHint = document.createElement("div");
    viewportHint.className = "editor-viewport-hint";
    viewportHint.innerHTML = `
      <div>Drag building cards into the viewport to place them.</div>
      <div>Use <strong>Move</strong> to drag selected objects on snapped X/Z or Y axes.</div>
    `;
    leftColumn.appendChild(viewportHint);

    const sidePanel = document.createElement("aside");
    sidePanel.className = "editor-sidepanel";
    main.appendChild(sidePanel);

    const tabRow = document.createElement("div");
    tabRow.className = "editor-tabs";
    sidePanel.appendChild(tabRow);

    this.sceneList = document.createElement("div");
    this.sceneList.className = "editor-scrollpanel";
    sidePanel.appendChild(this.sceneList);

    this.terrainPanelHost = document.createElement("div");
    this.terrainPanelHost.className = "editor-scrollpanel editor-terrain-stack";
    this.terrainPanel = new TerrainGeneratorPanel(callbacks.terrainPanel);
    this.terrainToolsPanel = new TerrainToolsPanel(callbacks.terrainToolsPanel);
    this.terrainPanelHost.appendChild(this.terrainPanel.getElement());
    this.terrainPanelHost.appendChild(this.terrainToolsPanel.getElement());
    sidePanel.appendChild(this.terrainPanelHost);

    this.buildingGrid = document.createElement("div");
    this.buildingGrid.className = "editor-buildings editor-scrollpanel";
    sidePanel.appendChild(this.buildingGrid);

    this.inspector = document.createElement("div");
    this.inspector.className = "editor-card editor-card--compact editor-scrollpanel";
    sidePanel.appendChild(this.inspector);

    this.sceneInfo = document.createElement("div");
    this.sceneInfo.className = "editor-card editor-card--compact editor-scrollpanel";
    sidePanel.appendChild(this.sceneInfo);

    this.tabs = {
      scenes: {
        button: this.createTabButton(
          this.strings["editor.sceneSelector"] ?? "Scene",
          "scene",
          "Browse scene descriptors",
          () => {
            this.setActiveTab("scenes");
            callbacks.onSelectTab("scenes");
          }
        ),
        panel: this.sceneList
      },
      terrain: {
        button: this.createTabButton("Terrain", "terrain", "Generate and preview terrain", () => {
          this.setActiveTab("terrain");
          callbacks.onSelectTab("terrain");
        }),
        panel: this.terrainPanelHost
      },
      buildings: {
        button: this.createTabButton(
          "Build",
          "building",
          "Browse placeable buildings",
          () => {
            this.setActiveTab("buildings");
            callbacks.onSelectTab("buildings");
          }
        ),
        panel: this.buildingGrid
      },
      inspector: {
        button: this.createTabButton("Inspect", "inspector", "Inspect the selected object", () => {
          this.setActiveTab("inspector");
          callbacks.onSelectTab("inspector");
        }),
        panel: this.inspector
      }
    };

    tabRow.appendChild(this.tabs.scenes.button);
    tabRow.appendChild(this.tabs.terrain.button);
    tabRow.appendChild(this.tabs.buildings.button);
    tabRow.appendChild(this.tabs.inspector.button);

    const footer = document.createElement("div");
    footer.className = "editor-footer";
    this.dirtyBadge = document.createElement("div");
    this.dirtyBadge.className = "editor-badge";
    footer.appendChild(this.dirtyBadge);
    this.messageBadge = document.createElement("div");
    this.messageBadge.className = "editor-badge editor-badge--muted";
    footer.appendChild(this.messageBadge);
    sidePanel.appendChild(footer);

    document.body.appendChild(this.root);
    this.setActiveTab("buildings");
    this.setScenePanel({
      sceneLabel: "No scene loaded",
      descriptorPath: "",
      terrainStatus: "none",
      objectCount: 0,
      dirty: false,
      message: ""
    });
    this.setSelectedObject(null);
    this.setTerrainPanel({
      enabled: false,
      descriptor: null,
      presets: [],
      stats: null,
      dirty: false,
      draftDirty: false,
      appliedSummary: "none"
    });
    this.setTerrainToolsPanel({
      enabled: false,
      hasTerrain: false,
      activeTool: "raise",
      brush: {
        shape: "circle",
        radius: 4,
        strength: 10,
        falloff: 0.65
      },
      targetHeight: 0,
      snapHeightStep: 1,
      edited: false,
      stats: null,
      message: ""
    });
    this.setTransformMode("select");
    this.setMoveAxisMode("xz");
  }

  public setSceneOptions(options: readonly EditorSceneOption[], selectedId: string | null): void {
    this.sceneButtons.clear();
    this.sceneList.replaceChildren();

    this.sceneList.appendChild(this.sceneInfo);

    if (options.length === 0) {
      this.sceneList.appendChild(this.createEmptyState("No scenes found in location data."));
      return;
    }

    for (const option of options) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "editor-list-item";
      button.title = `Open ${option.label}`;
      button.setAttribute("aria-label", `Open scene ${option.label}`);
      button.innerHTML = `
        <div class="editor-list-item__title">${escapeHtml(option.label)}</div>
        <div class="editor-list-item__meta">${escapeHtml(option.rawDescriptorPath)}</div>
      `;
      button.addEventListener("click", () => this.callbacks.onSelectScene(option.id));
      this.sceneList.appendChild(button);
      this.sceneButtons.set(option.id, button);
    }

    this.updateSelectedScene(selectedId);
  }

  public setBuildingOptions(options: readonly EditorBuildingAssetOption[], selectedId: string | null): void {
    this.buildingCards.clear();
    this.buildingGrid.replaceChildren();

    const browserHeader = document.createElement("div");
    browserHeader.className = "editor-browser-toolbar";
    browserHeader.innerHTML = `
      <div class="editor-browser-toolbar__search" aria-hidden="true">${editorIconSvg("search", 18)}</div>
      <div class="editor-browser-toolbar__title">Building Browser</div>
    `;
    this.buildingGrid.appendChild(browserHeader);

    if (options.length === 0) {
      this.buildingGrid.appendChild(
        this.createEmptyState("No building models found. Export .glb or .gltf files into assets/models/buildings and reload the editor.")
      );
      return;
    }

    for (const option of options) {
      const card = document.createElement("button");
      card.type = "button";
      card.className = "editor-building-card";
      card.draggable = true;
      card.title = `Place ${option.title}`;
      card.setAttribute("aria-label", `Place building ${option.title}`);
      card.innerHTML = `
        <div class="editor-building-card__thumb" data-thumb="${escapeHtml(option.id)}">
          <span>Preview</span>
        </div>
        <div class="editor-building-card__body">
          <div class="editor-building-card__title">${escapeHtml(option.title)}</div>
          <div class="editor-building-card__meta">${escapeHtml(option.rawModelPath)}</div>
          <div class="editor-building-card__meta">${escapeHtml(option.directory || "/")} · ${escapeHtml(option.tags.join(", ") || "No tags")}</div>
        </div>
      `;
      card.addEventListener("click", () => this.callbacks.onSelectBuilding(option.id));
      card.addEventListener("dragstart", (event) => {
        event.dataTransfer?.setData("application/x-sillyrpg-building-asset-id", option.id);
        event.dataTransfer?.setData("text/plain", option.id);
      });
      this.buildingGrid.appendChild(card);
      this.buildingCards.set(option.id, card);
    }

    this.updateSelectedBuilding(selectedId);
  }

  public setBuildingThumbnail(buildingId: string, thumbnailUrl: string | null): void {
    const card = this.buildingCards.get(buildingId);
    if (!card) {
      return;
    }

    const thumb = card.querySelector<HTMLElement>(`[data-thumb="${buildingId}"]`);
    if (!thumb) {
      return;
    }

    if (!thumbnailUrl) {
      thumb.style.backgroundImage = "";
      thumb.classList.remove("editor-building-card__thumb--ready");
      thumb.innerHTML = "<span>Preview unavailable</span>";
      return;
    }

    thumb.innerHTML = "";
    thumb.style.backgroundImage = `url("${thumbnailUrl}")`;
    thumb.classList.add("editor-building-card__thumb--ready");
  }

  public updateSelectedScene(selectedId: string | null): void {
    for (const [sceneId, button] of this.sceneButtons.entries()) {
      button.classList.toggle("is-selected", sceneId === selectedId);
    }
  }

  public updateSelectedBuilding(selectedId: string | null): void {
    for (const [buildingId, card] of this.buildingCards.entries()) {
      card.classList.toggle("is-selected", buildingId === selectedId);
    }
  }

  public setScenePanel(viewModel: ScenePanelViewModel): void {
    this.sceneInfo.innerHTML = `
      <div class="editor-card__title">${editorIconSvg("scene", 18)}<span>Scene</span></div>
      <div class="editor-card__line"><strong>${escapeHtml(viewModel.sceneLabel)}</strong></div>
      <div class="editor-card__line">Descriptor: ${escapeHtml(viewModel.descriptorPath || "none")}</div>
      <div class="editor-card__line">Terrain: ${escapeHtml(viewModel.terrainStatus)}</div>
      <div class="editor-card__line">Objects: ${viewModel.objectCount}</div>
    `;
    this.dirtyBadge.textContent = viewModel.dirty ? "Unsaved changes" : "Saved";
    this.dirtyBadge.classList.toggle("is-dirty", viewModel.dirty);
    this.messageBadge.textContent = viewModel.message || "Selection only for browser cards; drag into viewport to place.";
    this.addTerrainButton.disabled = false;
  }

  public setTerrainPanel(viewModel: TerrainGeneratorPanelViewModel): void {
    this.terrainPanel.setViewModel(viewModel);
  }

  public setTerrainToolsPanel(viewModel: TerrainToolsPanelViewModel): void {
    this.terrainToolsPanel.setViewModel(viewModel);
  }

  public setSelectedObject(object: SceneObjectDescriptor | null): void {
    if (!object) {
      this.inspector.innerHTML = `
        <div class="editor-card__title">${editorIconSvg("inspector", 18)}<span>Inspector</span></div>
        <div class="editor-card__line">No object selected. Drag a building from the browser into the viewport.</div>
      `;
      return;
    }

    const rotationDegrees = normalizeQuarterTurnDegrees(object.rotation[1]);
    this.inspector.innerHTML = `
      <div class="editor-card__title">${editorIconSvg("inspector", 18)}<span>Inspector</span></div>
      <div class="editor-card__line">id: ${escapeHtml(object.id)}</div>
      <div class="editor-card__line">type: ${escapeHtml(object.type)}</div>
      <div class="editor-card__line">asset: ${escapeHtml(object.asset)}</div>
      <div class="editor-card__section-label">Position</div>
      <div class="editor-card__line">X: ${formatScalar(object.position[0])}</div>
      <div class="editor-card__line">Y: ${formatScalar(object.position[1])}</div>
      <div class="editor-card__line">Z: ${formatScalar(object.position[2])}</div>
      <div class="editor-card__section-label">Rotation</div>
      <div class="editor-card__line">Y: ${rotationDegrees}°</div>
      <div class="editor-card__section-label">Scale</div>
      <div class="editor-card__line">X: ${formatScalar(object.scale[0])}</div>
      <div class="editor-card__line">Y: ${formatScalar(object.scale[1])}</div>
      <div class="editor-card__line">Z: ${formatScalar(object.scale[2])}</div>
    `;
  }

  public setActiveTab(tab: EditorBrowserTab): void {
    for (const [tabName, state] of Object.entries(this.tabs) as [EditorBrowserTab, TabButtonState][]) {
      const isActive = tabName === tab;
      state.button.classList.toggle("is-active", isActive);
      state.panel.style.display = isActive ? "grid" : "none";
    }
  }

  public setGridVisible(isVisible: boolean): void {
    this.setButtonLabel(this.gridButton, `Grid ${isVisible ? "On" : "Off"}`, `Toggle grid overlay. Grid is ${isVisible ? "on" : "off"}.`);
    this.gridButton.classList.toggle("is-active", isVisible);
  }

  public setAxesVisible(isVisible: boolean): void {
    this.setButtonLabel(this.axesButton, `Axes ${isVisible ? "On" : "Off"}`, `Toggle world axes. Axes are ${isVisible ? "on" : "off"}.`);
    this.axesButton.classList.toggle("is-active", isVisible);
  }

  public setTransformMode(mode: EditorTransformMode): void {
    this.selectToolButton.classList.toggle("is-active", mode === "select");
    this.moveToolButton.classList.toggle("is-active", mode === "move");
    this.moveAxisStrip.classList.toggle("is-visible", mode === "move");
  }

  public setMoveAxisMode(mode: EditorMoveAxisMode): void {
    for (const [axisMode, button] of Object.entries(this.moveAxisButtons) as [EditorMoveAxisMode, HTMLButtonElement][]) {
      button.classList.toggle("is-active", axisMode === mode);
    }
  }

  public dispose(): void {
    this.root.remove();
    this.styleElement.remove();
  }

  private createIconButton(options: IconButtonOptions): HTMLButtonElement {
    const button = document.createElement("button");
    button.type = "button";
    button.className = options.className;
    button.title = options.tooltip ?? options.label;
    button.setAttribute("aria-label", options.label);
    button.innerHTML = `
      <span class="editor-button__icon" aria-hidden="true">${editorIconSvg(options.icon, options.iconSize ?? 20)}</span>
      <span class="editor-button__label${options.compact ? " editor-button__label--compact" : ""}">${escapeHtml(options.label)}</span>
    `;
    button.addEventListener("click", options.onClick);
    return button;
  }

  private createTabButton(label: string, icon: EditorIconName, tooltip: string, onClick: () => void): HTMLButtonElement {
    const button = this.createIconButton({
      className: "editor-tab",
      label,
      tooltip,
      icon,
      compact: false,
      iconSize: 18,
      onClick
    });
    button.setAttribute("role", "tab");
    return button;
  }

  private createMoveAxisButton(label: string, tooltip: string, onClick: () => void): HTMLButtonElement {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "editor-move-axis-button";
    button.title = tooltip;
    button.setAttribute("aria-label", tooltip);
    button.textContent = label;
    button.addEventListener("click", onClick);
    return button;
  }

  private createEmptyState(text: string): HTMLDivElement {
    const emptyState = document.createElement("div");
    emptyState.className = "editor-empty";
    emptyState.textContent = text;
    return emptyState;
  }

  private setButtonLabel(button: HTMLButtonElement, label: string, tooltip: string): void {
    button.title = tooltip;
    button.setAttribute("aria-label", label);
    const labelNode = button.querySelector<HTMLElement>(".editor-button__label");
    if (labelNode) {
      labelNode.textContent = label;
    }
  }
}

function formatScalar(value: number): string {
  return Number.isInteger(value) ? `${value}` : value.toFixed(2);
}

function normalizeQuarterTurnDegrees(radians: number): number {
  const normalized = ((radians % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
  return Math.round((normalized * 180) / Math.PI);
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function buildEditorCss(): string {
  return `
    .editor-shell {
      position: fixed;
      inset: 0;
      pointer-events: none;
      color: #f3f5f7;
      font-family: "Trebuchet MS", "Segoe UI", sans-serif;
      z-index: 20;
    }
    .editor-toolbar {
      pointer-events: auto;
      display: flex;
      justify-content: space-between;
      gap: 16px;
      padding: 16px 18px 0;
    }
    .editor-toolbar__title {
      display: flex;
      flex-direction: column;
      gap: 4px;
      padding: 12px 14px;
      background: rgba(10, 16, 24, 0.84);
      border: 1px solid rgba(136, 164, 190, 0.22);
      border-radius: 16px;
      backdrop-filter: blur(14px);
    }
    .editor-kicker {
      font-size: 20px;
      font-weight: 700;
      letter-spacing: 0.04em;
    }
    .editor-subtitle {
      font-size: 12px;
      color: #9bb1c8;
      text-transform: uppercase;
      letter-spacing: 0.1em;
    }
    .editor-toolbar__buttons {
      pointer-events: auto;
      display: flex;
      flex-wrap: wrap;
      justify-content: flex-end;
      gap: 10px;
      max-width: calc(100vw - 360px);
    }
    .editor-main {
      display: flex;
      justify-content: space-between;
      align-items: stretch;
      height: calc(100vh - 110px);
      padding: 18px;
      gap: 18px;
    }
    .editor-left-column {
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      min-width: 96px;
      gap: 16px;
    }
    .editor-tool-rail,
    .editor-sidepanel {
      pointer-events: auto;
    }
    .editor-tool-rail {
      display: grid;
      gap: 10px;
      padding: 12px;
      width: 92px;
      border-radius: 24px;
      background: linear-gradient(180deg, rgba(14, 22, 30, 0.96), rgba(10, 14, 20, 0.96));
      border: 1px solid rgba(115, 140, 165, 0.2);
      box-shadow: 0 18px 48px rgba(0, 0, 0, 0.32);
      backdrop-filter: blur(16px);
    }
    .editor-viewport-hint {
      max-width: 360px;
      padding: 14px 16px;
      border-radius: 16px;
      background: rgba(11, 17, 25, 0.78);
      border: 1px solid rgba(115, 140, 165, 0.2);
      color: #c6d4e2;
      line-height: 1.45;
      backdrop-filter: blur(10px);
    }
    .editor-sidepanel {
      display: flex;
      flex-direction: column;
      width: 390px;
      height: 100%;
      min-width: 0;
      padding: 14px;
      gap: 12px;
      border-radius: 24px;
      background: linear-gradient(180deg, rgba(14, 22, 30, 0.96), rgba(10, 14, 20, 0.96));
      border: 1px solid rgba(115, 140, 165, 0.2);
      box-shadow: 0 18px 48px rgba(0, 0, 0, 0.32);
      backdrop-filter: blur(16px);
      overflow: hidden;
    }
    .editor-toolbar-button,
    .editor-tool-button,
    .editor-tab,
    .editor-list-item,
    .editor-building-card {
      border: 1px solid rgba(145, 171, 196, 0.18);
      background: rgba(12, 18, 26, 0.9);
      color: #edf2f7;
      border-radius: 14px;
      cursor: pointer;
      transition: transform 120ms ease, border-color 120ms ease, background 120ms ease, box-shadow 120ms ease;
    }
    .editor-toolbar-button:hover,
    .editor-tool-button:hover,
    .editor-tab:hover,
    .editor-list-item:hover,
    .editor-building-card:hover {
      transform: translateY(-1px);
      border-color: rgba(240, 197, 95, 0.45);
    }
    .editor-toolbar-button.is-active,
    .editor-tool-button.is-active,
    .editor-tab.is-active,
    .editor-list-item.is-selected,
    .editor-building-card.is-selected {
      background: linear-gradient(180deg, rgba(55, 85, 112, 0.96), rgba(27, 43, 60, 0.96));
      border-color: rgba(247, 201, 72, 0.58);
      box-shadow: 0 0 0 1px rgba(247, 201, 72, 0.2);
    }
    .editor-toolbar-button:disabled,
    .editor-tool-button:disabled {
      opacity: 0.5;
      cursor: default;
      transform: none;
    }
    .editor-toolbar-button,
    .editor-tab {
      display: inline-flex;
      align-items: center;
      gap: 10px;
      min-height: 44px;
      padding: 11px 14px;
      font-size: 13px;
      backdrop-filter: blur(12px);
    }
    .editor-tool-button {
      display: grid;
      justify-items: center;
      gap: 8px;
      padding: 12px 8px;
      min-height: 74px;
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.08em;
    }
    .editor-button__icon {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 20px;
      height: 20px;
      flex: 0 0 auto;
    }
    .editor-button__label {
      white-space: nowrap;
    }
    .editor-tab .editor-button__label {
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .editor-button__label--compact {
      text-align: center;
      white-space: normal;
      line-height: 1.2;
    }
    .editor-move-axis-strip {
      display: none;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 6px;
    }
    .editor-move-axis-strip.is-visible {
      display: grid;
    }
    .editor-move-axis-button {
      min-width: 0;
      min-height: 32px;
      border-radius: 10px;
      border: 1px solid rgba(145, 171, 196, 0.18);
      background: rgba(12, 18, 26, 0.9);
      color: #edf2f7;
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 0.08em;
      cursor: pointer;
      transition: transform 120ms ease, border-color 120ms ease, background 120ms ease, box-shadow 120ms ease;
    }
    .editor-move-axis-button:hover {
      transform: translateY(-1px);
      border-color: rgba(240, 197, 95, 0.45);
    }
    .editor-move-axis-button.is-active {
      background: linear-gradient(180deg, rgba(55, 85, 112, 0.96), rgba(27, 43, 60, 0.96));
      border-color: rgba(247, 201, 72, 0.58);
      box-shadow: 0 0 0 1px rgba(247, 201, 72, 0.2);
    }
    .editor-tabs {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 8px;
      min-width: 0;
    }
    .editor-tab {
      justify-content: center;
      font-size: 12px;
      font-weight: 700;
      min-width: 0;
      overflow: hidden;
    }
    .editor-scrollpanel {
      min-height: 0;
      overflow: auto;
      gap: 10px;
      padding-right: 4px;
    }
    .editor-buildings {
      align-content: start;
    }
    .editor-browser-toolbar {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 10px 12px;
      border-radius: 14px;
      background: rgba(9, 14, 20, 0.86);
      border: 1px solid rgba(115, 140, 165, 0.16);
      color: #b8c7d6;
    }
    .editor-browser-toolbar__search {
      display: inline-flex;
      color: #8ea5bb;
    }
    .editor-browser-toolbar__title {
      font-size: 12px;
      font-weight: 700;
      letter-spacing: 0.08em;
      text-transform: uppercase;
    }
    .editor-list-item {
      text-align: left;
      padding: 12px;
    }
    .editor-list-item__title {
      font-size: 14px;
      font-weight: 700;
      margin-bottom: 6px;
    }
    .editor-list-item__meta,
    .editor-building-card__meta,
    .editor-card__line {
      font-size: 12px;
      color: #aebdcb;
      line-height: 1.45;
      word-break: break-word;
    }
    .editor-card__section-label {
      margin-top: 8px;
      font-size: 11px;
      font-weight: 700;
      color: #d4dee8;
      text-transform: uppercase;
      letter-spacing: 0.08em;
    }
    .editor-building-card {
      display: grid;
      grid-template-columns: 112px 1fr;
      text-align: left;
      overflow: hidden;
      min-height: 112px;
    }
    .editor-building-card__thumb {
      width: 112px;
      min-height: 112px;
      display: grid;
      place-items: center;
      background:
        radial-gradient(circle at 30% 30%, rgba(245, 199, 89, 0.14), transparent 50%),
        linear-gradient(180deg, rgba(34, 48, 63, 0.9), rgba(18, 24, 31, 0.96));
      color: #9cb0c4;
      background-repeat: no-repeat;
      background-size: contain;
      background-position: center;
      padding: 10px;
      text-align: center;
      overflow: hidden;
    }
    .editor-building-card__thumb--ready span {
      display: none;
    }
    .editor-building-card__body {
      padding: 12px;
      display: grid;
      gap: 6px;
      min-width: 0;
    }
    .editor-building-card__title {
      font-size: 15px;
      font-weight: 700;
    }
    .editor-building-card__meta {
      max-height: 2.9em;
      overflow: hidden;
    }
    .editor-card {
      border-radius: 18px;
      padding: 14px 15px;
      background: rgba(9, 14, 20, 0.86);
      border: 1px solid rgba(115, 140, 165, 0.16);
      display: grid;
      align-content: start;
    }
    .editor-card__title {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 13px;
      font-weight: 800;
      margin-bottom: 10px;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: #f6cf72;
    }
    .editor-terrain {
      display: grid;
      align-content: start;
      gap: 10px;
    }
    .editor-terrain-stack {
      display: grid;
      align-content: start;
      gap: 10px;
    }
    .editor-terrain__actions {
      display: grid;
      gap: 10px;
    }
    .editor-terrain__button-row {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 8px;
    }
    .editor-terrain__status-row {
      display: grid;
      gap: 8px;
    }
    .editor-terrain__status-badge {
      padding: 8px 10px;
      border-radius: 10px;
      border: 1px solid rgba(115, 140, 165, 0.18);
      background: rgba(11, 17, 24, 0.78);
      color: #b8c9d9;
      font-size: 11px;
      line-height: 1.35;
    }
    .editor-terrain__status-badge.is-dirty {
      color: #f6cf72;
      border-color: rgba(246, 207, 114, 0.3);
    }
    .editor-mini-button {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      min-height: 34px;
      padding: 8px 10px;
      border-radius: 12px;
      border: 1px solid rgba(115, 140, 165, 0.22);
      background: rgba(15, 23, 33, 0.88);
      color: #e9f0f6;
      cursor: pointer;
      transition: border-color 120ms ease, transform 120ms ease, background 120ms ease;
    }
    .editor-mini-button:hover {
      border-color: rgba(111, 180, 235, 0.42);
      background: rgba(20, 31, 44, 0.92);
      transform: translateY(-1px);
    }
    .editor-mini-button.is-active,
    .editor-mini-button--tool.is-active {
      background: linear-gradient(180deg, rgba(55, 85, 112, 0.96), rgba(27, 43, 60, 0.96));
      border-color: rgba(247, 201, 72, 0.58);
      box-shadow: 0 0 0 1px rgba(247, 201, 72, 0.2);
    }
    .editor-tool-grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 8px;
    }
    .editor-terrain__grid {
      display: grid;
      gap: 10px;
    }
    .editor-field {
      display: grid;
      gap: 6px;
    }
    .editor-field__label {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      font-size: 11px;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: #97aec4;
    }
    .editor-input {
      width: 100%;
      min-height: 34px;
      padding: 8px 10px;
      border-radius: 10px;
      border: 1px solid rgba(115, 140, 165, 0.2);
      background: rgba(7, 12, 18, 0.9);
      color: #f3f5f7;
      font: inherit;
      box-sizing: border-box;
    }
    .editor-input--range {
      padding: 0;
      min-height: 28px;
    }
    .editor-range {
      display: grid;
      grid-template-columns: minmax(0, 1fr) 84px;
      gap: 8px;
      align-items: center;
    }
    .editor-input--number {
      text-align: right;
    }
    .editor-toggle {
      display: flex;
      align-items: center;
      gap: 8px;
      min-height: 34px;
      font-size: 12px;
      color: #d5e0ea;
    }
    .editor-toggle input {
      accent-color: #65b0ff;
    }
    .editor-terrain__details {
      overflow: hidden;
    }
    .editor-terrain__summary {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      cursor: pointer;
      list-style: none;
      font-size: 12px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: #f6cf72;
    }
    .editor-terrain__summary::-webkit-details-marker {
      display: none;
    }
    .editor-code-block {
      margin: 12px 0 0;
      padding: 12px;
      border-radius: 12px;
      border: 1px solid rgba(115, 140, 165, 0.14);
      background: rgba(4, 8, 12, 0.92);
      color: #a9bfd2;
      font-size: 11px;
      line-height: 1.45;
      overflow: auto;
      white-space: pre-wrap;
      word-break: break-word;
    }
    .editor-footer {
      display: grid;
      gap: 8px;
      margin-top: auto;
    }
    .editor-badge {
      padding: 10px 12px;
      border-radius: 14px;
      background: rgba(18, 30, 42, 0.92);
      border: 1px solid rgba(115, 140, 165, 0.18);
      font-size: 12px;
      line-height: 1.35;
    }
    .editor-badge.is-dirty {
      color: #f6cf72;
      border-color: rgba(246, 207, 114, 0.42);
    }
    .editor-badge--muted {
      color: #b0c1d1;
    }
    .editor-empty {
      padding: 18px;
      border-radius: 16px;
      background: rgba(16, 23, 31, 0.86);
      color: #b5c4d2;
      font-size: 13px;
      line-height: 1.5;
    }
    @media (max-width: 1100px) {
      .editor-toolbar {
        flex-direction: column;
      }
      .editor-main {
        flex-direction: column;
      }
      .editor-left-column {
        flex-direction: row;
        min-width: 0;
      }
      .editor-tool-rail {
        grid-template-columns: repeat(6, minmax(74px, 1fr));
        width: 100%;
      }
      .editor-viewport-hint {
        max-width: none;
        flex: 1 1 auto;
      }
      .editor-sidepanel {
        width: calc(100vw - 36px);
        height: 58vh;
      }
      .editor-toolbar__buttons {
        max-width: none;
      }
    }
  `;
}
