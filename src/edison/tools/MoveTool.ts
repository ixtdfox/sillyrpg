import type { EdisonTool } from "./EdisonTool";

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

      const clickedObjectId = context.viewport.pickObjectId(nativeEvent.clientX, nativeEvent.clientY);
      const selectedObjectId = context.selection.getSelectedObjectId();
      if (clickedObjectId && clickedObjectId !== selectedObjectId) {
        context.selection.selectSceneObject(clickedObjectId);
      }

      const objectId = clickedObjectId ?? selectedObjectId;
      if (!objectId) {
        context.selection.clear();
        return true;
      }

      const placementPoint = context.viewport.pickGroundPoint(nativeEvent.clientX, nativeEvent.clientY);
      return context.transforms.beginMove(nativeEvent.pointerId, objectId, placementPoint);
    },
    onPointerMove: ({ nativeEvent }, context) => {
      if (!context.transforms.isMovingPointer(nativeEvent.pointerId)) {
        return false;
      }

      const placementPoint = context.viewport.pickGroundPoint(nativeEvent.clientX, nativeEvent.clientY);
      return context.transforms.updateMove(nativeEvent.pointerId, placementPoint);
    },
    onPointerUp: ({ nativeEvent }, context) => {
      return context.transforms.endMove(nativeEvent.pointerId);
    }
  };
}
