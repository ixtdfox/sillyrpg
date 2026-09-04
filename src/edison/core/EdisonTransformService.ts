import { Vector3 } from "@babylonjs/core";
import { RECT_TILE_SIZE, WORLD_GRID_ORIGIN_X, WORLD_GRID_ORIGIN_Z } from "../../core/grid/WorldGridConstants";
import { EdisonEventBus } from "./EdisonEventBus";
import { EdisonObjectRegistry } from "./EdisonObjectRegistry";
import { EdisonSceneDocumentService } from "./EdisonSceneDocumentService";
import { EdisonSelectionService } from "./EdisonSelectionService";
import { EdisonViewportService } from "./EdisonViewportService";

interface MoveSession {
  readonly pointerId: number;
  readonly objectId: string;
  readonly offset: Vector3;
}

interface RotateSession {
  readonly pointerId: number;
  readonly objectId: string;
  readonly startClientX: number;
  readonly startRotationY: number;
}

export class EdisonTransformService {
  private moveSession: MoveSession | null = null;
  private rotateSession: RotateSession | null = null;

  public constructor(
    private readonly scene: EdisonSceneDocumentService,
    private readonly objects: EdisonObjectRegistry,
    private readonly selection: EdisonSelectionService,
    private readonly viewport: EdisonViewportService,
    private readonly events: EdisonEventBus
  ) {}

  public updateObjectTransform(
    objectId: string,
    transform: {
      readonly position?: Vector3;
      readonly rotation?: Vector3;
      readonly scale?: Vector3;
    }
  ): void {
    this.updateObjectTransformInternal(objectId, transform, true);
  }

  private updateObjectTransformInternal(
    objectId: string,
    transform: {
      readonly position?: Vector3;
      readonly rotation?: Vector3;
      readonly scale?: Vector3;
    },
    committed: boolean
  ): void {
    const updated = this.scene.updateObjectTransform(objectId, transform);
    if (!updated) {
      return;
    }

    this.objects.updateObjectTransform(updated);
    this.viewport.updateSelectionHighlight(this.selection.getSelection());
    this.events.emit("edison.transform.changed", { objectId });
    if (committed) {
      this.events.emit("edison.transform.committed", { objectId });
    }
  }

  public rotateSelectedY(direction: -1 | 1): void {
    const objectId = this.selection.getSelectedObjectId();
    if (!objectId) {
      return;
    }

    const object = this.scene.getObject(objectId);
    if (!object) {
      return;
    }

    const quarterTurn = Math.PI / 2;
    const nextRotation = new Vector3(object.rotation[0], this.normalizeQuarterTurn(object.rotation[1] + direction * quarterTurn), object.rotation[2]);
    this.updateObjectTransform(objectId, { rotation: nextRotation });
    this.events.emit("edison.message", { text: `Rotated ${direction > 0 ? "+90" : "-90"} degrees.` });
  }

  public deleteSelected(): void {
    const objectId = this.selection.getSelectedObjectId();
    if (!objectId) {
      return;
    }

    if (!this.scene.removeObject(objectId)) {
      return;
    }

    this.objects.removeObject(objectId);
    this.selection.clear();
    this.events.emit("edison.object.deleted", { objectId });
    this.events.emit("edison.message", { text: "Object deleted." });
  }

  public beginMove(pointerId: number, objectId: string, placementPoint: Vector3 | null): boolean {
    const object = this.scene.getObject(objectId);
    if (!object || !placementPoint) {
      return false;
    }

    const objectPosition = new Vector3(object.position[0], object.position[1], object.position[2]);
    this.moveSession = {
      pointerId,
      objectId,
      offset: objectPosition.subtract(placementPoint)
    };
    return true;
  }

  public updateMove(pointerId: number, placementPoint: Vector3 | null): boolean {
    if (!this.moveSession || this.moveSession.pointerId !== pointerId || !placementPoint) {
      return false;
    }

    const object = this.scene.getObject(this.moveSession.objectId);
    if (!object) {
      return false;
    }

    const currentPosition = new Vector3(object.position[0], object.position[1], object.position[2]);
    const rawPosition = placementPoint.add(this.moveSession.offset);
    const nextPosition = new Vector3(
      this.snapWorldX(rawPosition.x),
      currentPosition.y,
      this.snapWorldZ(rawPosition.z)
    );
    this.updateObjectTransformInternal(this.moveSession.objectId, { position: nextPosition }, false);
    return true;
  }

  public endMove(pointerId: number): boolean {
    if (!this.moveSession || this.moveSession.pointerId !== pointerId) {
      return false;
    }

    const objectId = this.moveSession.objectId;
    this.moveSession = null;
    this.events.emit("edison.transform.committed", { objectId });
    this.events.emit("edison.message", { text: "Object moved." });
    return true;
  }

  public isMovingPointer(pointerId: number): boolean {
    return this.moveSession?.pointerId === pointerId;
  }

  public beginRotate(pointerId: number, objectId: string, clientX: number, clientY: number): boolean {
    void clientY;
    const object = this.scene.getObject(objectId);
    if (!object) {
      return false;
    }

    this.rotateSession = {
      pointerId,
      objectId,
      startClientX: clientX,
      startRotationY: object.rotation[1]
    };
    this.events.emit("edison.message", { text: "Drag left or right to rotate." });
    return true;
  }

  public updateRotate(pointerId: number, clientX: number, clientY: number): boolean {
    void clientY;
    if (!this.rotateSession || this.rotateSession.pointerId !== pointerId) {
      return false;
    }

    const object = this.scene.getObject(this.rotateSession.objectId);
    if (!object) {
      return false;
    }

    const pixelsPerQuarterTurn = 42;
    const quarterTurn = Math.PI / 2;
    const quarterSteps = Math.round((clientX - this.rotateSession.startClientX) / pixelsPerQuarterTurn);
    const nextRotationY = this.normalizeQuarterTurn(
      this.normalizeQuarterTurn(this.rotateSession.startRotationY) + quarterSteps * quarterTurn
    );
    this.updateObjectTransformInternal(this.rotateSession.objectId, {
      rotation: new Vector3(object.rotation[0], nextRotationY, object.rotation[2])
    }, false);
    return true;
  }

  public endRotate(pointerId: number): boolean {
    if (!this.rotateSession || this.rotateSession.pointerId !== pointerId) {
      return false;
    }

    const objectId = this.rotateSession.objectId;
    this.rotateSession = null;
    this.events.emit("edison.transform.committed", { objectId });
    this.events.emit("edison.message", { text: "Object rotated." });
    return true;
  }

  public isRotatingPointer(pointerId: number): boolean {
    return this.rotateSession?.pointerId === pointerId;
  }

  private snapWorldX(x: number): number {
    return WORLD_GRID_ORIGIN_X + Math.round((x - WORLD_GRID_ORIGIN_X) / RECT_TILE_SIZE) * RECT_TILE_SIZE;
  }

  private snapWorldZ(z: number): number {
    return WORLD_GRID_ORIGIN_Z + Math.round((z - WORLD_GRID_ORIGIN_Z) / RECT_TILE_SIZE) * RECT_TILE_SIZE;
  }

  private normalizeQuarterTurn(value: number): number {
    const fullTurn = Math.PI * 2;
    const normalized = ((value % fullTurn) + fullTurn) % fullTurn;
    return Math.round(normalized / (Math.PI / 2)) * (Math.PI / 2);
  }
}
