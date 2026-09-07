import { Vector3 } from "@babylonjs/core";
import {
  cloneSceneDescriptor,
  type SceneDescriptor,
  type SceneObjectDescriptor,
  type SceneTerrainDescriptor
} from "../../core/world/scene/SceneDescriptor";
import type { EdisonLoadedSceneDescriptor, EdisonSceneOption } from "../adapters/SceneDescriptorAdapter";
import { SceneDescriptorAdapter } from "../adapters/SceneDescriptorAdapter";
import { TerrainCoreAdapter } from "../adapters/TerrainCoreAdapter";
import { EdisonEventBus } from "./EdisonEventBus";
import { EdisonPersistenceService, type EdisonSaveAsset } from "./EdisonPersistenceService";

export interface EdisonSceneDocumentSnapshot {
  readonly option: EdisonSceneOption | null;
  readonly descriptorPath: string | null;
  readonly descriptor: SceneDescriptor | null;
  readonly dirty: boolean;
  readonly sceneOptions: readonly EdisonSceneOption[];
}

export interface EdisonSaveProgressReport {
  readonly message: string;
  readonly progress: number;
}

export interface EdisonSaveParticipantContext {
  readonly descriptorPath: string;
  readonly descriptor: SceneDescriptor;
  queueSaveAssets(assets: readonly EdisonSaveAsset[]): void;
  report(progress: EdisonSaveProgressReport): void;
}

export interface EdisonSaveParticipant {
  readonly id: string;
  readonly title: string;
  prepare(context: EdisonSaveParticipantContext): void | Promise<void>;
}

export interface EdisonPlaceableModelAsset {
  readonly id: string;
  readonly title: string;
  readonly modelPath: string;
  readonly objectType: string;
  readonly defaultScale?: number;
}

export class EdisonSceneDocumentService {
  private sceneOptions: readonly EdisonSceneOption[] = [];
  private option: EdisonSceneOption | null = null;
  private descriptorPath: string | null = null;
  private descriptor: SceneDescriptor | null = null;
  private saveAssets = new Map<string, EdisonSaveAsset>();
  private readonly saveParticipants = new Map<string, EdisonSaveParticipant>();
  private dirty = false;

  public constructor(
    private readonly descriptorAdapter: SceneDescriptorAdapter,
    private readonly persistence: EdisonPersistenceService,
    private readonly terrainAdapter: TerrainCoreAdapter,
    private readonly events: EdisonEventBus
  ) {}

  public async loadInitialScene(): Promise<EdisonLoadedSceneDescriptor | null> {
    this.sceneOptions = await this.descriptorAdapter.loadSceneOptions();
    const firstOption = this.sceneOptions[0];
    if (!firstOption) {
      this.clearDocument();
      this.emitChanged("No scene descriptors found.");
      return null;
    }

    return this.loadSceneOption(firstOption);
  }

  public async loadSceneOption(option: EdisonSceneOption): Promise<EdisonLoadedSceneDescriptor> {
    const loaded = await this.descriptorAdapter.load(option);
    this.option = loaded.option;
    this.descriptorPath = loaded.option.rawDescriptorPath;
    this.descriptor = cloneSceneDescriptor(loaded.descriptor);
    this.saveAssets.clear();
    this.dirty = false;
    this.emitChanged(`Loaded ${loaded.option.rawDescriptorPath}`);
    return {
      option: loaded.option,
      descriptor: this.requireDescriptor()
    };
  }

  public async reload(): Promise<EdisonLoadedSceneDescriptor | null> {
    if (!this.option) {
      return null;
    }

    return this.loadSceneOption(this.option);
  }

  public getSnapshot(): EdisonSceneDocumentSnapshot {
    return {
      option: this.option,
      descriptorPath: this.descriptorPath,
      descriptor: this.descriptor,
      dirty: this.dirty,
      sceneOptions: this.sceneOptions
    };
  }

  public getDescriptor(): SceneDescriptor | null {
    return this.descriptor;
  }

  public getObject(objectId: string): SceneObjectDescriptor | null {
    return this.descriptor?.objects.find((object) => object.id === objectId) ?? null;
  }

  public createObjectDescriptorFromModel(
    asset: EdisonPlaceableModelAsset,
    position: Vector3,
    options: { readonly interiorBuildingId?: string } = {}
  ): SceneObjectDescriptor {
    return {
      id: this.createNextObjectId(asset.objectType, this.resolveObjectAssetId(asset)),
      type: asset.objectType,
      asset: asset.modelPath,
      position: this.toTuple(position),
      rotation: [0, 0, 0],
      scale: this.toUniformScaleTuple(asset.defaultScale ?? 1),
      ...(options.interiorBuildingId ? { interiorBuildingId: options.interiorBuildingId } : {})
    };
  }

  public addObject(object: SceneObjectDescriptor, message = "Object added."): void {
    const descriptor = this.requireDescriptor();
    if (descriptor.objects.some((candidate) => candidate.id === object.id)) {
      throw new Error(`Scene object '${object.id}' already exists.`);
    }

    this.descriptor = {
      ...descriptor,
      objects: [...descriptor.objects, JSON.parse(JSON.stringify(object)) as SceneObjectDescriptor]
    };
    this.markDirty(message);
  }

  public updateObjectTransform(
    objectId: string,
    transform: {
      readonly position?: Vector3;
      readonly rotation?: Vector3;
      readonly scale?: Vector3;
    },
    markDirty = true
  ): SceneObjectDescriptor | null {
    const descriptor = this.requireDescriptor();
    let updatedObject: SceneObjectDescriptor | null = null;

    this.descriptor = {
      ...descriptor,
      objects: descriptor.objects.map((object) => {
        if (object.id !== objectId) {
          return object;
        }

        updatedObject = {
          ...object,
          position: transform.position ? this.toTuple(transform.position) : object.position,
          rotation: transform.rotation ? this.toTuple(transform.rotation) : object.rotation,
          scale: transform.scale ? this.toTuple(transform.scale) : object.scale
        };
        return updatedObject;
      })
    };

    if (updatedObject && markDirty) {
      this.markDirty("Object transform changed.");
    }

    return updatedObject;
  }

  public updateObjectVisual(
    objectId: string,
    visual: {
      readonly asset: string;
      readonly rotation: readonly [number, number, number];
    },
    markDirty = true
  ): SceneObjectDescriptor | null {
    const descriptor = this.requireDescriptor();
    const object = descriptor.objects.find((candidate) => candidate.id === objectId);
    if (!object) {
      return null;
    }

    if (object.asset === visual.asset && object.rotation.every((value, index) => value === visual.rotation[index])) {
      return object;
    }

    const updatedObject: SceneObjectDescriptor = {
      ...object,
      asset: visual.asset,
      rotation: visual.rotation
    };
    this.descriptor = {
      ...descriptor,
      objects: descriptor.objects.map((candidate) => candidate.id === objectId ? updatedObject : candidate)
    };
    if (markDirty) {
      this.markDirty("Connected object topology changed.");
    }
    return updatedObject;
  }

  public removeObject(objectId: string): boolean {
    const descriptor = this.requireDescriptor();
    const nextObjects = descriptor.objects.filter((object) => object.id !== objectId);
    if (nextObjects.length === descriptor.objects.length) {
      return false;
    }

    this.descriptor = {
      ...descriptor,
      objects: nextObjects
    };
    this.markDirty("Object deleted.");
    return true;
  }

  public setTerrain(terrain: SceneTerrainDescriptor | null, message = "Terrain changed.", markDirty = true): SceneDescriptor {
    const descriptor = this.requireDescriptor();
    this.descriptor = {
      ...descriptor,
      terrain: terrain ? JSON.parse(JSON.stringify(terrain)) as SceneTerrainDescriptor : null
    };
    if (markDirty) {
      this.markDirty(message);
    } else {
      this.emitChanged(message);
    }
    return this.requireDescriptor();
  }

  public queueSaveAssets(assets: readonly EdisonSaveAsset[]): void {
    for (const asset of assets) {
      this.saveAssets.set(asset.path, asset);
    }
  }

  public registerSaveParticipant(participant: EdisonSaveParticipant): () => void {
    if (this.saveParticipants.has(participant.id)) {
      throw new Error(`Edison save participant '${participant.id}' is already registered.`);
    }

    this.saveParticipants.set(participant.id, participant);
    return () => {
      this.saveParticipants.delete(participant.id);
    };
  }

  public async save(): Promise<void> {
    const descriptorPath = this.descriptorPath;
    if (!descriptorPath) {
      throw new Error("No Edison scene descriptor is loaded.");
    }

    const warnings: string[] = [];
    this.emitSaveProgress({ active: true, message: "Preparing scene save...", progress: 0 });
    try {
      const participants = [...this.saveParticipants.values()];
      for (let index = 0; index < participants.length; index += 1) {
        const participant = participants[index]!;
        const baseProgress = participants.length === 0 ? 0.1 : (index / participants.length) * 0.75;
        const progressSpan = participants.length === 0 ? 0 : 0.75 / participants.length;
        this.emitSaveProgress({
          active: true,
          message: participant.title,
          progress: baseProgress
        });
        try {
          await participant.prepare({
            descriptorPath,
            descriptor: this.requireDescriptor(),
            queueSaveAssets: (assets) => this.queueSaveAssets(assets),
            report: (report) => {
              this.emitSaveProgress({
                active: true,
                message: report.message,
                progress: baseProgress + Math.max(0, Math.min(1, report.progress)) * progressSpan
              });
            }
          });
        } catch (error) {
          warnings.push(`${participant.title}: ${this.formatErrorMessage(error)}`);
        }
      }

      const descriptor = cloneSceneDescriptor(this.requireDescriptor());
      const assets = [...this.saveAssets.values()];
      this.emitSaveProgress({ active: true, message: "Writing scene descriptor...", progress: 0.82 });
      await this.persistence.saveDescriptor(descriptorPath, descriptor);
      this.emitSaveProgress({ active: true, message: "Verifying scene save...", progress: 0.96 });
      await this.verifySavedDescriptor(descriptorPath, descriptor);
      this.dirty = false;
      this.emitChanged(this.createSaveCompleteMessage(descriptor, warnings));
      const warningCountBeforeAssets = warnings.length;
      if (assets.length > 0) {
        this.emitSaveProgress({ active: true, message: "Writing generated assets...", progress: 0.98 });
        try {
          await this.persistence.saveAssets(assets);
          this.saveAssets.clear();
        } catch (error) {
          warnings.push(`Generated assets: ${this.formatErrorMessage(error)}`);
        }
      } else {
        this.saveAssets.clear();
      }
      this.emitSaveProgress({
        active: true,
        message: warnings.length > 0 ? "Save complete with warnings." : "Save complete.",
        progress: 1
      });
      if (warnings.length !== warningCountBeforeAssets) {
        this.emitChanged(this.createSaveCompleteMessage(descriptor, warnings));
      }
    } finally {
      this.emitSaveProgress({ active: false, message: "", progress: 1 });
    }
  }

  public exportJson(): void {
    const descriptorPath = this.descriptorPath;
    const descriptor = this.requireDescriptor();
    const fileName = descriptorPath ? this.createExportFileName(descriptorPath) : "edison-scene.json";
    this.persistence.exportJson(fileName, `${JSON.stringify(descriptor, null, 2)}\n`);
    this.events.emit("edison.message", { text: "Scene JSON exported." });
  }

  public describeTerrain(): string {
    return this.terrainAdapter.describeTerrain(this.descriptor?.terrain);
  }

  public markDirty(message = "Unsaved changes."): void {
    this.dirty = true;
    this.emitChanged(message);
  }

  public markClean(message = "Saved."): void {
    this.dirty = false;
    this.emitChanged(message);
  }

  private clearDocument(): void {
    this.option = null;
    this.descriptorPath = null;
    this.descriptor = null;
    this.saveAssets.clear();
    this.dirty = false;
  }

  private requireDescriptor(): SceneDescriptor {
    if (!this.descriptor) {
      throw new Error("No Edison scene descriptor is loaded.");
    }

    return this.descriptor;
  }

  private emitChanged(message: string): void {
    this.events.emit("edison.document.changed", this.getSnapshot());
    this.events.emit("edison.message", { text: message });
  }

  private emitSaveProgress(payload: { readonly active: boolean; readonly message: string; readonly progress: number }): void {
    this.events.emit("edison.save.progress", payload);
  }

  private async verifySavedDescriptor(descriptorPath: string, descriptor: SceneDescriptor): Promise<void> {
    const savedDescriptor = await this.persistence.loadSavedDescriptor(descriptorPath);
    const savedObjectIds = new Set(savedDescriptor.objects.map((object) => object.id));
    const missingObjectIds = descriptor.objects
      .map((object) => object.id)
      .filter((objectId) => !savedObjectIds.has(objectId));

    if (missingObjectIds.length > 0) {
      throw new Error(`Scene save verification failed. Missing objects: ${missingObjectIds.join(", ")}.`);
    }
  }

  private createSaveCompleteMessage(descriptor: SceneDescriptor, warnings: readonly string[]): string {
    if (warnings.length === 0) {
      return `Scene saved (${descriptor.objects.length} objects).`;
    }

    const warningSummary = warnings
      .map((warning) => warning.length > 180 ? `${warning.slice(0, 177)}...` : warning)
      .join(" | ");
    return `Scene saved (${descriptor.objects.length} objects). Warnings: ${warningSummary}`;
  }

  private formatErrorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }

  private toTuple(vector: Vector3): readonly [number, number, number] {
    return [vector.x, vector.y, vector.z] as const;
  }

  private toUniformScaleTuple(scale: number): readonly [number, number, number] {
    return [scale, scale, scale] as const;
  }

  private createNextObjectId(objectType: string, assetId: string): string {
    const safeType = this.slugify(objectType || "model");
    const safeAssetId = this.slugify(assetId || "asset");
    const prefix = `${safeType}-${safeAssetId}-`;
    let maxSuffix = 0;

    for (const object of this.requireDescriptor().objects) {
      if (!object.id.startsWith(prefix)) {
        continue;
      }

      const suffix = Number.parseInt(object.id.slice(prefix.length), 10);
      if (Number.isFinite(suffix)) {
        maxSuffix = Math.max(maxSuffix, suffix);
      }
    }

    return `${prefix}${String(maxSuffix + 1).padStart(3, "0")}`;
  }

  private resolveObjectAssetId(asset: EdisonPlaceableModelAsset): string {
    if (asset.objectType === "building") {
      const buildingPath = asset.modelPath.replace(/\\/gu, "/");
      const buildingPrefix = "assets/models/buildings/";
      if (buildingPath.startsWith(buildingPrefix)) {
        return buildingPath.slice(buildingPrefix.length).replace(/\.[^.]+$/u, "");
      }
    }

    return asset.id;
  }

  private slugify(value: string): string {
    return value
      .toLowerCase()
      .replace(/[^a-z0-9]+/gu, "-")
      .replace(/^-+|-+$/gu, "")
      .replace(/-{2,}/gu, "-") || "model";
  }

  private createExportFileName(descriptorPath: string): string {
    const segments = descriptorPath.split("/");
    return segments[segments.length - 1] ?? "scene.json";
  }
}
