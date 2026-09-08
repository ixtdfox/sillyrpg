import type { SceneObjectDescriptor } from "../../core/world/scene/SceneDescriptor";
import { EdisonEventBus } from "./EdisonEventBus";
import { EdisonInteriorEditService } from "./EdisonInteriorEditService";
import {
  planInteriorMagicFill,
  type EdisonInteriorMagicFillPlannedObject
} from "./EdisonInteriorMagicFillPlanner";
import { EdisonObjectRegistry } from "./EdisonObjectRegistry";
import { EdisonSceneDocumentService } from "./EdisonSceneDocumentService";
import { EdisonSelectionService } from "./EdisonSelectionService";
import { EdisonViewportService } from "./EdisonViewportService";

export class EdisonInteriorMagicFillService {
  public constructor(
    private readonly interiorEdit: EdisonInteriorEditService,
    private readonly scene: EdisonSceneDocumentService,
    private readonly objects: EdisonObjectRegistry,
    private readonly selection: EdisonSelectionService,
    private readonly viewport: EdisonViewportService,
    private readonly events: EdisonEventBus
  ) {}

  public async fillActiveBuilding(): Promise<void> {
    const state = this.interiorEdit.getState();
    if (!state) {
      this.events.emit("edison.message", { text: "Enter interior edit mode before using Magic fill." });
      return;
    }

    const rooms = this.viewport.getInteriorMagicFillRooms(state.activeBuildingId);
    if (rooms.length === 0) {
      this.events.emit("edison.message", { text: "Selected building has no room metadata for Magic fill." });
      return;
    }

    const previousIds = this.removePreviousMagicFill(state.activeBuildingId);
    const descriptor = this.scene.getDescriptor();
    const plannedObjects = planInteriorMagicFill({
      buildingId: state.activeBuildingId,
      rooms,
      existingObjects: descriptor?.objects ?? []
    });
    if (plannedObjects.length === 0) {
      this.events.emit("edison.message", {
        text: previousIds.length > 0
          ? "Magic fill cleared previous generated props; existing furniture already occupies the rooms."
          : "Magic fill found no free room cells."
      });
      this.viewport.applyInteriorEditState(this.interiorEdit.getState());
      return;
    }

    const addedIds: string[] = [];
    try {
      for (const plannedObject of plannedObjects) {
        const objectDescriptor = this.createObjectDescriptor(state.activeBuildingId, plannedObject);
        this.scene.addObject(objectDescriptor, `Magic filled ${state.activeBuildingId}.`);
        await this.viewport.addSceneObject(objectDescriptor);
        addedIds.push(objectDescriptor.id);
      }
    } catch (error) {
      for (const objectId of addedIds.reverse()) {
        this.scene.removeObject(objectId);
        this.objects.removeObject(objectId);
      }
      throw error;
    }

    this.selection.clear();
    this.viewport.applyInteriorEditState(this.interiorEdit.getState());
    this.events.emit("edison.message", {
      text: `Magic fill added ${plannedObjects.length} props across ${rooms.length} rooms.`
    });
  }

  private removePreviousMagicFill(buildingId: string): readonly string[] {
    const prefix = this.getMagicFillIdPrefix(buildingId);
    const descriptor = this.scene.getDescriptor();
    const objectIds = descriptor?.objects
      .filter((object) => object.interiorBuildingId === buildingId && object.id.startsWith(prefix))
      .map((object) => object.id) ?? [];

    for (const objectId of objectIds) {
      this.scene.removeObject(objectId);
      this.objects.removeObject(objectId);
    }

    return objectIds;
  }

  private createObjectDescriptor(
    buildingId: string,
    plannedObject: EdisonInteriorMagicFillPlannedObject
  ): SceneObjectDescriptor {
    return {
      id: this.createUniqueObjectId(`${this.getMagicFillIdPrefix(buildingId)}f${plannedObject.storyIndex + 1}-${plannedObject.zone}-${plannedObject.role}`),
      type: "interior",
      asset: plannedObject.asset,
      interiorBuildingId: buildingId,
      interiorStoryIndex: plannedObject.storyIndex,
      position: plannedObject.position,
      rotation: plannedObject.rotation,
      scale: plannedObject.scale
    };
  }

  private createUniqueObjectId(baseId: string): string {
    const existingIds = new Set(this.scene.getDescriptor()?.objects.map((object) => object.id) ?? []);
    if (!existingIds.has(baseId)) {
      return baseId;
    }

    for (let index = 2; index < 10000; index += 1) {
      const candidate = `${baseId}-${index}`;
      if (!existingIds.has(candidate)) {
        return candidate;
      }
    }

    throw new Error(`Unable to create unique Magic fill object id for '${baseId}'.`);
  }

  private getMagicFillIdPrefix(buildingId: string): string {
    return `interior-magic-${slug(buildingId)}-`;
  }
}

function slug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/gu, "-").replace(/^-|-$/gu, "");
}
