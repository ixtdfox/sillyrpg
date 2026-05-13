import type { Vector3 } from "@babylonjs/core";
import type { EditorBuildingAssetOption } from "../types";
import { cloneSceneLightingDescriptor } from "../../core/lighting/LightingPreset";
import type { SceneLightingDescriptor } from "../../core/lighting/LightingTypes";
import {
  cloneSceneDescriptor,
  type SceneDescriptor,
  type SceneObjectDescriptor,
  type SceneTerrainDescriptor
} from "../../core/world/scene/SceneDescriptor";

export class EditorSceneDocument {
  public readonly descriptorPath: string;
  public descriptor: SceneDescriptor;
  public dirty: boolean;

  public constructor(descriptorPath: string, descriptor: SceneDescriptor) {
    this.descriptorPath = descriptorPath;
    this.descriptor = cloneSceneDescriptor(descriptor);
    this.dirty = false;
  }

  public addPlaneTerrain(size: [number, number]): SceneTerrainDescriptor {
    if (this.descriptor.terrain) {
      throw new Error("Terrain already exists.");
    }

    const terrain: SceneTerrainDescriptor = {
      id: "terrain-0",
      kind: "plane",
      size,
      position: [0, 0, 0],
      rotation: [0, 0, 0],
      scale: [1, 1, 1],
      material: {
        kind: "flat",
        color: "#8D9298"
      }
    };

    this.descriptor = {
      ...this.descriptor,
      terrain
    };
    this.dirty = true;
    return terrain;
  }

  public setTerrain(terrain: SceneTerrainDescriptor | null): void {
    this.descriptor = {
      ...this.descriptor,
      terrain
    };
    this.dirty = true;
  }

  public updateTerrain(terrain: SceneTerrainDescriptor): void {
    this.setTerrain(terrain);
  }

  public updateLighting(lighting: SceneLightingDescriptor): void {
    this.descriptor = {
      ...this.descriptor,
      lighting: cloneSceneLightingDescriptor(lighting)
    };
    this.dirty = true;
  }

  public addObjectFromAsset(asset: EditorBuildingAssetOption, position: Vector3): SceneObjectDescriptor {
    const nextObject: SceneObjectDescriptor = {
      id: this.createNextObjectId(asset.id),
      type: "building",
      asset: asset.rawModelPath,
      position: [position.x, position.y, position.z],
      rotation: [0, 0, 0],
      scale: [1, 1, 1]
    };

    this.descriptor = {
      ...this.descriptor,
      objects: [...this.descriptor.objects, nextObject]
    };
    this.dirty = true;
    return nextObject;
  }

  public updateObjectTransform(
    objectId: string,
    transform: {
      readonly position?: Vector3;
      readonly rotation?: Vector3;
      readonly scale?: Vector3;
    }
  ): void {
    this.descriptor = {
      ...this.descriptor,
      objects: this.descriptor.objects.map((object) => {
        if (object.id !== objectId) {
          return object;
        }

        return {
          ...object,
          position: transform.position
            ? ([transform.position.x, transform.position.y, transform.position.z] as const)
            : object.position,
          rotation: transform.rotation
            ? ([transform.rotation.x, transform.rotation.y, transform.rotation.z] as const)
            : object.rotation,
          scale: transform.scale ? ([transform.scale.x, transform.scale.y, transform.scale.z] as const) : object.scale
        };
      })
    };
    this.dirty = true;
  }

  public removeObject(objectId: string): void {
    this.descriptor = {
      ...this.descriptor,
      objects: this.descriptor.objects.filter((object) => object.id !== objectId)
    };
    this.dirty = true;
  }

  public getObject(objectId: string): SceneObjectDescriptor | null {
    return this.descriptor.objects.find((object) => object.id === objectId) ?? null;
  }

  public markSaved(): void {
    this.dirty = false;
  }

  public markDirty(): void {
    this.dirty = true;
  }

  public replaceDescriptor(descriptor: SceneDescriptor): void {
    this.descriptor = cloneSceneDescriptor(descriptor);
  }

  public toJson(): string {
    return `${JSON.stringify(this.descriptor, null, 2)}\n`;
  }

  private createNextObjectId(assetId: string): string {
    const prefix = `building-${assetId}-`;
    let maxSuffix = 0;

    for (const object of this.descriptor.objects) {
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
}
