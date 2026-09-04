import { Vector3 } from "@babylonjs/core";
import { WORLD_GRID_ORIGIN_X, WORLD_GRID_ORIGIN_Y, WORLD_GRID_ORIGIN_Z } from "../../core/grid/WorldGridConstants";
import type { SceneObjectDescriptor } from "../../core/world/scene/SceneDescriptor";
import { normalizeAssetPath } from "../../core/model/SceneAssetPath";
import type { EdisonModelAssetOption } from "../assets/EdisonModelAssetCatalog";
import {
  getConnectedConnectionMask,
  getConnectedGridPosition,
  resolveConnectedObjectVariant,
  type ConnectedObjectDefinition
} from "../connected/ConnectedObjectResolver";
import { EdisonEventBus } from "./EdisonEventBus";
import { EdisonObjectRegistry } from "./EdisonObjectRegistry";
import { EdisonSceneDocumentService } from "./EdisonSceneDocumentService";
import type { EdisonTerrainSnapService } from "./EdisonTerrainSnapService";
import { EdisonViewportService } from "./EdisonViewportService";

export class EdisonConnectedObjectService {
  private readonly definitions = new Map<string, ConnectedObjectDefinition>();
  private readonly disposers: Array<() => void> = [];

  public constructor(
    private readonly scene: EdisonSceneDocumentService,
    private readonly objects: EdisonObjectRegistry,
    private readonly viewport: EdisonViewportService,
    private readonly events: EdisonEventBus,
    private readonly terrainSnap: EdisonTerrainSnapService
  ) {
    this.disposers.push(
      events.on("edison.transform.committed", () => {
        void this.refreshAllWithErrorHandling();
      }),
      events.on("edison.object.deleted", () => {
        void this.refreshAllWithErrorHandling();
      })
    );
  }

  public registerDefinition(definition: ConnectedObjectDefinition): () => void {
    if (!Number.isFinite(definition.tileSize) || definition.tileSize <= 0) {
      throw new Error(`Connected object '${definition.id}' tileSize must be positive.`);
    }
    if (definition.variants.length === 0) {
      throw new Error(`Connected object '${definition.id}' must define at least one variant.`);
    }
    if (definition.placementY !== undefined && !Number.isFinite(definition.placementY)) {
      throw new Error(`Connected object '${definition.id}' placementY must be finite.`);
    }
    if (definition.terrainFitHeight !== undefined && !Number.isFinite(definition.terrainFitHeight)) {
      throw new Error(`Connected object '${definition.id}' terrainFitHeight must be finite.`);
    }
    if (this.definitions.has(definition.id)) {
      throw new Error(`Connected object '${definition.id}' is already registered.`);
    }

    this.definitions.set(definition.id, definition);
    this.events.emit("edison.connectedObjects.changed", {});
    return () => {
      this.definitions.delete(definition.id);
      this.events.emit("edison.connectedObjects.changed", {});
    };
  }

  public getDefinitions(): readonly ConnectedObjectDefinition[] {
    return [...this.definitions.values()].sort((left, right) => left.label.localeCompare(right.label));
  }

  public getDefinition(presetId: string): ConnectedObjectDefinition | null {
    return this.definitions.get(presetId) ?? null;
  }

  public getModelAssetOptions(): readonly EdisonModelAssetOption[] {
    return this.getDefinitions().flatMap((definition) => {
      const variant = definition.variants.find((candidate) => candidate.topology === definition.fallbackTopology)
        ?? definition.variants[0];
      if (!variant) {
        return [];
      }

      const filename = variant.asset.split("/").pop() ?? variant.asset;
      const title = `${definition.label} ${humanize(variant.topology)}`;
      return [{
        id: `connected-${definition.id}-${variant.topology}`,
        title,
        label: title,
        modelUrl: normalizeAssetPath(variant.asset),
        rawModelPath: variant.asset,
        relativePath: variant.asset.replace(/^assets\/models\//u, ""),
        directory: "connected",
        category: "connected",
        categoryLabel: "Connected Objects",
        objectType: "connected-object",
        filename,
        extension: filename.includes(".") ? `.${filename.split(".").pop()}` : ".glb",
        tags: ["connected", definition.groupId, variant.topology],
        connectedPresetId: definition.id,
        gridSize: definition.tileSize
      } satisfies EdisonModelAssetOption];
    });
  }

  public snapPosition(point: Vector3, presetId: string): Vector3 {
    const definition = this.requireDefinition(presetId);
    return new Vector3(
      WORLD_GRID_ORIGIN_X + Math.round((point.x - WORLD_GRID_ORIGIN_X) / definition.tileSize) * definition.tileSize,
      this.resolvePlacementY(definition),
      WORLD_GRID_ORIGIN_Z + Math.round((point.z - WORLD_GRID_ORIGIN_Z) / definition.tileSize) * definition.tileSize
    );
  }

  public getPlacementY(presetId: string): number {
    return this.resolvePlacementY(this.requireDefinition(presetId));
  }

  public async place(presetId: string, position: Vector3): Promise<string> {
    const definition = this.requireDefinition(presetId);
    const descriptor = this.scene.getDescriptor();
    if (!descriptor) {
      throw new Error("Load a scene before placing connected objects.");
    }

    const snappedPosition = this.snapPosition(position, presetId);
    const objectId = this.createObjectId(definition.id);
    const candidate: SceneObjectDescriptor = {
      id: objectId,
      type: "connected-object",
      asset: definition.variants[0]!.asset,
      position: [snappedPosition.x, snappedPosition.y, snappedPosition.z],
      rotation: [0, 0, 0],
      scale: [1, 1, 1],
      connected: {
        groupId: definition.groupId,
        presetId: definition.id
      }
    };
    const mask = getConnectedConnectionMask(candidate, [...descriptor.objects, candidate], definition);
    const visual = resolveConnectedObjectVariant(definition, mask);
    const object = {
      ...candidate,
      asset: visual.asset,
      rotation: [0, visual.rotationY, 0] as const
    } satisfies SceneObjectDescriptor;

    this.scene.addObject(object, `Placed ${definition.label}.`);
    try {
      await this.viewport.addSceneObject(object);
      await this.refreshAll();
    } catch (error) {
      this.objects.removeObject(object.id);
      this.scene.removeObject(object.id);
      throw error;
    }

    return object.id;
  }

  public async refreshAll(options: { readonly markDirty?: boolean } = {}): Promise<void> {
    const descriptor = this.scene.getDescriptor();
    if (!descriptor) {
      return;
    }

    const markDirty = options.markDirty ?? true;
    const connectedObjects = descriptor.objects.filter((object) => object.connected !== undefined);
    for (const object of connectedObjects) {
      const currentObject = this.scene.getObject(object.id);
      if (!currentObject) {
        continue;
      }

      const connected = currentObject.connected;
      if (!connected) {
        continue;
      }

      const definition = this.definitions.get(connected.presetId);
      if (!definition || connected.groupId !== definition.groupId) {
        continue;
      }

      const [gridX, gridZ] = getConnectedGridPosition(currentObject, definition.tileSize);
      const snappedPosition = new Vector3(
        WORLD_GRID_ORIGIN_X + gridX * definition.tileSize,
        currentObject.position[1],
        WORLD_GRID_ORIGIN_Z + gridZ * definition.tileSize
      );
      let normalizedObject = currentObject;
      if (
        currentObject.position[0] !== snappedPosition.x ||
        currentObject.position[1] !== snappedPosition.y ||
        currentObject.position[2] !== snappedPosition.z
      ) {
        const updatedPosition = this.scene.updateObjectTransform(currentObject.id, { position: snappedPosition }, markDirty);
        if (updatedPosition) {
          normalizedObject = updatedPosition;
          this.objects.updateObjectTransform(updatedPosition);
        }
      }

      const currentDescriptor = this.scene.getDescriptor();
      const mask = getConnectedConnectionMask(normalizedObject, currentDescriptor?.objects ?? [], definition);
      const visual = resolveConnectedObjectVariant(definition, mask);
      if (normalizedObject.asset === visual.asset && normalizedObject.rotation[1] === visual.rotationY) {
        continue;
      }

      const updated = this.scene.updateObjectVisual(normalizedObject.id, {
        asset: visual.asset,
        rotation: [normalizedObject.rotation[0], visual.rotationY, normalizedObject.rotation[2]]
      }, markDirty);
      if (!updated) {
        continue;
      }

      if (normalizedObject.asset === visual.asset) {
        this.objects.updateObjectTransform(updated);
      } else {
        await this.viewport.replaceSceneObject(updated);
      }
    }

    await this.terrainSnap.refreshAll({ markDirty });
  }

  public dispose(): void {
    for (const dispose of this.disposers.splice(0)) {
      dispose();
    }
    this.definitions.clear();
  }

  private async refreshAllWithErrorHandling(): Promise<void> {
    try {
      await this.refreshAll();
    } catch (error) {
      this.events.emit("edison.message", { text: error instanceof Error ? error.message : String(error) });
    }
  }

  private requireDefinition(presetId: string): ConnectedObjectDefinition {
    const definition = this.definitions.get(presetId);
    if (!definition) {
      throw new Error(`Connected object preset '${presetId}' is not registered.`);
    }
    return definition;
  }

  private resolvePlacementY(definition: ConnectedObjectDefinition): number {
    return definition.placementY ?? WORLD_GRID_ORIGIN_Y;
  }

  private createObjectId(presetId: string): string {
    const safePresetId = presetId.replace(/[^a-z0-9]+/giu, "-").replace(/^-+|-+$/gu, "") || "connected";
    const prefix = `connected-${safePresetId}-`;
    let suffix = 1;
    const descriptor = this.scene.getDescriptor();
    while (descriptor?.objects.some((object) => object.id === `${prefix}${String(suffix).padStart(3, "0")}`)) {
      suffix += 1;
    }
    return `${prefix}${String(suffix).padStart(3, "0")}`;
  }
}

function humanize(value: string): string {
  return value.replace(/[_-]+/gu, " ").replace(/\s+/gu, " ").trim().replace(/\b\w/gu, (character) => character.toUpperCase());
}
