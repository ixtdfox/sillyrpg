import type { EditorSceneLoader } from "../EditorSceneLoader";
import type { EditorSceneDocument } from "../state/EditorSceneDocument";
import type { SceneGeneratedTerrainDescriptor, SceneTerrainDescriptor } from "../../core/world/scene/SceneDescriptor";
import { TerrainGenerator } from "../../core/world/terrain/TerrainGenerator";
import { TerrainGeneratorPresetCatalog } from "../../core/world/terrain/TerrainGeneratorPresets";
import {
  DEFAULT_TERRAIN_PRESET,
  TerrainDescriptorCloner,
  TerrainResolutionNormalizer
} from "../../core/world/terrain/TerrainTypes";
import type { TerrainGeneratorPanelViewModel } from "./EditorTerrainTypes";

interface EditorTerrainControllerCallbacks {
  readonly onChanged: () => void;
  readonly onTerrainApplied: () => void;
  readonly onStatusMessageChanged: (message: string) => void;
}

export class EditorTerrainController {
  private readonly generator: TerrainGenerator;
  private readonly presetCatalog: TerrainGeneratorPresetCatalog;
  private readonly descriptorCloner: TerrainDescriptorCloner;
  private readonly resolutionNormalizer: TerrainResolutionNormalizer;
  private readonly callbacks: EditorTerrainControllerCallbacks;
  private document: EditorSceneDocument | null;
  private sceneLoader: EditorSceneLoader | null;
  private draft: SceneGeneratedTerrainDescriptor | null;
  private appliedTerrain: SceneTerrainDescriptor | null;
  private stats: TerrainGeneratorPanelViewModel["stats"];
  private draftDirty: boolean;
  private appliedSummary: string;
  private message: string;

  public constructor(
    callbacks: EditorTerrainControllerCallbacks,
    generator = new TerrainGenerator(),
    presetCatalog = new TerrainGeneratorPresetCatalog(),
    descriptorCloner = new TerrainDescriptorCloner(),
    resolutionNormalizer = new TerrainResolutionNormalizer()
  ) {
    this.callbacks = callbacks;
    this.generator = generator;
    this.presetCatalog = presetCatalog;
    this.descriptorCloner = descriptorCloner;
    this.resolutionNormalizer = resolutionNormalizer;
    this.document = null;
    this.sceneLoader = null;
    this.draft = null;
    this.appliedTerrain = null;
    this.stats = null;
    this.draftDirty = false;
    this.appliedSummary = "none";
    this.message = "";
  }

  public bind(document: EditorSceneDocument | null, sceneLoader: EditorSceneLoader | null): void {
    this.document = document;
    this.sceneLoader = sceneLoader;
    this.synchronizeAppliedTerrain(document?.descriptor.terrain ?? null, document ? "Adjust the draft, then click Generate to apply it." : "");
  }

  public synchronizeAppliedTerrain(terrain: SceneTerrainDescriptor | null | undefined, message = this.message): void {
    this.appliedTerrain = terrain ?? null;
    this.draft = this.document ? this.createDraftFromTerrain(terrain) : null;
    this.stats = this.draft ? this.computeStats(this.draft) : null;
    this.appliedSummary = describeTerrain(this.appliedTerrain);
    this.draftDirty = this.resolveDraftDirty();
    this.message = message;
    this.callbacks.onStatusMessageChanged(this.message);
    this.callbacks.onChanged();
  }

  public dispose(): void {}

  public getViewModel(): TerrainGeneratorPanelViewModel {
    return {
      enabled: this.document !== null && this.sceneLoader !== null,
      descriptor: this.draft ? this.descriptorCloner.cloneDescriptor(this.draft) : null,
      presets: this.presetCatalog.getPresets().map((preset) => ({
        id: preset.id,
        label: preset.label,
        description: preset.description
      })),
      stats: this.stats,
      dirty: this.document?.dirty ?? false,
      draftDirty: this.draftDirty,
      appliedSummary: this.appliedSummary,
      message: this.message
    };
  }

  public updateDraft(nextDraft: SceneGeneratedTerrainDescriptor): void {
    this.draft = this.normalizeDraft({
      ...nextDraft,
      editedHeightMap: undefined
    });
    this.stats = this.computeStats(this.draft);
    this.draftDirty = this.resolveDraftDirty();
    this.message = this.draftDirty ? "Terrain draft updated. Click Generate to apply changes." : "Draft matches the applied terrain.";
    this.callbacks.onStatusMessageChanged(this.message);
    this.callbacks.onChanged();
  }

  public async generateNow(): Promise<void> {
    if (!this.document || !this.sceneLoader || !this.draft) {
      return;
    }

    try {
      const descriptorToApply = this.normalizeDraft({
        ...this.draft,
        editedHeightMap: undefined
      });
      this.stats = this.computeStats(descriptorToApply);
      const stats = this.stats;
      await this.sceneLoader.setTerrain(descriptorToApply);
      const appliedDescriptor = this.descriptorCloner.cloneDescriptor(descriptorToApply);
      this.document.setTerrain(appliedDescriptor);
      this.appliedTerrain = appliedDescriptor;
      this.draft = this.descriptorCloner.cloneDescriptor(appliedDescriptor);
      this.appliedSummary = describeTerrain(appliedDescriptor);
      this.draftDirty = false;
      this.message = stats
        ? `Generated terrain applied. Heights ${stats.minHeight.toFixed(2)} to ${stats.maxHeight.toFixed(2)}.`
        : "Generated terrain applied.";
      this.callbacks.onStatusMessageChanged(this.message);
      this.callbacks.onTerrainApplied();
    } catch (error) {
      this.message = error instanceof Error ? error.message : String(error);
      this.callbacks.onStatusMessageChanged(this.message);
    }

    this.callbacks.onChanged();
  }

  public selectPreset(presetId: string): void {
    if (!this.draft) {
      return;
    }

    const preset = this.presetCatalog.getPreset(presetId);
    this.updateDraft({
      ...this.draft,
      generator: {
        ...this.descriptorCloner.cloneGenerator(preset.generator),
        seed: this.draft.generator.seed,
        preset: preset.id
      },
      material: this.descriptorCloner.cloneMaterial(preset.material)
    });
  }

  public async randomizeSeed(): Promise<void> {
    if (!this.draft) {
      return;
    }

    const nextSeed = Math.floor(Math.random() * 2147483647);
    this.updateDraft({
      ...this.draft,
      generator: {
        ...this.draft.generator,
        seed: nextSeed
      }
    });
    await this.generateNow();
  }

  public async flatten(): Promise<void> {
    if (!this.draft) {
      return;
    }

    const basePreset = this.presetCatalog.getPreset("flat-gray");
    this.updateDraft({
      ...this.draft,
      generator: {
        ...this.descriptorCloner.cloneGenerator(basePreset.generator),
        seed: this.draft.generator.seed,
        preset: "flat-gray"
      },
      material: this.descriptorCloner.cloneMaterial(basePreset.material)
    });
    await this.generateNow();
  }

  public async resetPreset(presetId: string): Promise<void> {
    this.selectPreset(presetId);
    await this.generateNow();
  }

  private createDraftFromTerrain(terrain: SceneTerrainDescriptor | null | undefined): SceneGeneratedTerrainDescriptor {
    if (terrain?.kind === "generated") {
      return this.normalizeDraft(terrain);
    }

    if (terrain?.kind === "plane") {
      return this.normalizeDraft(
        this.presetCatalog.createDescriptor({
          presetId: DEFAULT_TERRAIN_PRESET,
          id: terrain.id,
          size: terrain.size,
          position: terrain.position,
          rotation: terrain.rotation,
          scale: terrain.scale
        })
      );
    }

    return this.normalizeDraft(this.presetCatalog.createDescriptor());
  }

  private resolveDraftDirty(): boolean {
    if (!this.draft) {
      return false;
    }

    if (this.appliedTerrain?.kind !== "generated") {
      return true;
    }

    return JSON.stringify(this.appliedTerrain) !== JSON.stringify(this.draft);
  }

  private normalizeDraft(descriptor: SceneGeneratedTerrainDescriptor): SceneGeneratedTerrainDescriptor {
    const preset = this.presetCatalog.getPreset(descriptor.generator.preset);
    const resolutionX = this.resolutionNormalizer.normalize(descriptor.resolution[0]);
    const resolutionZ = this.resolutionNormalizer.normalize(descriptor.resolution[1]);
    const presetMaterial = this.descriptorCloner.cloneMaterial(
      preset.material ??
        this.presetCatalog.getPreset(DEFAULT_TERRAIN_PRESET).material
    );
    const presetBands = presetMaterial?.kind === "heightBands" ? presetMaterial.bands : undefined;
    const material =
      descriptor.material?.kind === "heightBands"
        ? {
            kind: "heightBands" as const,
            color: descriptor.material.color ?? presetMaterial?.color ?? "#8D9298",
            emissive: descriptor.material.emissive !== undefined ? descriptor.material.emissive : presetMaterial?.emissive,
            bands: descriptor.material.bands ?? presetBands
          }
        : {
            kind: "flat" as const,
            color: descriptor.material?.color ?? presetMaterial?.color ?? "#8D9298",
            emissive: descriptor.material?.emissive !== undefined ? descriptor.material.emissive : presetMaterial?.emissive
          };
    return {
      ...this.descriptorCloner.cloneDescriptor(descriptor),
      size: [clampSize(descriptor.size[0]), clampSize(descriptor.size[1])] as const,
      resolution: [resolutionX, resolutionZ] as const,
      material,
      generator: {
        ...descriptor.generator,
        preset: preset.id,
        strategy: descriptor.generator.strategy ?? preset.generator.strategy,
        height: {
          ...descriptor.generator.height,
          amplitude: clamp(descriptor.generator.height.amplitude, 0, 1000),
          frequency: clamp(descriptor.generator.height.frequency, 0.0001, 100),
          octaves: Math.max(1, Math.min(8, Math.round(descriptor.generator.height.octaves))),
          persistence: clamp(descriptor.generator.height.persistence, 0, 1),
          lacunarity: clamp(descriptor.generator.height.lacunarity, 1, 8)
        },
        falloff: descriptor.generator.falloff
          ? {
              ...descriptor.generator.falloff,
              radius: clamp(descriptor.generator.falloff.radius, 0, 1),
              strength: clamp(descriptor.generator.falloff.strength, 0, 1)
            }
          : undefined,
        shaping: descriptor.generator.shaping
          ? {
              ...descriptor.generator.shaping,
              centerRadius:
                descriptor.generator.shaping.centerRadius === undefined
                  ? undefined
                  : clamp(descriptor.generator.shaping.centerRadius, 0, 1),
              terraceSteps:
                descriptor.generator.shaping.terraceSteps === undefined
                  ? undefined
                  : Math.max(0, Math.min(64, Math.round(descriptor.generator.shaping.terraceSteps))),
              smoothPasses:
                descriptor.generator.shaping.smoothPasses === undefined
                  ? undefined
                  : Math.max(0, Math.min(12, Math.round(descriptor.generator.shaping.smoothPasses)))
            }
          : undefined
      }
    };
  }

  private computeStats(descriptor: SceneGeneratedTerrainDescriptor): TerrainGeneratorPanelViewModel["stats"] {
    const heightField = this.generator.generate(descriptor);
    return {
      minHeight: heightField.minHeight,
      maxHeight: heightField.maxHeight,
      vertexCount: heightField.getVertexCount(),
      triangleCount: heightField.getTriangleCount()
    };
  }
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) {
    return min;
  }

  return Math.max(min, Math.min(max, value));
}

function clampSize(value: number): number {
  return clamp(value, 1, 1024);
}

function describeTerrain(terrain: SceneTerrainDescriptor | null | undefined): string {
  if (!terrain) {
    return "none";
  }

  if (terrain.kind === "plane") {
    return `plane ${terrain.size[0]} x ${terrain.size[1]}`;
  }

  if (terrain.kind === "generated") {
    return `generated ${terrain.generator.preset} ${terrain.resolution[0]} x ${terrain.resolution[1]}`;
  }

  return terrain.model;
}
