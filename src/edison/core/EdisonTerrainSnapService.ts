import type { Matrix } from "@babylonjs/core";
import { TerrainHeightFieldFitter } from "../../core/world/terrain/TerrainHeightFieldFitter";
import { TerrainHeightFieldSerializer } from "../../core/world/terrain/TerrainHeightFieldSerializer";
import type { SceneDescriptor, SceneObjectDescriptor, SceneTerrainDescriptor } from "../../core/world/scene/SceneDescriptor";
import type { TerrainHeightField } from "../../core/world/terrain/TerrainHeightField";

export const EDISON_TERRAIN_SNAP_PREFERENCE_KEY = "edison.terrainSnap.enabled";

export interface EdisonTerrainSnapRefreshOptions {
  readonly markDirty?: boolean;
}

interface WorldBounds {
  minX: number;
  maxX: number;
  minY: number;
  minZ: number;
  maxZ: number;
}

interface Point3 {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export interface EdisonTerrainSnapEventBus {
  emit<TPayload>(eventName: string, payload: TPayload): void;
}

export interface EdisonTerrainSnapScene {
  getDescriptor(): SceneDescriptor | null;
  setTerrain(terrain: SceneTerrainDescriptor | null, message?: string, markDirty?: boolean): SceneDescriptor;
}

export interface EdisonTerrainSnapMesh {
  isDisposed(): boolean;
  isEnabled(): boolean;
  computeWorldMatrix(force?: boolean): unknown;
  getBoundingInfo(): {
    readonly boundingBox: {
      readonly minimumWorld: Point3;
      readonly maximumWorld: Point3;
    };
  };
}

export interface EdisonTerrainSnapObjectRecord {
  readonly renderableMeshes: readonly EdisonTerrainSnapMesh[];
}

export interface EdisonTerrainSnapTerrain {
  readonly descriptor: SceneTerrainDescriptor;
  readonly heightField?: TerrainHeightField;
  readonly root: {
    computeWorldMatrix(force?: boolean): Matrix;
  };
}

export interface EdisonTerrainSnapObjectRegistry {
  getContent(): unknown | null;
  getTerrain(): EdisonTerrainSnapTerrain | null;
  getObject(objectId: string): EdisonTerrainSnapObjectRecord | null;
}

export interface EdisonTerrainSnapViewport {
  replaceTerrain(descriptor: SceneDescriptor): Promise<void>;
}

export class EdisonTerrainSnapService {
  private readonly terrainHeightFieldFitter = new TerrainHeightFieldFitter();
  private readonly terrainHeightFieldSerializer = new TerrainHeightFieldSerializer();
  private enabled = true;
  private baselineContent: unknown | null = null;
  private baselineTerrainId: string | null = null;
  private baselineHeightField: TerrainHeightField | null = null;

  public constructor(
    private readonly scene: EdisonTerrainSnapScene,
    private readonly objects: EdisonTerrainSnapObjectRegistry,
    private readonly viewport: EdisonTerrainSnapViewport,
    private readonly events: EdisonTerrainSnapEventBus
  ) {}

  public isEnabled(): boolean {
    return this.enabled;
  }

  public setEnabled(enabled: boolean): void {
    if (this.enabled === enabled) {
      return;
    }

    this.enabled = enabled;
    this.events.emit("edison.terrainSnap.changed", { enabled });
    if (enabled) {
      void this.refreshAllWithErrorHandling();
    }
  }

  public async refreshAll(options: EdisonTerrainSnapRefreshOptions = {}): Promise<void> {
    if (!this.enabled) {
      return;
    }

    const content = this.objects.getContent();
    const terrain = this.objects.getTerrain();
    const terrainDescriptor = terrain?.descriptor;
    if (!content || terrainDescriptor?.kind !== "generated" || !terrain?.heightField) {
      return;
    }

    const terrainWorld = terrain.root.computeWorldMatrix(true);
    const inverseTerrainWorld = terrainWorld.clone().invert();
    if (
      this.baselineContent !== content
      || this.baselineTerrainId !== terrainDescriptor.id
      || !this.baselineHeightField
    ) {
      this.baselineContent = content;
      this.baselineTerrainId = terrainDescriptor.id;
      this.baselineHeightField = terrain.heightField;
    }
    const baselineHeightField = this.baselineHeightField;
    if (!baselineHeightField) {
      return;
    }

    let heightField = baselineHeightField;
    const terrainGridStep = terrainDescriptor.terrainGridStep
      ?? Math.min(
        heightField.width / Math.max(1, heightField.resolutionX - 1),
        heightField.depth / Math.max(1, heightField.resolutionZ - 1)
      );
    const padding = Number.isFinite(terrainGridStep) && terrainGridStep > 0 ? terrainGridStep : 0;

    for (const object of this.scene.getDescriptor()?.objects ?? []) {
      if (!isTerrainSnapObject(object)) {
        continue;
      }

      const importedObject = this.objects.getObject(object.id);
      const bounds = importedObject ? resolveWorldBounds(importedObject) : null;
      if (!bounds) {
        continue;
      }

      const center = {
        x: (bounds.minX + bounds.maxX) * 0.5,
        y: bounds.minY,
        z: (bounds.minZ + bounds.maxZ) * 0.5
      };
      const targetLocal = transformCoordinates(center, inverseTerrainWorld);
      const footprintCorners = [
        { x: bounds.minX, y: bounds.minY, z: bounds.minZ },
        { x: bounds.maxX, y: bounds.minY, z: bounds.minZ },
        { x: bounds.minX, y: bounds.minY, z: bounds.maxZ },
        { x: bounds.maxX, y: bounds.minY, z: bounds.maxZ }
      ].map((corner) => transformCoordinates(corner, inverseTerrainWorld));

      heightField = this.terrainHeightFieldFitter.flattenRectangle(heightField, {
        minX: Math.min(...footprintCorners.map((corner) => corner.x)),
        maxX: Math.max(...footprintCorners.map((corner) => corner.x)),
        minZ: Math.min(...footprintCorners.map((corner) => corner.z)),
        maxZ: Math.max(...footprintCorners.map((corner) => corner.z)),
        targetHeight: targetLocal.y,
        padding
      });
    }

    if (heightField === terrain.heightField) {
      return;
    }

    const nextTerrain = {
      ...terrainDescriptor,
      editedHeightMap: this.terrainHeightFieldSerializer.serialize(heightField)
    };
    this.scene.setTerrain(
      nextTerrain,
      "Adjusted terrain under placed objects.",
      options.markDirty ?? true
    );
    const descriptor = this.scene.getDescriptor();
    if (descriptor) {
      await this.viewport.replaceTerrain(descriptor);
      this.baselineContent = this.objects.getContent();
    }
  }

  public dispose(): void {
    this.enabled = false;
    this.baselineContent = null;
    this.baselineTerrainId = null;
    this.baselineHeightField = null;
  }

  private async refreshAllWithErrorHandling(): Promise<void> {
    try {
      await this.refreshAll();
    } catch (error) {
      this.events.emit("edison.message", { text: error instanceof Error ? error.message : String(error) });
    }
  }
}

export function isTerrainSnapObject(object: Pick<SceneObjectDescriptor, "type" | "connected">): boolean {
  return object.type === "building" || object.type === "connected-object" || object.connected !== undefined;
}

function resolveWorldBounds(object: EdisonTerrainSnapObjectRecord): WorldBounds | null {
  let minX = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let minZ = Number.POSITIVE_INFINITY;
  let maxZ = Number.NEGATIVE_INFINITY;

  for (const mesh of object.renderableMeshes) {
    if (mesh.isDisposed() || !mesh.isEnabled()) {
      continue;
    }

    mesh.computeWorldMatrix(true);
    const bounds = mesh.getBoundingInfo().boundingBox;
    minX = Math.min(minX, bounds.minimumWorld.x);
    maxX = Math.max(maxX, bounds.maximumWorld.x);
    minY = Math.min(minY, bounds.minimumWorld.y);
    minZ = Math.min(minZ, bounds.minimumWorld.z);
    maxZ = Math.max(maxZ, bounds.maximumWorld.z);
  }

  if (![minX, maxX, minY, minZ, maxZ].every(Number.isFinite)) {
    return null;
  }

  return { minX, maxX, minY, minZ, maxZ };
}

function transformCoordinates(point: Point3, matrix: Matrix): Point3 {
  const values = matrix.m;
  const x = point.x * values[0]! + point.y * values[4]! + point.z * values[8]! + values[12]!;
  const y = point.x * values[1]! + point.y * values[5]! + point.z * values[9]! + values[13]!;
  const z = point.x * values[2]! + point.y * values[6]! + point.z * values[10]! + values[14]!;
  const w = point.x * values[3]! + point.y * values[7]! + point.z * values[11]! + values[15]!;
  if (w === 0 || w === 1) {
    return { x, y, z };
  }

  return { x: x / w, y: y / w, z: z / w };
}
