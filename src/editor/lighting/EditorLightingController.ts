import {
  cloneSceneLightingDescriptor,
  DEFAULT_LIGHTING_PRESET_ID,
  getLightingPreset
} from "../../core/lighting/LightingPreset";
import { SceneShadowRegistry } from "../../core/lighting/SceneShadowRegistry";
import type {
  DirectionalLightingDescriptor,
  HemisphericLightingDescriptor,
  LightingPresetId,
  LightingVector3Tuple,
  SceneLightingDescriptor,
  ShadowFilterMode,
  ShadowLightingDescriptor
} from "../../core/lighting/LightingTypes";
import type { EditorSceneLoader } from "../EditorSceneLoader";
import type { EditorSceneDocument } from "../state/EditorSceneDocument";
import type { LightingPanelViewModel, LightingPresetOption } from "./EditorLightingTypes";

const PRESET_OPTIONS: readonly LightingPresetOption[] = [
  { id: "day", label: "Day" },
  { id: "overcast", label: "Overcast" },
  { id: "dusk", label: "Dusk" },
  { id: "night", label: "Night" }
];

const DEFAULT_AMBIENT_DIRECTION: LightingVector3Tuple = [0, 1, 0];
const DEFAULT_SUN_DIRECTION: LightingVector3Tuple = [-0.55, -1, -0.35];
const DEFAULT_SUN_POSITION: LightingVector3Tuple = [60, 90, 40];
const HEX_COLOR_PATTERN = /^#[0-9A-Fa-f]{6}$/;
const SHADOW_MAP_SIZES = [512, 1024, 2048, 4096] as const;

interface EditorLightingControllerCallbacks {
  readonly onChanged: () => void;
  readonly onStatusMessageChanged?: (message: string) => void;
}

export class EditorLightingController {
  private document: EditorSceneDocument | null = null;
  private sceneLoader: EditorSceneLoader | null = null;
  private message = "";

  public constructor(
    private readonly shadowRegistry: SceneShadowRegistry,
    private readonly callbacks: EditorLightingControllerCallbacks
  ) {}

  public bind(document: EditorSceneDocument | null, sceneLoader: EditorSceneLoader | null): void {
    this.document = document;
    this.sceneLoader = sceneLoader;
    this.message = document ? "Lighting loaded from scene descriptor." : "";
    this.applyCurrentLighting();
    this.callbacks.onChanged();
  }

  public dispose(): void {
    this.shadowRegistry.dispose();
    this.document = null;
    this.sceneLoader = null;
  }

  public getViewModel(): LightingPanelViewModel {
    return {
      enabled: this.document !== null && this.sceneLoader !== null,
      descriptor: this.document ? this.getCurrentLighting() : null,
      shadowDiagnostics: this.shadowRegistry.getDiagnostics(),
      presetOptions: PRESET_OPTIONS,
      dirty: this.document?.dirty ?? false,
      message: this.message
    };
  }

  public selectPreset(presetId: LightingPresetId): void {
    this.commit(this.normalizeLighting(getLightingPreset(presetId)), `Lighting preset changed to ${presetId}.`);
  }

  public updateClearColor(value: string): void {
    const current = this.getCurrentLighting();
    const nextColor = normalizeHexColor(value, current.clearColor ?? getLightingPreset(DEFAULT_LIGHTING_PRESET_ID).clearColor ?? "#8DB7D6");
    this.commit(
      this.normalizeLighting({
        ...current,
        clearColor: nextColor
      }),
      "Lighting clear color updated."
    );
  }

  public updateAmbient(patch: Partial<HemisphericLightingDescriptor>): void {
    const current = this.getCurrentLighting();
    this.commit(
      this.normalizeLighting({
        ...current,
        ambient: {
          ...(current.ambient ?? {}),
          ...patch
        }
      }),
      "Ambient light updated."
    );
  }

  public updateSun(patch: Partial<DirectionalLightingDescriptor>): void {
    const current = this.getCurrentLighting();
    this.commit(
      this.normalizeLighting({
        ...current,
        sun: {
          ...(current.sun ?? {}),
          ...patch
        }
      }),
      "Sun light updated."
    );
  }

  public updateShadows(patch: Partial<ShadowLightingDescriptor>): void {
    const current = this.getCurrentLighting();
    this.commit(
      this.normalizeLighting({
        ...current,
        shadows: {
          ...(current.shadows ?? {}),
          ...patch
        }
      }),
      "Shadow settings updated."
    );
  }

  public resetToPreset(): void {
    const currentPreset = this.getCurrentLighting().preset ?? DEFAULT_LIGHTING_PRESET_ID;
    this.selectPreset(currentPreset);
  }

  public synchronizeSceneMeshes(): void {
    if (!this.document || !this.sceneLoader) {
      return;
    }

    this.applyLightingAndMeshes(this.getCurrentLighting());
  }

  private applyCurrentLighting(): void {
    if (!this.document) {
      this.shadowRegistry.setLighting(getLightingPreset(DEFAULT_LIGHTING_PRESET_ID));
      return;
    }

    this.applyLightingAndMeshes(this.getCurrentLighting());
  }

  private commit(nextLighting: SceneLightingDescriptor, message: string): void {
    if (!this.document) {
      return;
    }

    const normalized = this.normalizeLighting(nextLighting);
    this.document.updateLighting(normalized);
    this.applyLightingAndMeshes(normalized);
    this.message = message;
    this.callbacks.onStatusMessageChanged?.(message);
    this.callbacks.onChanged();
  }

  private applyLightingAndMeshes(lighting: SceneLightingDescriptor): void {
    this.shadowRegistry.setLighting(lighting);
    this.shadowRegistry.replaceBatches(this.sceneLoader?.getShadowMeshBatches() ?? []);
  }

  private getCurrentLighting(): SceneLightingDescriptor {
    return this.normalizeLighting(this.document?.descriptor.lighting ?? getLightingPreset(DEFAULT_LIGHTING_PRESET_ID));
  }

  private normalizeLighting(descriptor: SceneLightingDescriptor): SceneLightingDescriptor {
    const presetId = descriptor.preset ?? DEFAULT_LIGHTING_PRESET_ID;
    const preset = getLightingPreset(presetId);
    const ambient = descriptor.ambient ?? preset.ambient ?? {};
    const sun = descriptor.sun ?? preset.sun ?? {};
    const shadows = descriptor.shadows ?? preset.shadows ?? {};
    const filter = normalizeShadowFilterMode(shadows);

    return cloneSceneLightingDescriptor({
      preset: presetId,
      clearColor: normalizeHexColor(descriptor.clearColor, preset.clearColor ?? "#8DB7D6"),
      ambient: {
        enabled: ambient.enabled ?? true,
        direction: normalizeVector3(ambient.direction, preset.ambient?.direction ?? DEFAULT_AMBIENT_DIRECTION),
        intensity: clampNumber(ambient.intensity, preset.ambient?.intensity ?? 0.55, 0, 10),
        diffuse: normalizeHexColor(ambient.diffuse, preset.ambient?.diffuse ?? "#FFFFFF"),
        specular: normalizeHexColor(ambient.specular, preset.ambient?.specular ?? "#DDEEFF"),
        groundColor: normalizeHexColor(ambient.groundColor, preset.ambient?.groundColor ?? "#6E7565")
      },
      sun: {
        enabled: sun.enabled ?? true,
        direction: normalizeVector3(sun.direction, preset.sun?.direction ?? DEFAULT_SUN_DIRECTION),
        position: normalizeVector3(sun.position, preset.sun?.position ?? DEFAULT_SUN_POSITION, false),
        intensity: clampNumber(sun.intensity, preset.sun?.intensity ?? 1.05, 0, 10),
        diffuse: normalizeHexColor(sun.diffuse, preset.sun?.diffuse ?? "#FFF4D6"),
        specular: normalizeHexColor(sun.specular, preset.sun?.specular ?? "#FFFFFF")
      },
      shadows: {
        enabled: shadows.enabled ?? preset.shadows?.enabled ?? true,
        generator: normalizeShadowGeneratorKind(shadows.generator, preset.shadows?.generator ?? "cascaded"),
        mapSize: normalizeShadowMapSize(shadows.mapSize, preset.shadows?.mapSize ?? 2048),
        darkness: clampNumber(shadows.darkness, preset.shadows?.darkness ?? 0.45, 0, 1),
        filter,
        useBlurExponentialShadowMap: filter === "blurEsm",
        usePercentageCloserFiltering: filter === "pcf",
        blurKernel: clampNumber(shadows.blurKernel, preset.shadows?.blurKernel ?? 0, 0, 128),
        bias: clampNumber(shadows.bias, preset.shadows?.bias ?? 0.0005, 0, 0.1),
        normalBias: clampNumber(shadows.normalBias, preset.shadows?.normalBias ?? 0.02, 0, 10),
        depthScale: clampNumber(shadows.depthScale, preset.shadows?.depthScale ?? 60, 1, 1000),
        lambda: clampNumber(shadows.lambda, preset.shadows?.lambda ?? 0.65, 0, 1),
        casterMode: normalizeShadowCasterMode(shadows.casterMode, preset.shadows?.casterMode ?? "all"),
        receiverMode: normalizeShadowReceiverMode(shadows.receiverMode, preset.shadows?.receiverMode ?? "terrainOnly"),
        includeCharacters: shadows.includeCharacters ?? true,
        includeSceneObjects: shadows.includeSceneObjects ?? true,
        includeTerrain: shadows.includeTerrain ?? false
      }
    });
  }
}

function normalizeVector3(
  value: LightingVector3Tuple | undefined,
  fallback: LightingVector3Tuple,
  rejectZero = true
): LightingVector3Tuple {
  if (!value || value.length !== 3 || !value.every((entry) => Number.isFinite(entry))) {
    return [fallback[0], fallback[1], fallback[2]] as const;
  }

  if (rejectZero && value.every((entry) => Math.abs(entry) <= 0.000001)) {
    return [fallback[0], fallback[1], fallback[2]] as const;
  }

  return [value[0], value[1], value[2]] as const;
}

function normalizeHexColor(value: string | undefined, fallback: string): string {
  return value && HEX_COLOR_PATTERN.test(value) ? value.toUpperCase() : fallback;
}

function normalizeShadowGeneratorKind(value: string | undefined, fallback: "standard" | "cascaded"): "standard" | "cascaded" {
  return value === "standard" || value === "cascaded" ? value : fallback;
}

function normalizeShadowCasterMode(value: string | undefined, fallback: "all" | "metadata" | "none"): "all" | "metadata" | "none" {
  return value === "all" || value === "metadata" || value === "none" ? value : fallback;
}

function normalizeShadowReceiverMode(
  value: string | undefined,
  fallback: "terrainOnly" | "all" | "metadata" | "none"
): "terrainOnly" | "all" | "metadata" | "none" {
  return value === "terrainOnly" || value === "all" || value === "metadata" || value === "none" ? value : fallback;
}

function normalizeShadowFilterMode(shadows: ShadowLightingDescriptor): ShadowFilterMode {
  if (shadows.filter === "none" || shadows.filter === "pcf" || shadows.filter === "esm" || shadows.filter === "blurEsm") {
    return shadows.filter;
  }

  if (shadows.usePercentageCloserFiltering === true) {
    return "pcf";
  }

  if (shadows.useBlurExponentialShadowMap === true) {
    return "blurEsm";
  }

  if (shadows.usePercentageCloserFiltering === false || shadows.useBlurExponentialShadowMap === false) {
    return "none";
  }

  return "pcf";
}

function normalizeShadowMapSize(value: number | undefined, fallback: number): number {
  const rounded = Math.round(clampNumber(value, fallback, 512, 4096));
  let best: number = SHADOW_MAP_SIZES[0];
  let bestDistance = Math.abs(rounded - best);

  for (const size of SHADOW_MAP_SIZES) {
    const distance = Math.abs(rounded - size);
    if (distance < bestDistance) {
      best = size;
      bestDistance = distance;
    }
  }

  return best;
}

function clampNumber(value: number | undefined, fallback: number, min: number, max: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return fallback;
  }

  return Math.min(max, Math.max(min, value));
}
