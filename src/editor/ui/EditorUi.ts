import type { SceneObjectDescriptor } from "../../core/world/scene/SceneDescriptor";
import type { EditorBrowserTab, EditorBuildingAssetOption, EditorSceneOption } from "../types";
import type { EditorTransformMode } from "../state/EditorTransformMode";

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
  readonly onSetTransformMode: (mode: EditorTransformMode) => void;
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

export class EditorUi {
  private readonly strings: Record<string, string>;
  private readonly callbacks: EditorUiCallbacks;
  private readonly root: HTMLDivElement;
  private readonly styleElement: HTMLStyleElement;
  private readonly sceneList: HTMLDivElement;
  private readonly buildingGrid: HTMLDivElement;
  private readonly inspector: HTMLDivElement;
  private readonly sceneInfo: HTMLDivElement;
  private readonly messageBadge: HTMLDivElement;
  private readonly dirtyBadge: HTMLDivElement;
  private readonly gridButton: HTMLButtonElement;
  private readonly axesButton: HTMLButtonElement;
  private readonly addTerrainButton: HTMLButtonElement;
  private readonly selectToolButton: HTMLButtonElement;
  private readonly moveToolButton: HTMLButtonElement;
  private readonly scenesTabButton: HTMLButtonElement;
  private readonly buildingsTabButton: HTMLButtonElement;
  private readonly sceneButtons: Map<string, HTMLButtonElement>;
  private readonly buildingCards: Map<string, HTMLButtonElement>;

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
      <div class="editor-kicker">${this.strings["editor.title"] ?? "Level Editor"}</div>
      <div class="editor-subtitle">JSON scene workflow</div>
    `;
    toolbar.appendChild(titleBlock);

    const toolbarButtons = document.createElement("div");
    toolbarButtons.className = "editor-toolbar__buttons";
    toolbar.appendChild(toolbarButtons);

    toolbarButtons.appendChild(this.createToolbarButton("Frame", callbacks.onFrameScene));
    toolbarButtons.appendChild(this.createToolbarButton("Reload", callbacks.onReloadScene));
    this.addTerrainButton = this.createToolbarButton("Add terrain", callbacks.onAddTerrain);
    toolbarButtons.appendChild(this.addTerrainButton);
    this.selectToolButton = this.createToolbarButton("Select", () => callbacks.onSetTransformMode("select"));
    this.moveToolButton = this.createToolbarButton("Move", () => callbacks.onSetTransformMode("move"));
    toolbarButtons.appendChild(this.selectToolButton);
    toolbarButtons.appendChild(this.moveToolButton);
    toolbarButtons.appendChild(this.createToolbarButton("Rotate -90°", () => callbacks.onRotateSelected(-1)));
    toolbarButtons.appendChild(this.createToolbarButton("Rotate +90°", () => callbacks.onRotateSelected(1)));
    toolbarButtons.appendChild(this.createToolbarButton("Delete", callbacks.onDeleteSelected));
    toolbarButtons.appendChild(this.createToolbarButton("Save Scene", callbacks.onSaveScene));
    toolbarButtons.appendChild(this.createToolbarButton("Export JSON", callbacks.onExportScene));
    this.gridButton = this.createToolbarButton("Grid: On", callbacks.onToggleGrid);
    this.axesButton = this.createToolbarButton("Axes: On", callbacks.onToggleAxes);
    toolbarButtons.appendChild(this.gridButton);
    toolbarButtons.appendChild(this.axesButton);
    toolbarButtons.appendChild(this.createToolbarButton(this.strings["editor.backToMenuShort"] ?? "Back", callbacks.onBackToMenu));

    const main = document.createElement("div");
    main.className = "editor-main";
    this.root.appendChild(main);

    const viewportHint = document.createElement("div");
    viewportHint.className = "editor-viewport-hint";
    viewportHint.innerHTML = `
      <div>Drag building cards into the viewport to place them.</div>
      <div>Use <strong>Move</strong> to drag selected objects on the X/Z plane.</div>
    `;
    main.appendChild(viewportHint);

    const sidePanel = document.createElement("aside");
    sidePanel.className = "editor-sidepanel";
    main.appendChild(sidePanel);

    const tabRow = document.createElement("div");
    tabRow.className = "editor-tabs";
    sidePanel.appendChild(tabRow);

    this.scenesTabButton = this.createTabButton(this.strings["editor.sceneSelector"] ?? "Scenes", () => {
      this.setActiveTab("scenes");
      callbacks.onSelectTab("scenes");
    });
    this.buildingsTabButton = this.createTabButton(this.strings["editor.buildingSelector"] ?? "Buildings", () => {
      this.setActiveTab("buildings");
      callbacks.onSelectTab("buildings");
    });
    tabRow.appendChild(this.scenesTabButton);
    tabRow.appendChild(this.buildingsTabButton);

    this.sceneList = document.createElement("div");
    this.sceneList.className = "editor-scrollpanel";
    sidePanel.appendChild(this.sceneList);

    this.buildingGrid = document.createElement("div");
    this.buildingGrid.className = "editor-buildings editor-scrollpanel";
    sidePanel.appendChild(this.buildingGrid);

    const cardsColumn = document.createElement("div");
    cardsColumn.className = "editor-cards-column";
    sidePanel.appendChild(cardsColumn);

    this.sceneInfo = document.createElement("div");
    this.sceneInfo.className = "editor-card editor-card--compact";
    cardsColumn.appendChild(this.sceneInfo);

    this.inspector = document.createElement("div");
    this.inspector.className = "editor-card editor-card--compact";
    cardsColumn.appendChild(this.inspector);

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
    this.setActiveTab("scenes");
    this.setScenePanel({
      sceneLabel: "No scene loaded",
      descriptorPath: "",
      terrainStatus: "none",
      objectCount: 0,
      dirty: false,
      message: ""
    });
    this.setSelectedObject(null);
    this.setTransformMode("select");
  }

  public setSceneOptions(options: readonly EditorSceneOption[], selectedId: string | null): void {
    this.sceneButtons.clear();
    this.sceneList.replaceChildren();

    if (options.length === 0) {
      this.sceneList.appendChild(this.createEmptyState("No scenes found in location data."));
      return;
    }

    for (const option of options) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "editor-list-item";
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
      <div class="editor-card__title">Scene</div>
      <div class="editor-card__line"><strong>${escapeHtml(viewModel.sceneLabel)}</strong></div>
      <div class="editor-card__line">Descriptor: ${escapeHtml(viewModel.descriptorPath || "none")}</div>
      <div class="editor-card__line">Terrain: ${escapeHtml(viewModel.terrainStatus)}</div>
      <div class="editor-card__line">Objects: ${viewModel.objectCount}</div>
    `;
    this.dirtyBadge.textContent = viewModel.dirty ? "Unsaved changes" : "Saved";
    this.dirtyBadge.classList.toggle("is-dirty", viewModel.dirty);
    this.messageBadge.textContent = viewModel.message || "Selection only for browser cards; drag into viewport to place.";
    this.addTerrainButton.disabled = viewModel.terrainStatus !== "none";
  }

  public setSelectedObject(object: SceneObjectDescriptor | null): void {
    if (!object) {
      this.inspector.innerHTML = `
        <div class="editor-card__title">Inspector</div>
        <div class="editor-card__line">No object selected. Drag a building from the browser into the viewport.</div>
      `;
      return;
    }

    const rotationDegrees = normalizeQuarterTurnDegrees(object.rotation[1]);
    this.inspector.innerHTML = `
      <div class="editor-card__title">Object</div>
      <div class="editor-card__line">id: ${escapeHtml(object.id)}</div>
      <div class="editor-card__line">type: ${escapeHtml(object.type)}</div>
      <div class="editor-card__line">asset: ${escapeHtml(object.asset)}</div>
      <div class="editor-card__line">position: ${formatVector3(object.position)}</div>
      <div class="editor-card__line">rotation: 0°, ${rotationDegrees}°, 0°</div>
      <div class="editor-card__line">scale: ${formatVector3(object.scale)}</div>
    `;
  }

  public setActiveTab(tab: EditorBrowserTab): void {
    const scenesActive = tab === "scenes";
    this.sceneList.style.display = scenesActive ? "grid" : "none";
    this.buildingGrid.style.display = scenesActive ? "none" : "grid";
    this.scenesTabButton.classList.toggle("is-active", scenesActive);
    this.buildingsTabButton.classList.toggle("is-active", !scenesActive);
  }

  public setGridVisible(isVisible: boolean): void {
    this.gridButton.textContent = `Grid: ${isVisible ? "On" : "Off"}`;
  }

  public setAxesVisible(isVisible: boolean): void {
    this.axesButton.textContent = `Axes: ${isVisible ? "On" : "Off"}`;
  }

  public setTransformMode(mode: EditorTransformMode): void {
    this.selectToolButton.classList.toggle("is-active", mode === "select");
    this.moveToolButton.classList.toggle("is-active", mode === "move");
  }

  public dispose(): void {
    this.root.remove();
    this.styleElement.remove();
  }

  private createToolbarButton(label: string, onClick: () => void): HTMLButtonElement {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "editor-toolbar-button";
    button.textContent = label;
    button.addEventListener("click", onClick);
    return button;
  }

  private createTabButton(label: string, onClick: () => void): HTMLButtonElement {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "editor-tab";
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
}

function formatVector3(value: readonly [number, number, number]): string {
  return `${value[0].toFixed(2)}, ${value[1].toFixed(2)}, ${value[2].toFixed(2)}`;
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
    .editor-toolbar-button,
    .editor-tab,
    .editor-list-item,
    .editor-building-card {
      border: 1px solid rgba(145, 171, 196, 0.18);
      background: rgba(12, 18, 26, 0.9);
      color: #edf2f7;
      border-radius: 14px;
      cursor: pointer;
      transition: transform 120ms ease, border-color 120ms ease, background 120ms ease;
    }
    .editor-toolbar-button:hover,
    .editor-tab:hover,
    .editor-list-item:hover,
    .editor-building-card:hover {
      transform: translateY(-1px);
      border-color: rgba(240, 197, 95, 0.45);
    }
    .editor-toolbar-button {
      padding: 11px 14px;
      font-size: 13px;
      backdrop-filter: blur(12px);
    }
    .editor-toolbar-button.is-active,
    .editor-tab.is-active,
    .editor-list-item.is-selected,
    .editor-building-card.is-selected {
      background: linear-gradient(180deg, rgba(55, 85, 112, 0.96), rgba(27, 43, 60, 0.96));
      border-color: rgba(247, 201, 72, 0.58);
      box-shadow: 0 0 0 1px rgba(247, 201, 72, 0.2);
    }
    .editor-toolbar-button:disabled {
      opacity: 0.5;
      cursor: default;
      transform: none;
    }
    .editor-main {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      height: calc(100vh - 110px);
      padding: 18px;
      gap: 18px;
    }
    .editor-viewport-hint {
      margin-top: auto;
      margin-bottom: 0;
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
      pointer-events: auto;
      display: flex;
      flex-direction: column;
      width: 390px;
      height: 100%;
      padding: 14px;
      gap: 12px;
      border-radius: 24px;
      background:
        linear-gradient(180deg, rgba(14, 22, 30, 0.96), rgba(10, 14, 20, 0.96));
      border: 1px solid rgba(115, 140, 165, 0.2);
      box-shadow: 0 18px 48px rgba(0, 0, 0, 0.32);
      backdrop-filter: blur(16px);
    }
    .editor-tabs {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 8px;
    }
    .editor-tab {
      padding: 12px 10px;
      font-size: 14px;
      font-weight: 700;
    }
    .editor-scrollpanel {
      min-height: 0;
      overflow: auto;
      display: grid;
      gap: 10px;
      padding-right: 4px;
    }
    .editor-buildings {
      grid-template-columns: 1fr;
      align-content: start;
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
    .editor-building-card {
      display: grid;
      grid-template-columns: 112px 1fr;
      text-align: left;
      overflow: hidden;
    }
    .editor-building-card__thumb {
      min-height: 112px;
      display: grid;
      place-items: center;
      background:
        radial-gradient(circle at 30% 30%, rgba(245, 199, 89, 0.14), transparent 50%),
        linear-gradient(180deg, rgba(34, 48, 63, 0.9), rgba(18, 24, 31, 0.96));
      color: #9cb0c4;
      background-size: cover;
      background-position: center;
    }
    .editor-building-card__thumb--ready span {
      display: none;
    }
    .editor-building-card__body {
      padding: 12px;
      display: grid;
      gap: 6px;
    }
    .editor-building-card__title {
      font-size: 15px;
      font-weight: 700;
    }
    .editor-cards-column {
      display: grid;
      gap: 12px;
    }
    .editor-card {
      border-radius: 18px;
      padding: 14px 15px;
      background: rgba(9, 14, 20, 0.86);
      border: 1px solid rgba(115, 140, 165, 0.16);
    }
    .editor-card__title {
      font-size: 13px;
      font-weight: 800;
      margin-bottom: 10px;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: #f6cf72;
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
      .editor-main {
        flex-direction: column;
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
