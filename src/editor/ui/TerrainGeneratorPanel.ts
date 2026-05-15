import type { SceneGeneratedTerrainDescriptor } from "../../core/world/scene/SceneDescriptor";
import { editorIconSvg } from "./EditorIcons";
import type { TerrainGeneratorPanelCallbacks, TerrainGeneratorPanelViewModel } from "../terrain/EditorTerrainTypes";
import {
  DEFAULT_TERRAIN_GRID_STEP,
  MAX_TERRAIN_RESOLUTION,
  MAX_TERRAIN_WORLD_SIZE,
  TerrainGridAlignedResolutionPolicy
} from "../terrain/generation/TerrainTypes";

export class TerrainGeneratorPanel {
  private readonly root: HTMLDivElement;
  private readonly callbacks: TerrainGeneratorPanelCallbacks;
  private readonly gridAlignedResolutionPolicy: TerrainGridAlignedResolutionPolicy;
  private viewModel: TerrainGeneratorPanelViewModel;

  public constructor(
    callbacks: TerrainGeneratorPanelCallbacks,
    gridAlignedResolutionPolicy = new TerrainGridAlignedResolutionPolicy()
  ) {
    this.callbacks = callbacks;
    this.gridAlignedResolutionPolicy = gridAlignedResolutionPolicy;
    this.root = document.createElement("div");
    this.root.className = "editor-terrain";
    this.viewModel = {
      enabled: false,
      descriptor: null,
      presets: [],
      stats: null,
      dirty: false,
      draftDirty: false,
      appliedSummary: "none"
    };
  }

  public getElement(): HTMLDivElement {
    return this.root;
  }

  public setViewModel(viewModel: TerrainGeneratorPanelViewModel): void {
    this.viewModel = viewModel;
    this.render();
  }

  private render(): void {
    const descriptor = this.viewModel.descriptor;
    if (!this.viewModel.enabled || !descriptor) {
      this.root.innerHTML = `
        <div class="editor-card editor-card--compact">
          <div class="editor-card__title">${editorIconSvg("terrain", 18)}<span>Terrain Generator</span></div>
          <div class="editor-card__line">Load a scene to configure procedural terrain.</div>
        </div>
      `;
      return;
    }

    const presetOptions = this.viewModel.presets
      .map((preset) => {
        const selected = descriptor.generator.preset === preset.id ? " selected" : "";
        return `<option value="${escapeHtml(preset.id)}"${selected}>${escapeHtml(preset.label)}</option>`;
      })
      .join("");
    const resolutionMode = descriptor.resolutionMode ?? "gridStep";
    const terrainGridStep = descriptor.terrainGridStep ?? DEFAULT_TERRAIN_GRID_STEP;
    const [sourceQuadSizeX, sourceQuadSizeZ] = resolveSourceQuadSize(descriptor);
    const sourceQuadWarning = resolveSourceQuadWarning(descriptor);
    const resolutionReadonly = resolutionMode === "gridStep";

    this.root.innerHTML = `
      <div class="editor-card editor-card--compact">
        <div class="editor-card__title">${editorIconSvg("terrain", 18)}<span>Terrain Generator</span></div>
        <div class="editor-terrain__actions">
          <div class="editor-terrain__status-row">
            <div class="editor-terrain__status-badge${this.viewModel.draftDirty ? " is-dirty" : ""}">
              ${this.viewModel.draftDirty ? "Draft differs from applied terrain" : "Draft matches applied terrain"}
            </div>
            <div class="editor-terrain__status-badge">Applied: ${escapeHtml(this.viewModel.appliedSummary)}</div>
            <div class="editor-terrain__status-badge">
              Height range:
              ${
                this.viewModel.stats
                  ? `${this.viewModel.stats.minHeight.toFixed(1)} ... ${this.viewModel.stats.maxHeight.toFixed(1)} m  Δ ${(this.viewModel.stats.maxHeight - this.viewModel.stats.minHeight).toFixed(1)} m`
                  : "n/a"
              }
            </div>
          </div>
          <label class="editor-field">
            <span class="editor-field__label">Preset</span>
            <select class="editor-input" data-field="preset">${presetOptions}</select>
          </label>
          <div class="editor-terrain__button-row">
            <button type="button" class="editor-mini-button" data-action="generate">${editorIconSvg("reload", 16)}<span>Generate</span></button>
            <button type="button" class="editor-mini-button" data-action="randomize">${editorIconSvg("random", 16)}<span>Randomize</span></button>
            <button type="button" class="editor-mini-button" data-action="flatten">${editorIconSvg("flatten", 16)}<span>Flatten</span></button>
            <button type="button" class="editor-mini-button" data-action="reset-preset">${editorIconSvg("terrain", 16)}<span>Reset</span></button>
          </div>
        </div>
      </div>

      ${this.renderNumberSection("Size & Resolution", [
        this.numberField("width", "Width", descriptor.size[0], 1, MAX_TERRAIN_WORLD_SIZE, 1),
        this.numberField("depth", "Depth", descriptor.size[1], 1, MAX_TERRAIN_WORLD_SIZE, 1),
        this.numberField("terrainGridStep", "Grid step", terrainGridStep, 0.0001, MAX_TERRAIN_WORLD_SIZE, 0.5),
        this.selectField("resolutionMode", "Resolution mode", resolutionMode, [
          ["gridStep", "Follow gameplay grid"],
          ["manual", "Manual resolution"]
        ]),
        this.numberField("resolutionX", "Resolution X", descriptor.resolution[0], 9, MAX_TERRAIN_RESOLUTION, 2, resolutionReadonly),
        this.numberField("resolutionZ", "Resolution Z", descriptor.resolution[1], 9, MAX_TERRAIN_RESOLUTION, 2, resolutionReadonly)
      ])}

      <div class="editor-card editor-card--compact">
        <div class="editor-card__line">Source quad: ${sourceQuadSizeX.toFixed(2)} x ${sourceQuadSizeZ.toFixed(2)} m</div>
        ${
          sourceQuadWarning
            ? `<div class="editor-card__line editor-terrain__warning">${escapeHtml(sourceQuadWarning)}</div>`
            : `<div class="editor-card__line">Source grid matches gameplay grid.</div>`
        }
      </div>

      ${this.renderNumberSection("Height Noise", [
        this.numberField("seed", "Seed", descriptor.generator.seed, 0, 2147483647, 1),
        this.rangeField("amplitude", "Amplitude", descriptor.generator.height.amplitude, 0, 200, 1),
        this.rangeField("frequency", "Noise frequency", descriptor.generator.height.frequency, 0.005, 0.12, 0.001),
        this.rangeField("octaves", "Octaves", descriptor.generator.height.octaves, 1, 8, 1),
        this.rangeField("persistence", "Persistence", descriptor.generator.height.persistence, 0, 1, 0.01),
        this.rangeField("lacunarity", "Lacunarity", descriptor.generator.height.lacunarity, 1, 4, 0.05)
      ])}

      <div class="editor-card editor-card--compact">
        <div class="editor-card__line">Heights snap to 1.00m vertical grid.</div>
      </div>

      ${this.renderNumberSection("Shape / Falloff", [
        this.toggleField("falloffEnabled", "Falloff", descriptor.generator.falloff?.enabled ?? false),
        this.selectField("falloffMode", "Mode", descriptor.generator.falloff?.mode ?? "none", [
          ["none", "None"],
          ["island", "Island"],
          ["centerPlateau", "Center Plateau"],
          ["edgeFade", "Edge Fade"]
        ]),
        this.rangeField("falloffRadius", "Radius", descriptor.generator.falloff?.radius ?? 0.8, 0, 1, 0.01),
        this.rangeField("falloffStrength", "Strength", descriptor.generator.falloff?.strength ?? 0, 0, 1, 0.01),
        this.toggleField("flattenCenter", "Flatten center", descriptor.generator.shaping?.flattenCenter ?? false),
        this.rangeField("centerRadius", "Center radius", descriptor.generator.shaping?.centerRadius ?? 0.35, 0, 1, 0.01),
        this.numberField("smoothPasses", "Smooth passes", descriptor.generator.shaping?.smoothPasses ?? 0, 0, 12, 1),
        this.numberField("terraceSteps", "Terrace steps", descriptor.generator.shaping?.terraceSteps ?? 0, 0, 64, 1)
      ])}

      ${this.renderNumberSection("Material", [
        this.selectField("materialKind", "Kind", descriptor.material?.kind ?? "flat", [
          ["flat", "Flat"],
          ["heightBands", "Height Bands"]
        ]),
        this.colorField("materialColor", "Base color", descriptor.material?.color ?? "#8D9298")
      ])}

      <details class="editor-card editor-card--compact editor-terrain__details">
        <summary class="editor-terrain__summary">${editorIconSvg("chevronDown", 16)}<span>Debug</span></summary>
        <div class="editor-card__line">State: ${this.viewModel.dirty ? "Unsaved" : "Saved"}</div>
        <div class="editor-card__line">Draft changed: ${this.viewModel.draftDirty ? "yes" : "no"}</div>
        <div class="editor-card__line">Min height: ${this.viewModel.stats?.minHeight.toFixed(2) ?? "0.00"}</div>
        <div class="editor-card__line">Max height: ${this.viewModel.stats?.maxHeight.toFixed(2) ?? "0.00"}</div>
        <div class="editor-card__line">Vertices: ${this.viewModel.stats?.vertexCount ?? 0}</div>
        <div class="editor-card__line">Triangles: ${this.viewModel.stats?.triangleCount ?? 0}</div>
        <div class="editor-card__line">${escapeHtml(this.viewModel.message ?? "Live preview updates after a short debounce.")}</div>
        <pre class="editor-code-block">${escapeHtml(`${JSON.stringify(descriptor, null, 2)}`)}</pre>
      </details>
    `;

    this.bindEvents();
  }

  private bindEvents(): void {
    this.root.querySelector<HTMLElement>("[data-action='generate']")?.addEventListener("click", () => {
      void this.callbacks.onGenerateTerrain();
    });
    this.root.querySelector<HTMLElement>("[data-action='randomize']")?.addEventListener("click", () => {
      void this.callbacks.onRandomizeSeed();
    });
    this.root.querySelector<HTMLElement>("[data-action='flatten']")?.addEventListener("click", () => {
      void this.callbacks.onFlattenTerrain();
    });
    this.root.querySelector<HTMLElement>("[data-action='reset-preset']")?.addEventListener("click", () => {
      const select = this.root.querySelector<HTMLSelectElement>("[data-field='preset']");
      this.callbacks.onResetTerrainPreset(select?.value ?? this.viewModel.descriptor?.generator.preset ?? "urban-pad");
    });

    this.root.querySelectorAll<HTMLInputElement | HTMLSelectElement>("[data-field]").forEach((input) => {
      const eventName = input instanceof HTMLSelectElement || input.type === "checkbox" ? "change" : "input";
      input.addEventListener(eventName, () => {
        if (input.dataset.field === "preset" && input instanceof HTMLSelectElement) {
          this.callbacks.onSelectTerrainPreset(input.value);
          return;
        }
        this.syncLinkedInputs(input);
        this.syncGridResolutionInputs();
        const nextDescriptor = this.readDescriptorFromInputs();
        if (nextDescriptor) {
          this.callbacks.onChangeTerrainDraft(nextDescriptor);
        }
      });
    });

    this.root.querySelectorAll<HTMLInputElement>("[data-range-field], [data-number-field]").forEach((input) => {
      input.addEventListener("input", () => {
        this.syncLinkedInputs(input);
        this.syncGridResolutionInputs();
        const nextDescriptor = this.readDescriptorFromInputs();
        if (nextDescriptor) {
          this.callbacks.onChangeTerrainDraft(nextDescriptor);
        }
      });
    });
  }

  private readDescriptorFromInputs(): SceneGeneratedTerrainDescriptor | null {
    const current = this.viewModel.descriptor;
    if (!current) {
      return null;
    }

    const readNumber = (field: string, fallback: number): number => {
      const input = this.root.querySelector<HTMLInputElement>(`[data-field='${field}']`);
      if (input) {
        const parsed = Number.parseFloat(input.value);
        return Number.isFinite(parsed) ? parsed : fallback;
      }

      const numberInput = this.root.querySelector<HTMLInputElement>(`[data-number-field='${field}']`);
      if (!numberInput) {
        return fallback;
      }

      const parsed = Number.parseFloat(numberInput.value);
      return Number.isFinite(parsed) ? parsed : fallback;
    };
    const readInteger = (field: string, fallback: number): number => {
      const value = readNumber(field, fallback);
      return Number.isFinite(value) ? Math.round(value) : fallback;
    };
    const readBoolean = (field: string, fallback: boolean): boolean => {
      const input = this.root.querySelector<HTMLInputElement>(`[data-field='${field}']`);
      return input ? input.checked : fallback;
    };
    const readString = (field: string, fallback: string): string => {
      const input = this.root.querySelector<HTMLInputElement | HTMLSelectElement>(`[data-field='${field}']`);
      return input?.value ?? fallback;
    };

    const materialKind = readString(
      "materialKind",
      current.material?.kind === "heightBands" ? "heightBands" : "flat"
    ) as "flat" | "heightBands";
    const material =
      materialKind === "heightBands"
        ? {
            kind: "heightBands" as const,
            color: readString("materialColor", current.material?.color ?? "#8D9298"),
            bands: current.material?.kind === "heightBands" ? current.material.bands : []
          }
        : {
            kind: "flat" as const,
            color: readString("materialColor", current.material?.color ?? "#8D9298")
          };

    const size = [readNumber("width", current.size[0]), readNumber("depth", current.size[1])] as const;
    const terrainGridStep = readNumber("terrainGridStep", current.terrainGridStep ?? DEFAULT_TERRAIN_GRID_STEP);
    const resolutionMode = readString(
      "resolutionMode",
      current.resolutionMode ?? "gridStep"
    ) as SceneGeneratedTerrainDescriptor["resolutionMode"];
    const gridDiagnostics = this.gridAlignedResolutionPolicy.resolveWithDiagnostics(size, terrainGridStep);
    const resolvedSize = resolutionMode === "gridStep" ? gridDiagnostics.snappedSize : size;
    const resolvedResolution = resolutionMode === "gridStep"
      ? gridDiagnostics.resolution
      : ([readInteger("resolutionX", current.resolution[0]), readInteger("resolutionZ", current.resolution[1])] as const);

    return {
      ...current,
      size: resolvedSize,
      terrainGridStep: gridDiagnostics.terrainGridStep,
      resolutionMode,
      resolution: resolvedResolution,
      generator: {
        ...current.generator,
        preset: readString("preset", current.generator.preset),
        seed: readInteger("seed", current.generator.seed),
        height: {
          ...current.generator.height,
          amplitude: readNumber("amplitude", current.generator.height.amplitude),
          frequency: readNumber("frequency", current.generator.height.frequency),
          octaves: readInteger("octaves", current.generator.height.octaves),
          persistence: readNumber("persistence", current.generator.height.persistence),
          lacunarity: readNumber("lacunarity", current.generator.height.lacunarity)
        },
        falloff: {
          enabled: readBoolean("falloffEnabled", current.generator.falloff?.enabled ?? false),
          mode: readString("falloffMode", current.generator.falloff?.mode ?? "none") as
            | "none"
            | "island"
            | "centerPlateau"
            | "edgeFade",
          radius: readNumber("falloffRadius", current.generator.falloff?.radius ?? 0.8),
          strength: readNumber("falloffStrength", current.generator.falloff?.strength ?? 0)
        },
        shaping: {
          flattenCenter: readBoolean("flattenCenter", current.generator.shaping?.flattenCenter ?? false),
          centerRadius: readNumber("centerRadius", current.generator.shaping?.centerRadius ?? 0.35),
          smoothPasses: readInteger("smoothPasses", current.generator.shaping?.smoothPasses ?? 0),
          terraceSteps: readInteger("terraceSteps", current.generator.shaping?.terraceSteps ?? 0)
        }
      },
      material
    };
  }

  private renderNumberSection(title: string, rows: readonly string[]): string {
    return `
      <section class="editor-card editor-card--compact">
        <div class="editor-card__title"><span>${escapeHtml(title)}</span></div>
        <div class="editor-terrain__grid">${rows.join("")}</div>
      </section>
    `;
  }

  private numberField(
    field: string,
    label: string,
    value: number,
    min: number,
    max: number,
    step: number,
    disabled = false
  ): string {
    return `
      <label class="editor-field">
        <span class="editor-field__label">${escapeHtml(label)}</span>
        <input class="editor-input" type="number" data-field="${field}" value="${value}" min="${min}" max="${max}" step="${step}" ${disabled ? "disabled" : ""} />
      </label>
    `;
  }

  private rangeField(field: string, label: string, value: number, min: number, max: number, step: number): string {
    return `
      <label class="editor-field">
        <span class="editor-field__label">${escapeHtml(label)}</span>
        <div class="editor-range">
          <input class="editor-input editor-input--range" type="range" data-range-field="${field}" value="${value}" min="${min}" max="${max}" step="${step}" />
          <input class="editor-input editor-input--number" type="number" data-number-field="${field}" value="${value}" min="${min}" max="${max}" step="${step}" />
        </div>
      </label>
    `;
  }

  private toggleField(field: string, label: string, checked: boolean): string {
    return `
      <label class="editor-toggle">
        <input type="checkbox" data-field="${field}" ${checked ? "checked" : ""} />
        <span>${escapeHtml(label)}</span>
      </label>
    `;
  }

  private selectField(field: string, label: string, value: string, options: readonly (readonly [string, string])[]): string {
    const content = options
      .map(([optionValue, optionLabel]) => {
        const selected = optionValue === value ? " selected" : "";
        return `<option value="${escapeHtml(optionValue)}"${selected}>${escapeHtml(optionLabel)}</option>`;
      })
      .join("");

    return `
      <label class="editor-field">
        <span class="editor-field__label">${escapeHtml(label)}</span>
        <select class="editor-input" data-field="${field}">${content}</select>
      </label>
    `;
  }

  private colorField(field: string, label: string, value: string): string {
    return `
      <label class="editor-field">
        <span class="editor-field__label">${editorIconSvg("palette", 14)}${escapeHtml(label)}</span>
        <input class="editor-input" type="color" data-field="${field}" value="${escapeHtml(value)}" />
      </label>
    `;
  }

  private syncLinkedInputs(input: HTMLInputElement | HTMLSelectElement): void {
    if (!(input instanceof HTMLInputElement)) {
      return;
    }

    const field = input.dataset.rangeField ?? input.dataset.numberField;
    if (!field) {
      return;
    }

    const range = this.root.querySelector<HTMLInputElement>(`[data-range-field='${field}']`);
    const number = this.root.querySelector<HTMLInputElement>(`[data-number-field='${field}']`);
    if (range && range !== input) {
      range.value = input.value;
    }
    if (number && number !== input) {
      number.value = input.value;
    }
  }

  private syncGridResolutionInputs(): void {
    const current = this.viewModel.descriptor;
    if (!current) {
      return;
    }

    const modeInput = this.root.querySelector<HTMLSelectElement>("[data-field='resolutionMode']");
    const mode = modeInput?.value ?? current.resolutionMode ?? "gridStep";
    const resolutionXInput = this.root.querySelector<HTMLInputElement>("[data-field='resolutionX']");
    const resolutionZInput = this.root.querySelector<HTMLInputElement>("[data-field='resolutionZ']");
    const isGridMode = mode === "gridStep";
    if (resolutionXInput) {
      resolutionXInput.disabled = isGridMode;
    }
    if (resolutionZInput) {
      resolutionZInput.disabled = isGridMode;
    }

    if (!isGridMode) {
      return;
    }

    const widthInput = this.root.querySelector<HTMLInputElement>("[data-field='width']");
    const depthInput = this.root.querySelector<HTMLInputElement>("[data-field='depth']");
    const gridStepInput = this.root.querySelector<HTMLInputElement>("[data-field='terrainGridStep']");
    const size = [
      parseInputNumber(widthInput, current.size[0]),
      parseInputNumber(depthInput, current.size[1])
    ] as const;
    const gridStep = parseInputNumber(gridStepInput, current.terrainGridStep ?? DEFAULT_TERRAIN_GRID_STEP);
    const diagnostics = this.gridAlignedResolutionPolicy.resolveWithDiagnostics(size, gridStep);
    if (widthInput) {
      widthInput.value = String(diagnostics.snappedSize[0]);
    }
    if (depthInput) {
      depthInput.value = String(diagnostics.snappedSize[1]);
    }
    if (gridStepInput) {
      gridStepInput.value = String(diagnostics.terrainGridStep);
    }
    if (resolutionXInput) {
      resolutionXInput.value = String(diagnostics.resolution[0]);
    }
    if (resolutionZInput) {
      resolutionZInput.value = String(diagnostics.resolution[1]);
    }
  }
}

function parseInputNumber(input: HTMLInputElement | null, fallback: number): number {
  if (!input) {
    return fallback;
  }

  const parsed = Number.parseFloat(input.value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function resolveSourceQuadSize(descriptor: SceneGeneratedTerrainDescriptor): readonly [number, number] {
  return [
    descriptor.resolution[0] <= 1 ? descriptor.size[0] : descriptor.size[0] / (descriptor.resolution[0] - 1),
    descriptor.resolution[1] <= 1 ? descriptor.size[1] : descriptor.size[1] / (descriptor.resolution[1] - 1)
  ] as const;
}

function resolveSourceQuadWarning(descriptor: SceneGeneratedTerrainDescriptor): string | null {
  if ((descriptor.resolutionMode ?? "gridStep") !== "manual") {
    return null;
  }

  const gridStep = descriptor.terrainGridStep ?? DEFAULT_TERRAIN_GRID_STEP;
  const [quadSizeX, quadSizeZ] = resolveSourceQuadSize(descriptor);
  const tolerance = Math.max(0.001, gridStep * 0.01);
  if (Math.abs(quadSizeX - gridStep) <= tolerance && Math.abs(quadSizeZ - gridStep) <= tolerance) {
    return null;
  }

  return `Manual source quads differ from gameplay grid (${gridStep.toFixed(2)} m).`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
