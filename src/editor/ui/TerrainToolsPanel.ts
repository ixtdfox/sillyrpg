import type { TerrainBrushSettings, TerrainBrushShape, TerrainEditToolId } from "../../core/world/terrain/editing/TerrainBrushTypes";
import { editorIconSvg, type EditorIconName } from "./EditorIcons";
import type { TerrainToolsPanelCallbacks, TerrainToolsPanelViewModel } from "../terrain/tools/EditorTerrainToolState";

export class TerrainToolsPanel {
  private readonly root: HTMLDivElement;
  private readonly callbacks: TerrainToolsPanelCallbacks;
  private viewModel: TerrainToolsPanelViewModel;

  public constructor(callbacks: TerrainToolsPanelCallbacks) {
    this.callbacks = callbacks;
    this.root = document.createElement("div");
    this.root.className = "editor-terrain";
    this.viewModel = {
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
    };
  }

  public getElement(): HTMLDivElement {
    return this.root;
  }

  public setViewModel(viewModel: TerrainToolsPanelViewModel): void {
    this.viewModel = viewModel;
    this.render();
  }

  private render(): void {
    if (!this.viewModel.enabled) {
      this.root.innerHTML = "";
      return;
    }

    if (!this.viewModel.hasTerrain) {
      this.root.innerHTML = `
        <div class="editor-card editor-card--compact">
          <div class="editor-card__title">${editorIconSvg("terrainRaise", 18)}<span>Terrain Tools</span></div>
          <div class="editor-card__line">Generate terrain first to use brush tools.</div>
        </div>
      `;
      return;
    }

    const brush = this.viewModel.brush;
    this.root.innerHTML = `
      <div class="editor-card editor-card--compact">
        <div class="editor-card__title">${editorIconSvg("terrainRaise", 18)}<span>Terrain Tools</span></div>
        <div class="editor-terrain__status-row">
          <div class="editor-terrain__status-badge${this.viewModel.edited ? " is-dirty" : ""}">
            ${this.viewModel.edited ? "Edited heightmap active" : "Procedural terrain only"}
          </div>
          <div class="editor-terrain__status-badge">
            Height range:
            ${
              this.viewModel.stats
                ? `${this.viewModel.stats.minHeight.toFixed(1)} ... ${this.viewModel.stats.maxHeight.toFixed(1)} m  Δ ${(this.viewModel.stats.maxHeight - this.viewModel.stats.minHeight).toFixed(1)} m`
                : "n/a"
            }
          </div>
          <div class="editor-terrain__status-badge">Height snap: ${this.viewModel.snapHeightStep.toFixed(2)}m</div>
        </div>
        <div class="editor-tool-grid">
          ${this.renderToolButton("raise", "Raise", "terrainRaise")}
          ${this.renderToolButton("lower", "Lower", "terrainLower")}
          ${this.renderToolButton("smooth", "Smooth", "terrainSmooth")}
          ${this.renderToolButton("flatten", "Flatten", "terrainFlatten")}
          ${this.renderToolButton("flattenToHeight", "Flatten To Height", "terrainFlattenToHeight")}
        </div>
      </div>

      <div class="editor-card editor-card--compact">
        <div class="editor-card__title">${editorIconSvg("terrainBrushCircle", 18)}<span>Brush</span></div>
        <div class="editor-terrain__button-row">
          ${this.renderShapeButton("circle", "Circle", "terrainBrushCircle")}
          ${this.renderShapeButton("square", "Square", "terrainBrushSquare")}
        </div>
        <div class="editor-terrain__grid">
          ${this.rangeField("radius", "Size", brush.radius, 0.5, 48, 0.5)}
          ${this.rangeField("strength", "Strength", brush.strength, 1, 40, 0.5)}
          ${this.rangeField("falloff", "Falloff", brush.falloff, 0, 1, 0.05)}
          ${
            this.viewModel.activeTool === "flattenToHeight"
              ? this.numberField("targetHeight", "Target height", this.viewModel.targetHeight, -200, 200, 1)
              : ""
          }
        </div>
      </div>

      <div class="editor-card editor-card--compact">
        <div class="editor-card__title">${editorIconSvg("flatten", 18)}<span>Actions</span></div>
        <div class="editor-terrain__button-row">
          <button type="button" class="editor-mini-button" data-action="flatten-all">${editorIconSvg("terrainFlattenAll", 16)}<span>Flatten All</span></button>
          <button type="button" class="editor-mini-button" data-action="clear-edits">${editorIconSvg("terrainClearEdits", 16)}<span>Clear Edits</span></button>
        </div>
        <div class="editor-card__line">${escapeHtml(this.viewModel.message ?? "Hover over terrain to preview the brush. Click and drag to sculpt.")}</div>
      </div>
    `;

    this.bindEvents();
  }

  private bindEvents(): void {
    this.root.querySelectorAll<HTMLElement>("[data-tool]").forEach((button) => {
      button.addEventListener("click", () => {
        const tool = button.dataset.tool as TerrainEditToolId | undefined;
        if (tool) {
          this.callbacks.onSelectTerrainTool(tool);
        }
      });
    });

    this.root.querySelectorAll<HTMLElement>("[data-shape]").forEach((button) => {
      button.addEventListener("click", () => {
        const shape = button.dataset.shape as TerrainBrushShape | undefined;
        if (shape) {
          this.callbacks.onChangeBrushSettings({
            ...this.viewModel.brush,
            shape
          });
        }
      });
    });

    this.root.querySelectorAll<HTMLInputElement>("[data-tool-range], [data-tool-number]").forEach((input) => {
      input.addEventListener("input", () => {
        this.syncLinkedInputs(input);
        this.callbacks.onChangeBrushSettings(this.readBrushSettings());
      });
    });

    this.root.querySelector<HTMLInputElement>("[data-target-height]")?.addEventListener("input", (event) => {
      const input = event.currentTarget as HTMLInputElement;
      const parsed = Number.parseFloat(input.value);
      if (Number.isFinite(parsed)) {
        this.callbacks.onChangeTargetHeight(parsed);
      }
    });

    this.root.querySelector<HTMLElement>("[data-action='flatten-all']")?.addEventListener("click", () => {
      this.callbacks.onFlattenAllTerrain();
    });
    this.root.querySelector<HTMLElement>("[data-action='clear-edits']")?.addEventListener("click", () => {
      this.callbacks.onClearTerrainEdits();
    });
  }

  private readBrushSettings(): TerrainBrushSettings {
    return {
      shape: this.viewModel.brush.shape,
      radius: this.readNumber("radius", this.viewModel.brush.radius),
      strength: this.readNumber("strength", this.viewModel.brush.strength),
      falloff: this.readNumber("falloff", this.viewModel.brush.falloff)
    };
  }

  private readNumber(field: string, fallback: number): number {
    const range = this.root.querySelector<HTMLInputElement>(`[data-tool-range='${field}']`);
    const numeric = this.root.querySelector<HTMLInputElement>(`[data-tool-number='${field}']`);
    const raw = numeric?.value ?? range?.value;
    const parsed = raw === undefined ? Number.NaN : Number.parseFloat(raw);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  private syncLinkedInputs(input: HTMLInputElement): void {
    const field = input.dataset.toolRange ?? input.dataset.toolNumber;
    if (!field) {
      return;
    }

    const range = this.root.querySelector<HTMLInputElement>(`[data-tool-range='${field}']`);
    const numeric = this.root.querySelector<HTMLInputElement>(`[data-tool-number='${field}']`);
    if (range && range !== input) {
      range.value = input.value;
    }
    if (numeric && numeric !== input) {
      numeric.value = input.value;
    }
  }

  private renderToolButton(tool: TerrainEditToolId, label: string, icon: EditorIconName): string {
    const isActive = this.viewModel.activeTool === tool;
    return `
      <button type="button" class="editor-mini-button editor-mini-button--tool${isActive ? " is-active" : ""}" data-tool="${tool}" title="${escapeHtml(label)}" aria-label="${escapeHtml(label)}">
        ${editorIconSvg(icon, 16)}
        <span>${escapeHtml(label)}</span>
      </button>
    `;
  }

  private renderShapeButton(shape: TerrainBrushShape, label: string, icon: EditorIconName): string {
    const isActive = this.viewModel.brush.shape === shape;
    return `
      <button type="button" class="editor-mini-button${isActive ? " is-active" : ""}" data-shape="${shape}" title="${escapeHtml(label)}" aria-label="${escapeHtml(label)}">
        ${editorIconSvg(icon, 16)}
        <span>${escapeHtml(label)}</span>
      </button>
    `;
  }

  private rangeField(field: string, label: string, value: number, min: number, max: number, step: number): string {
    return `
      <label class="editor-field">
        <span class="editor-field__label">${escapeHtml(label)}</span>
        <div class="editor-range">
          <input class="editor-input editor-input--range" type="range" data-tool-range="${field}" value="${value}" min="${min}" max="${max}" step="${step}" />
          <input class="editor-input editor-input--number" type="number" data-tool-number="${field}" value="${value}" min="${min}" max="${max}" step="${step}" />
        </div>
      </label>
    `;
  }

  private numberField(field: string, label: string, value: number, min: number, max: number, step: number): string {
    return `
      <label class="editor-field">
        <span class="editor-field__label">${escapeHtml(label)}</span>
        <input class="editor-input" type="number" data-target-height value="${value}" min="${min}" max="${max}" step="${step}" />
      </label>
    `;
  }
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
