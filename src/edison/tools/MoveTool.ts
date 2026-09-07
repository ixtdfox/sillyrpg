import type { EdisonTool } from "./EdisonTool";
import type { EdisonPluginContext } from "../plugins/EdisonPlugin";
import { Vector3 } from "@babylonjs/core";

export function createMoveTool(): EdisonTool {
  return {
    id: "move",
    title: "Move",
    icon: "move",
    cursor: "grab",
    order: 20,
    onPointerDown: ({ nativeEvent }, context) => {
      if (nativeEvent.button !== 0 || nativeEvent.altKey) {
        return false;
      }

      const pickedObjectId = context.interiorEdit.isActive()
        ? context.viewport.pickObjectId(
            nativeEvent.clientX,
            nativeEvent.clientY,
            (candidateId) => context.interiorEdit.canEditObject(context.scene.getObject(candidateId))
          )
        : context.viewport.pickObjectId(nativeEvent.clientX, nativeEvent.clientY);
      const clickedObjectId = pickedObjectId;
      const selectedObjectId = context.selection.getSelectedObjectId();
      if (clickedObjectId && clickedObjectId !== selectedObjectId) {
        context.selection.selectSceneObject(clickedObjectId);
      }

      const objectId = clickedObjectId ?? selectedObjectId;
      if (!objectId) {
        context.selection.clear();
        return true;
      }

      if (!context.interiorEdit.canEditObject(context.scene.getObject(objectId))) {
        context.selection.clear();
        return true;
      }

      const placementPoint = pickMovePoint(nativeEvent.clientX, nativeEvent.clientY, objectId, context);
      return context.transforms.beginMove(
        nativeEvent.pointerId,
        objectId,
        placementPoint,
        createMoveSnapper(objectId, context)
      );
    },
    onPointerMove: ({ nativeEvent }, context) => {
      if (!context.transforms.isMovingPointer(nativeEvent.pointerId)) {
        return false;
      }

      const objectId = context.transforms.getMovingObjectId(nativeEvent.pointerId);
      const placementPoint = objectId
        ? pickMovePoint(nativeEvent.clientX, nativeEvent.clientY, objectId, context)
        : null;
      return context.transforms.updateMove(nativeEvent.pointerId, placementPoint);
    },
    onPointerUp: ({ nativeEvent }, context) => {
      return context.transforms.endMove(nativeEvent.pointerId);
    }
  };
}

function pickMovePoint(clientX: number, clientY: number, objectId: string, context: EdisonPluginContext) {
  const state = context.interiorEdit.getState();
  const object = context.scene.getObject(objectId);
  if (state && context.interiorEdit.canEditObject(object)) {
    return context.viewport.pickInteriorFloorPoint(clientX, clientY, state.activeBuildingId, state.activeStoryIndex);
  }

  return context.viewport.pickGroundPoint(clientX, clientY);
}

function createMoveSnapper(objectId: string, context: EdisonPluginContext) {
  const state = context.interiorEdit.getState();
  const object = context.scene.getObject(objectId);
  if (!state || !context.interiorEdit.canEditObject(object)) {
    return undefined;
  }

  return (rawPosition: Vector3, currentPosition: Vector3) => {
    const snappedPosition = context.viewport.snapInteriorFloorPoint(rawPosition, state.activeBuildingId, state.activeStoryIndex);
    return snappedPosition
      ? new Vector3(snappedPosition.x, currentPosition.y, snappedPosition.z)
      : null;
  };
}
