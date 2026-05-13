import type { SceneGeneratedTerrainDescriptor } from "../../core/world/scene/SceneDescriptor";
import { editorIconSvg } from "./EditorIcons";
import type { TerrainGeneratorPanelCallbacks, TerrainGeneratorPanelViewModel } from "../terrain/EditorTerrainTypes";

export class TerrainGeneratorPanel {
  private readonly root: HTMLDivElement;
  private readonly callbacks: TerrainGeneratorPanelCallbacks;
  private viewModel: TerrainGeneratorPanelViewModel;

  public constructor(callbacks: TerrainGeneratorPanelCallbacks) {
    this.callbacks = callbacks;
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
        this.numberField("width", "Width", descriptor.size[0], 1, 1024, 1),
        this.numberField("depth", "Depth", descriptor.size[1], 1, 1024, 1),
        this.numberField("resolutionX", "Resolution X", descriptor.resolution[0], 9, 257, 2),
        this.numberField("resolutionZ", "Resolution Z", descriptor.resolution[1], 9, 257, 2)
      ])}

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
        const nextDescriptor = this.readDescriptorFromInputs();
        if (nextDescriptor) {
          this.callbacks.onChangeTerrainDraft(nextDescriptor);
        }
      });
    });

    this.root.querySelectorAll<HTMLInputElement>("[data-range-field], [data-number-field]").forEach((input) => {
      input.addEventListener("input", () => {
        this.syncLinkedInputs(input);
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

    return {
      ...current,
      size: [readNumber("width", current.size[0]), readNumber("depth", current.size[1])] as const,
      resolution: [readInteger("resolutionX", current.resolution[0]), readInteger("resolutionZ", current.resolution[1])] as const,
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

  private numberField(field: string, label: string, value: number, min: number, max: number, step: number): string {
    return `
      <label class="editor-field">
        <span class="editor-field__label">${escapeHtml(label)}</span>
        <input class="editor-input" type="number" data-field="${field}" value="${value}" min="${min}" max="${max}" step="${step}" />
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
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
