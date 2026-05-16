import { Vector3 } from "@babylonjs/core";
import { cloneSceneDescriptor, type SceneDescriptor, type SceneObjectDescriptor } from "../../core/world/scene/SceneDescriptor";
import type { EdisonLoadedSceneDescriptor, EdisonSceneOption } from "../adapters/SceneDescriptorAdapter";
import { SceneDescriptorAdapter } from "../adapters/SceneDescriptorAdapter";
import { TerrainCoreAdapter } from "../adapters/TerrainCoreAdapter";
import { EdisonEventBus } from "./EdisonEventBus";
import { EdisonPersistenceService } from "./EdisonPersistenceService";

export interface EdisonSceneDocumentSnapshot {
  readonly option: EdisonSceneOption | null;
  readonly descriptorPath: string | null;
  readonly descriptor: SceneDescriptor | null;
  readonly dirty: boolean;
  readonly sceneOptions: readonly EdisonSceneOption[];
}

export class EdisonSceneDocumentService {
  private sceneOptions: readonly EdisonSceneOption[] = [];
  private option: EdisonSceneOption | null = null;
  private descriptorPath: string | null = null;
  private descriptor: SceneDescriptor | null = null;
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

  public updateObjectTransform(
    objectId: string,
    transform: {
      readonly position?: Vector3;
      readonly rotation?: Vector3;
      readonly scale?: Vector3;
    }
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

    if (updatedObject) {
      this.markDirty("Object transform changed.");
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

  public async save(): Promise<void> {
    const descriptorPath = this.descriptorPath;
    const descriptor = this.requireDescriptor();
    if (!descriptorPath) {
      throw new Error("No Edison scene descriptor is loaded.");
    }

    await this.persistence.save(descriptorPath, descriptor);
    this.dirty = false;
    this.emitChanged("Scene saved.");
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

  private toTuple(vector: Vector3): readonly [number, number, number] {
    return [vector.x, vector.y, vector.z] as const;
  }

  private createExportFileName(descriptorPath: string): string {
    const segments = descriptorPath.split("/");
    return segments[segments.length - 1] ?? "scene.json";
  }
}
