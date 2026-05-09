import type {
  DirectionalLightingDescriptor,
  HemisphericLightingDescriptor,
  LightingPresetId,
  LightingVector3Tuple,
  SceneLightingDescriptor,
  ShadowLightingDescriptor
} from "../../core/lighting/LightingTypes";
import { editorIconSvg } from "./EditorIcons";
import type { LightingPanelCallbacks, LightingPanelViewModel } from "../lighting/EditorLightingTypes";

const HEX_COLOR_PATTERN = /^#[0-9A-Fa-f]{6}$/;
const SHADOW_MAP_SIZE_OPTIONS = [512, 1024, 2048, 4096] as const;

export class LightingPanel {
  private readonly root: HTMLDivElement;
  private readonly callbacks: LightingPanelCallbacks;
  private viewModel: LightingPanelViewModel;

  public constructor(callbacks: LightingPanelCallbacks) {
    this.callbacks = callbacks;
    this.root = document.createElement("div");
    this.root.className = "editor-lighting";
    this.viewModel = {
      enabled: false,
      descriptor: null,
      presetOptions: [],
      dirty: false,
      message: ""
    };
  }

  public getElement(): HTMLDivElement {
    return this.root;
  }

  public setViewModel(viewModel: LightingPanelViewModel): void {
    this.viewModel = viewModel;
    this.render();
  }

  private render(): void {
    const descriptor = this.viewModel.descriptor;
    if (!this.viewModel.enabled || !descriptor) {
      this.root.innerHTML = `
        <div class="editor-card editor-card--compact">
          <div class="editor-card__title">${editorIconSvg("palette", 18)}<span>Lighting</span></div>
          <div class="editor-card__line">Load a scene to configure global lighting.</div>
        </div>
      `;
      return;
    }

    this.root.innerHTML = `
      <div class="editor-card editor-card--compact">
        <div class="editor-card__title">${editorIconSvg("palette", 18)}<span>Lighting</span></div>
        <div class="editor-terrain__status-row">
          <div class="editor-terrain__status-badge${this.viewModel.dirty ? " is-dirty" : ""}">
            ${this.viewModel.dirty ? "Unsaved lighting changes" : "Lighting saved"}
          </div>
          <div class="editor-terrain__status-badge">${escapeHtml(this.viewModel.message || "Changes apply immediately.")}</div>
        </div>
      </div>

      ${this.renderGeneralSection(descriptor)}
      ${this.renderAmbientSection(descriptor)}
      ${this.renderSunSection(descriptor)}
      ${this.renderShadowSection(descriptor)}
    `;

    this.bindEvents();
  }

  private renderGeneralSection(descriptor: SceneLightingDescriptor): string {
    const presetOptions = this.viewModel.presetOptions
      .map((option) => {
        const selected = descriptor.preset === option.id ? " selected" : "";
        return `<option value="${option.id}"${selected}>${escapeHtml(option.label)}</option>`;
      })
      .join("");

    return `
      <section class="editor-card editor-card--compact">
        <div class="editor-card__title"><span>General</span></div>
        <div class="editor-lighting__grid">
          <label class="editor-field">
            <span class="editor-field__label">Preset</span>
            <select class="editor-input" data-lighting-preset>${presetOptions}</select>
          </label>
          ${this.colorField("clearColor", "Sky / clear color", descriptor.clearColor ?? "#8DB7D6")}
          <button type="button" class="editor-mini-button" data-lighting-reset>${editorIconSvg("reload", 16)}<span>Reset to preset</span></button>
        </div>
      </section>
    `;
  }

  private renderAmbientSection(descriptor: SceneLightingDescriptor): string {
    const ambient = descriptor.ambient ?? {};
    return `
      <section class="editor-card editor-card--compact">
        <div class="editor-card__title"><span>Ambient</span></div>
        <div class="editor-lighting__grid">
          ${this.toggleField("ambient.enabled", "Enabled", ambient.enabled ?? true)}
          ${this.rangeField("ambient.intensity", "Intensity", ambient.intensity ?? 0.55, 0, 10, 0.01)}
          ${this.vectorField("ambient.direction", "Direction", ambient.direction ?? [0, 1, 0], -2, 2, 0.01)}
          ${this.colorField("ambient.diffuse", "Diffuse", ambient.diffuse ?? "#FFFFFF")}
          ${this.colorField("ambient.specular", "Specular", ambient.specular ?? "#DDEEFF")}
          ${this.colorField("ambient.groundColor", "Ground", ambient.groundColor ?? "#6E7565")}
        </div>
      </section>
    `;
  }

  private renderSunSection(descriptor: SceneLightingDescriptor): string {
    const sun = descriptor.sun ?? {};
    return `
      <section class="editor-card editor-card--compact">
        <div class="editor-card__title"><span>Sun</span></div>
        <div class="editor-lighting__grid">
          ${this.toggleField("sun.enabled", "Enabled", sun.enabled ?? true)}
          ${this.rangeField("sun.intensity", "Intensity", sun.intensity ?? 1.05, 0, 10, 0.01)}
          ${this.vectorField("sun.direction", "Direction", sun.direction ?? [-0.55, -1, -0.35], -2, 2, 0.01)}
          ${this.vectorField("sun.position", "Position", sun.position ?? [60, 90, 40], -500, 500, 1)}
          ${this.colorField("sun.diffuse", "Diffuse", sun.diffuse ?? "#FFF4D6")}
          ${this.colorField("sun.specular", "Specular", sun.specular ?? "#FFFFFF")}
        </div>
      </section>
    `;
  }

  private renderShadowSection(descriptor: SceneLightingDescriptor): string {
    const shadows = descriptor.shadows ?? {};
    const currentMapSize = shadows.mapSize ?? 1024;
    const mapSizeOptions = SHADOW_MAP_SIZE_OPTIONS.map((size) => {
      const selected = size === currentMapSize ? " selected" : "";
      return `<option value="${size}"${selected}>${size}</option>`;
    }).join("");

    return `
      <section class="editor-card editor-card--compact">
        <div class="editor-card__title"><span>Shadows</span></div>
        <div class="editor-lighting__grid">
          ${this.toggleField("shadows.enabled", "Enabled", shadows.enabled ?? false)}
          ${this.selectField("shadows.generator", "Generator", shadows.generator ?? "cascaded", [
            ["standard", "Standard"],
            ["cascaded", "Cascaded"]
          ])}
          <label class="editor-field">
            <span class="editor-field__label">Map size</span>
            <select class="editor-input" data-lighting-field="shadows.mapSize">${mapSizeOptions}</select>
          </label>
          ${this.rangeField("shadows.darkness", "Darkness", shadows.darkness ?? 0.35, 0, 1, 0.01)}
          ${this.toggleField("shadows.useBlurExponentialShadowMap", "Blur ESM", shadows.useBlurExponentialShadowMap ?? true)}
          ${this.toggleField("shadows.usePercentageCloserFiltering", "PCF", shadows.usePercentageCloserFiltering ?? false)}
          ${this.rangeField("shadows.blurKernel", "Blur kernel", shadows.blurKernel ?? 16, 0, 128, 1)}
          ${this.rangeField("shadows.bias", "Bias", shadows.bias ?? 0.00005, 0, 0.01, 0.00001)}
          ${this.rangeField("shadows.normalBias", "Normal bias", shadows.normalBias ?? 0.02, 0, 0.25, 0.001)}
          ${this.rangeField("shadows.depthScale", "Depth scale", shadows.depthScale ?? 80, 1, 200, 1)}
          ${this.rangeField("shadows.lambda", "CSM lambda", shadows.lambda ?? 0.5, 0, 1, 0.01)}
          ${this.selectField("shadows.casterMode", "Caster mode", shadows.casterMode ?? "all", [
            ["all", "All"],
            ["metadata", "Metadata"],
            ["none", "None"]
          ])}
          ${this.selectField("shadows.receiverMode", "Receiver mode", shadows.receiverMode ?? "terrainOnly", [
            ["terrainOnly", "Terrain only"],
            ["all", "All"],
            ["metadata", "Metadata"],
            ["none", "None"]
          ])}
          ${this.toggleField("shadows.includeSceneObjects", "Include scene objects", shadows.includeSceneObjects ?? true)}
          ${this.toggleField("shadows.includeCharacters", "Include characters", shadows.includeCharacters ?? true)}
          ${this.toggleField("shadows.includeTerrain", "Terrain casts", shadows.includeTerrain ?? false)}
        </div>
      </section>
    `;
  }

  private bindEvents(): void {
    this.root.querySelector<HTMLSelectElement>("[data-lighting-preset]")?.addEventListener("change", (event) => {
      const value = (event.currentTarget as HTMLSelectElement).value;
      if (isLightingPresetId(value)) {
        this.callbacks.onSelectPreset(value);
      }
    });

    this.root.querySelector<HTMLElement>("[data-lighting-reset]")?.addEventListener("click", () => {
      this.callbacks.onResetToPreset();
    });

    this.root.querySelectorAll<HTMLInputElement | HTMLSelectElement>("[data-lighting-field]").forEach((input) => {
      const eventName = input instanceof HTMLSelectElement || input.type === "checkbox" ? "change" : "input";
      input.addEventListener(eventName, () => {
        this.handleFieldInput(input, false);
      });

      if (input instanceof HTMLInputElement && input.type === "number") {
        input.addEventListener("blur", () => {
          this.handleFieldInput(input, true);
        });
      }
    });

    this.root.querySelectorAll<HTMLInputElement>("[data-lighting-range], [data-lighting-number]").forEach((input) => {
      input.addEventListener("input", () => {
        this.handleLinkedNumberInput(input, false);
      });
      if (input.type === "number") {
        input.addEventListener("blur", () => {
          this.handleLinkedNumberInput(input, true);
        });
      }
    });

    this.root.querySelectorAll<HTMLInputElement>("[data-lighting-vector]").forEach((input) => {
      input.addEventListener("input", () => {
        this.handleVectorInput(input, false);
      });
      input.addEventListener("blur", () => {
        this.handleVectorInput(input, true);
      });
    });
  }

  private handleFieldInput(input: HTMLInputElement | HTMLSelectElement, forceValid: boolean): void {
    const field = input.dataset.lightingField;
    if (!field) {
      return;
    }

    if (field === "clearColor" && input instanceof HTMLInputElement) {
      const value = this.normalizeColorInput(input, this.getDescriptor().clearColor ?? "#8DB7D6", forceValid);
      if (value) {
        this.callbacks.onChangeClearColor(value);
      }
      return;
    }

    if (field === "ambient.enabled" && input instanceof HTMLInputElement) {
      this.callbacks.onChangeAmbient({ enabled: input.checked });
      return;
    }

    if (field === "sun.enabled" && input instanceof HTMLInputElement) {
      this.callbacks.onChangeSun({ enabled: input.checked });
      return;
    }

    if (field === "shadows.enabled" && input instanceof HTMLInputElement) {
      this.callbacks.onChangeShadows({ enabled: input.checked });
      return;
    }

    if (field === "shadows.useBlurExponentialShadowMap" && input instanceof HTMLInputElement) {
      this.callbacks.onChangeShadows({ useBlurExponentialShadowMap: input.checked });
      return;
    }

    if (field === "shadows.usePercentageCloserFiltering" && input instanceof HTMLInputElement) {
      this.callbacks.onChangeShadows({ usePercentageCloserFiltering: input.checked });
      return;
    }

    if (field === "shadows.includeSceneObjects" && input instanceof HTMLInputElement) {
      this.callbacks.onChangeShadows({ includeSceneObjects: input.checked });
      return;
    }

    if (field === "shadows.includeCharacters" && input instanceof HTMLInputElement) {
      this.callbacks.onChangeShadows({ includeCharacters: input.checked });
      return;
    }

    if (field === "shadows.includeTerrain" && input instanceof HTMLInputElement) {
      this.callbacks.onChangeShadows({ includeTerrain: input.checked });
      return;
    }

    if (field === "shadows.mapSize" && input instanceof HTMLSelectElement) {
      const parsed = Number.parseInt(input.value, 10);
      if (Number.isFinite(parsed)) {
        this.callbacks.onChangeShadows({ mapSize: parsed });
      }
      return;
    }

    if (field === "shadows.generator" && input instanceof HTMLSelectElement) {
      if (input.value === "standard" || input.value === "cascaded") {
        this.callbacks.onChangeShadows({ generator: input.value });
      }
      return;
    }

    if (field === "shadows.casterMode" && input instanceof HTMLSelectElement) {
      if (input.value === "all" || input.value === "metadata" || input.value === "none") {
        this.callbacks.onChangeShadows({ casterMode: input.value });
      }
      return;
    }

    if (field === "shadows.receiverMode" && input instanceof HTMLSelectElement) {
      if (input.value === "terrainOnly" || input.value === "all" || input.value === "metadata" || input.value === "none") {
        this.callbacks.onChangeShadows({ receiverMode: input.value });
      }
      return;
    }

    if (field.endsWith(".diffuse") || field.endsWith(".specular") || field.endsWith(".groundColor")) {
      const fallback = this.resolveColorFallback(field);
      const value = input instanceof HTMLInputElement ? this.normalizeColorInput(input, fallback, forceValid) : null;
      if (value) {
        this.dispatchColorPatch(field, value);
      }
    }
  }

  private handleLinkedNumberInput(input: HTMLInputElement, forceValid: boolean): void {
    const field = input.dataset.lightingRange ?? input.dataset.lightingNumber;
    if (!field) {
      return;
    }

    const fallback = this.resolveNumberFallback(field);
    const parsed = parseNumberInput(input, fallback, forceValid);
    if (parsed === null) {
      return;
    }

    this.syncLinkedInputs(field, parsed);
    this.dispatchNumberPatch(field, parsed);
  }

  private handleVectorInput(input: HTMLInputElement, forceValid: boolean): void {
    const field = input.dataset.lightingVector;
    if (!field) {
      return;
    }

    const fallbackVector = this.resolveVectorFallback(field);
    const axisIndex = Number.parseInt(input.dataset.axis ?? "0", 10);
    const fallback = fallbackVector[axisIndex] ?? 0;
    const parsed = parseNumberInput(input, fallback, forceValid);
    if (parsed === null) {
      return;
    }

    const vector = this.readVector(field, fallbackVector);
    this.dispatchVectorPatch(field, vector);
  }

  private dispatchNumberPatch(field: string, value: number): void {
    if (field === "ambient.intensity") {
      this.callbacks.onChangeAmbient({ intensity: value });
      return;
    }
    if (field === "sun.intensity") {
      this.callbacks.onChangeSun({ intensity: value });
      return;
    }
    if (field === "shadows.darkness") {
      this.callbacks.onChangeShadows({ darkness: value });
      return;
    }
    if (field === "shadows.blurKernel") {
      this.callbacks.onChangeShadows({ blurKernel: value });
      return;
    }
    if (field === "shadows.bias") {
      this.callbacks.onChangeShadows({ bias: value });
      return;
    }
    if (field === "shadows.normalBias") {
      this.callbacks.onChangeShadows({ normalBias: value });
      return;
    }
    if (field === "shadows.depthScale") {
      this.callbacks.onChangeShadows({ depthScale: value });
      return;
    }
    if (field === "shadows.lambda") {
      this.callbacks.onChangeShadows({ lambda: value });
    }
  }

  private dispatchVectorPatch(field: string, vector: LightingVector3Tuple): void {
    if (field === "ambient.direction") {
      this.callbacks.onChangeAmbient({ direction: vector });
      return;
    }
    if (field === "sun.direction") {
      this.callbacks.onChangeSun({ direction: vector });
      return;
    }
    if (field === "sun.position") {
      this.callbacks.onChangeSun({ position: vector });
    }
  }

  private dispatchColorPatch(field: string, value: string): void {
    if (field.startsWith("ambient.")) {
      const key = field.slice("ambient.".length) as keyof HemisphericLightingDescriptor;
      this.callbacks.onChangeAmbient({ [key]: value } as Partial<HemisphericLightingDescriptor>);
      return;
    }

    if (field.startsWith("sun.")) {
      const key = field.slice("sun.".length) as keyof DirectionalLightingDescriptor;
      this.callbacks.onChangeSun({ [key]: value } as Partial<DirectionalLightingDescriptor>);
    }
  }

  private readVector(field: string, fallback: LightingVector3Tuple): LightingVector3Tuple {
    const values = [0, 1, 2].map((axis) => {
      const input = this.root.querySelector<HTMLInputElement>(`[data-lighting-vector='${field}'][data-axis='${axis}']`);
      const parsed = Number.parseFloat(input?.value ?? "");
      return Number.isFinite(parsed) ? parsed : fallback[axis];
    });

    return [values[0] ?? fallback[0], values[1] ?? fallback[1], values[2] ?? fallback[2]] as const;
  }

  private syncLinkedInputs(field: string, value: number): void {
    const range = this.root.querySelector<HTMLInputElement>(`[data-lighting-range='${field}']`);
    const numeric = this.root.querySelector<HTMLInputElement>(`[data-lighting-number='${field}']`);
    if (range) {
      range.value = `${value}`;
    }
    if (numeric) {
      numeric.value = `${value}`;
    }
  }

  private normalizeColorInput(input: HTMLInputElement, fallback: string, forceValid: boolean): string | null {
    if (HEX_COLOR_PATTERN.test(input.value)) {
      return input.value.toUpperCase();
    }

    if (forceValid) {
      input.value = fallback;
      return fallback;
    }

    return null;
  }

  private resolveNumberFallback(field: string): number {
    const descriptor = this.getDescriptor();
    const ambient = descriptor.ambient ?? {};
    const sun = descriptor.sun ?? {};
    const shadows = descriptor.shadows ?? {};

    switch (field) {
      case "ambient.intensity":
        return ambient.intensity ?? 0.55;
      case "sun.intensity":
        return sun.intensity ?? 1.05;
      case "shadows.darkness":
        return shadows.darkness ?? 0.35;
      case "shadows.blurKernel":
        return shadows.blurKernel ?? 16;
      case "shadows.bias":
        return shadows.bias ?? 0.00005;
      case "shadows.normalBias":
        return shadows.normalBias ?? 0.02;
      case "shadows.depthScale":
        return shadows.depthScale ?? 80;
      case "shadows.lambda":
        return shadows.lambda ?? 0.5;
      default:
        return 0;
    }
  }

  private resolveVectorFallback(field: string): LightingVector3Tuple {
    const descriptor = this.getDescriptor();
    if (field === "ambient.direction") {
      return descriptor.ambient?.direction ?? [0, 1, 0];
    }
    if (field === "sun.direction") {
      return descriptor.sun?.direction ?? [-0.55, -1, -0.35];
    }
    if (field === "sun.position") {
      return descriptor.sun?.position ?? [60, 90, 40];
    }
    return [0, 0, 0];
  }

  private resolveColorFallback(field: string): string {
    const descriptor = this.getDescriptor();
    const ambient = descriptor.ambient ?? {};
    const sun = descriptor.sun ?? {};

    switch (field) {
      case "clearColor":
        return descriptor.clearColor ?? "#8DB7D6";
      case "ambient.diffuse":
        return ambient.diffuse ?? "#FFFFFF";
      case "ambient.specular":
        return ambient.specular ?? "#DDEEFF";
      case "ambient.groundColor":
        return ambient.groundColor ?? "#6E7565";
      case "sun.diffuse":
        return sun.diffuse ?? "#FFF4D6";
      case "sun.specular":
        return sun.specular ?? "#FFFFFF";
      default:
        return "#FFFFFF";
    }
  }

  private getDescriptor(): SceneLightingDescriptor {
    if (!this.viewModel.descriptor) {
      return {};
    }

    return this.viewModel.descriptor;
  }

  private rangeField(field: string, label: string, value: number, min: number, max: number, step: number): string {
    return `
      <label class="editor-field">
        <span class="editor-field__label">${escapeHtml(label)}</span>
        <div class="editor-range">
          <input class="editor-input editor-input--range" type="range" data-lighting-range="${field}" value="${value}" min="${min}" max="${max}" step="${step}" />
          <input class="editor-input editor-input--number" type="number" data-lighting-number="${field}" value="${value}" min="${min}" max="${max}" step="${step}" />
        </div>
      </label>
    `;
  }

  private vectorField(
    field: string,
    label: string,
    value: LightingVector3Tuple,
    min: number,
    max: number,
    step: number
  ): string {
    return `
      <label class="editor-field">
        <span class="editor-field__label">${escapeHtml(label)} X / Y / Z</span>
        <div class="editor-vector-inputs">
          ${this.vectorNumberInput(field, 0, value[0], min, max, step, "X")}
          ${this.vectorNumberInput(field, 1, value[1], min, max, step, "Y")}
          ${this.vectorNumberInput(field, 2, value[2], min, max, step, "Z")}
        </div>
      </label>
    `;
  }

  private vectorNumberInput(
    field: string,
    axis: number,
    value: number,
    min: number,
    max: number,
    step: number,
    label: string
  ): string {
    return `
      <input class="editor-input editor-input--number" type="number" data-lighting-vector="${field}" data-axis="${axis}" aria-label="${escapeHtml(label)}" value="${value}" min="${min}" max="${max}" step="${step}" />
    `;
  }

  private toggleField(field: string, label: string, checked: boolean): string {
    return `
      <label class="editor-toggle">
        <input type="checkbox" data-lighting-field="${field}" ${checked ? "checked" : ""} />
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
        <select class="editor-input" data-lighting-field="${field}">${content}</select>
      </label>
    `;
  }

  private colorField(field: string, label: string, value: string): string {
    return `
      <label class="editor-field">
        <span class="editor-field__label">${editorIconSvg("palette", 14)}${escapeHtml(label)}</span>
        <input class="editor-input" type="color" data-lighting-field="${field}" value="${escapeHtml(value)}" />
      </label>
    `;
  }
}

function parseNumberInput(input: HTMLInputElement, fallback: number, forceValid: boolean): number | null {
  const parsed = Number.parseFloat(input.value);
  if (Number.isFinite(parsed)) {
    return parsed;
  }

  if (forceValid) {
    input.value = `${fallback}`;
    return fallback;
  }

  return null;
}

function isLightingPresetId(value: string): value is LightingPresetId {
  return value === "day" || value === "overcast" || value === "dusk" || value === "night";
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
