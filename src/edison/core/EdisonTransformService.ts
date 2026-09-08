import { Matrix, Quaternion, Vector3, type AbstractMesh } from "@babylonjs/core";
import { RECT_TILE_SIZE, WORLD_GRID_ORIGIN_X, WORLD_GRID_ORIGIN_Z } from "../../core/grid/WorldGridConstants";
import { EdisonEventBus } from "./EdisonEventBus";
import { EdisonObjectRegistry } from "./EdisonObjectRegistry";
import { EdisonSceneDocumentService, type EdisonSceneObjectTransformUpdate } from "./EdisonSceneDocumentService";
import { EdisonSelectionService } from "./EdisonSelectionService";
import { EdisonViewportService } from "./EdisonViewportService";
import type { SceneObjectDescriptor } from "../../core/world/scene/SceneDescriptor";

interface MoveSession {
  readonly pointerId: number;
  readonly objectId: string;
  readonly offset: Vector3;
  readonly snapPosition?: EdisonMovePositionSnapper;
}

export type EdisonMovePositionSnapper = (rawPosition: Vector3, currentPosition: Vector3) => Vector3 | null;

interface RotateSession {
  readonly pointerId: number;
  readonly objectId: string;
  readonly startClientX: number;
  readonly startRotationY: number;
}

interface BuildingVisualPivot {
  readonly world: Vector3;
  readonly local: Vector3;
}

const ROTATION_PIXELS_PER_QUARTER_TURN = 16;

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
    const object = this.scene.getObject(objectId);
    if (!object) {
      return;
    }

    const updates = this.createTransformUpdates(object, transform);
    const updatedObjects = this.scene.updateObjectTransforms(updates);
    const updated = updatedObjects.find((candidate) => candidate.id === objectId);
    if (!updated) {
      return;
    }

    for (const updatedObject of updatedObjects) {
      this.objects.updateObjectTransform(updatedObject);
      this.events.emit("edison.transform.changed", { objectId: updatedObject.id });
    }

    this.viewport.updateSelectionHighlight(this.selection.getSelection());
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

  public beginMove(
    pointerId: number,
    objectId: string,
    placementPoint: Vector3 | null,
    snapPosition?: EdisonMovePositionSnapper
  ): boolean {
    const object = this.scene.getObject(objectId);
    if (!object || !placementPoint) {
      return false;
    }

    const objectPosition = new Vector3(object.position[0], object.position[1], object.position[2]);
    this.moveSession = {
      pointerId,
      objectId,
      offset: objectPosition.subtract(placementPoint),
      snapPosition
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
    const nextPosition = this.moveSession.snapPosition
      ? this.moveSession.snapPosition(rawPosition, currentPosition)
      : new Vector3(
          this.snapWorldX(rawPosition.x),
          currentPosition.y,
          this.snapWorldZ(rawPosition.z)
        );
    if (!nextPosition) {
      return false;
    }

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

  public getMovingObjectId(pointerId: number): string | null {
    return this.moveSession?.pointerId === pointerId ? this.moveSession.objectId : null;
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

    const quarterTurn = Math.PI / 2;
    const quarterSteps = Math.round((clientX - this.rotateSession.startClientX) / ROTATION_PIXELS_PER_QUARTER_TURN);
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

  private createTransformUpdates(
    object: SceneObjectDescriptor,
    transform: {
      readonly position?: Vector3;
      readonly rotation?: Vector3;
      readonly scale?: Vector3;
    }
  ): readonly EdisonSceneObjectTransformUpdate[] {
    const primaryUpdate = this.createPrimaryTransformUpdate(object, transform);
    if (object.type !== "building") {
      return [primaryUpdate];
    }

    return [
      primaryUpdate,
      ...this.createInteriorFollowerUpdates(object, primaryUpdate, transform)
    ];
  }

  private createPrimaryTransformUpdate(
    object: SceneObjectDescriptor,
    transform: {
      readonly position?: Vector3;
      readonly rotation?: Vector3;
      readonly scale?: Vector3;
    }
  ): EdisonSceneObjectTransformUpdate {
    if (object.type !== "building" || !transform.rotation) {
      return { objectId: object.id, ...transform };
    }

    const pivot = this.resolveObjectVisualPivot(object.id);
    if (!pivot) {
      return { objectId: object.id, ...transform };
    }

    const currentPosition = this.toVector3(object.position);
    const requestedPosition = transform.position ?? currentPosition;
    const requestedPositionDelta = requestedPosition.subtract(currentPosition);
    const targetPivotWorld = pivot.world.add(requestedPositionDelta);
    const nextOffsetFromOrigin = this.transformLocalOffset(
      pivot.local,
      transform.rotation,
      transform.scale ?? this.toVector3(object.scale)
    );

    return {
      objectId: object.id,
      ...transform,
      position: targetPivotWorld.subtract(nextOffsetFromOrigin)
    };
  }

  private createInteriorFollowerUpdates(
    building: SceneObjectDescriptor,
    primaryUpdate: EdisonSceneObjectTransformUpdate,
    requestedTransform: {
      readonly position?: Vector3;
      readonly rotation?: Vector3;
      readonly scale?: Vector3;
    }
  ): readonly EdisonSceneObjectTransformUpdate[] {
    const currentBuildingPosition = this.toVector3(building.position);
    const requestedBuildingPosition = requestedTransform.position ?? currentBuildingPosition;
    const positionDelta = requestedBuildingPosition.subtract(currentBuildingPosition);
    const currentRotationY = building.rotation[1];
    const nextRotationY = primaryUpdate.rotation?.y ?? currentRotationY;
    const rotationDeltaY = nextRotationY - currentRotationY;
    const hasPositionDelta = positionDelta.lengthSquared() > 0.000001;
    const hasRotationDelta = Math.abs(rotationDeltaY) > 0.000001;
    if (!hasPositionDelta && !hasRotationDelta) {
      return [];
    }

    const pivotWorld = hasRotationDelta
      ? this.resolveObjectVisualPivot(building.id)?.world ?? currentBuildingPosition
      : currentBuildingPosition;
    const targetPivotWorld = pivotWorld.add(positionDelta);
    const rotationMatrix = Matrix.RotationY(rotationDeltaY);
    const updates: EdisonSceneObjectTransformUpdate[] = [];

    for (const object of this.scene.getObjects()) {
      if (object.type !== "interior" || object.interiorBuildingId !== building.id) {
        continue;
      }

      const currentPosition = this.toVector3(object.position);
      const nextPosition = hasRotationDelta
        ? targetPivotWorld.add(Vector3.TransformCoordinates(currentPosition.subtract(pivotWorld), rotationMatrix))
        : currentPosition.add(positionDelta);
      updates.push({
        objectId: object.id,
        position: nextPosition,
        ...(hasRotationDelta
          ? { rotation: new Vector3(object.rotation[0], this.normalizeFullTurn(object.rotation[1] + rotationDeltaY), object.rotation[2]) }
          : {})
      });
    }

    return updates;
  }

  private resolveObjectVisualPivot(objectId: string): BuildingVisualPivot | null {
    const record = this.objects.getObject(objectId);
    if (!record) {
      return null;
    }

    const world = this.resolveMeshesWorldCenter(record.renderableMeshes);
    if (!world) {
      return null;
    }

    record.root.computeWorldMatrix(true);
    return {
      world,
      local: Vector3.TransformCoordinates(world, record.root.getWorldMatrix().clone().invert())
    };
  }

  private resolveMeshesWorldCenter(meshes: readonly AbstractMesh[]): Vector3 | null {
    if (meshes.length === 0) {
      return null;
    }

    let minX = Number.POSITIVE_INFINITY;
    let minY = Number.POSITIVE_INFINITY;
    let minZ = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY;
    let maxY = Number.NEGATIVE_INFINITY;
    let maxZ = Number.NEGATIVE_INFINITY;

    for (const mesh of meshes) {
      mesh.computeWorldMatrix(true);
      const bounds = mesh.getBoundingInfo().boundingBox;
      minX = Math.min(minX, bounds.minimumWorld.x);
      minY = Math.min(minY, bounds.minimumWorld.y);
      minZ = Math.min(minZ, bounds.minimumWorld.z);
      maxX = Math.max(maxX, bounds.maximumWorld.x);
      maxY = Math.max(maxY, bounds.maximumWorld.y);
      maxZ = Math.max(maxZ, bounds.maximumWorld.z);
    }

    if (![minX, minY, minZ, maxX, maxY, maxZ].every(Number.isFinite)) {
      return null;
    }

    return new Vector3((minX + maxX) * 0.5, (minY + maxY) * 0.5, (minZ + maxZ) * 0.5);
  }

  private transformLocalOffset(localPoint: Vector3, rotation: Vector3, scale: Vector3): Vector3 {
    return Vector3.TransformCoordinates(
      localPoint,
      Matrix.Compose(scale, Quaternion.FromEulerAngles(rotation.x, rotation.y, rotation.z), Vector3.Zero())
    );
  }

  private toVector3(value: readonly [number, number, number]): Vector3 {
    return new Vector3(value[0], value[1], value[2]);
  }

  private normalizeQuarterTurn(value: number): number {
    const fullTurn = Math.PI * 2;
    const normalized = ((value % fullTurn) + fullTurn) % fullTurn;
    return Math.round(normalized / (Math.PI / 2)) * (Math.PI / 2);
  }

  private normalizeFullTurn(value: number): number {
    const fullTurn = Math.PI * 2;
    return ((value % fullTurn) + fullTurn) % fullTurn;
  }
}
