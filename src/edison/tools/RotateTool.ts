import type { EdisonTool } from "./EdisonTool";

export function createRotateTool(): EdisonTool {
  return {
    id: "rotate",
    title: "Rotate",
    icon: "rotate",
    cursor: "ew-resize",
    order: 30,
    onPointerDown: ({ nativeEvent }, context) => {
      if (nativeEvent.button !== 0 || nativeEvent.altKey) {
        return false;
      }

      const objectId = context.viewport.pickObjectId(nativeEvent.clientX, nativeEvent.clientY);
      if (objectId) {
        context.selection.selectSceneObject(objectId);
      }
      const selectedObjectId = objectId ?? context.selection.getSelectedObjectId();
      if (!selectedObjectId) {
        return false;
      }

      return context.transforms.beginRotate(
        nativeEvent.pointerId,
        selectedObjectId,
        nativeEvent.clientX,
        nativeEvent.clientY
      );
    },
    onPointerMove: ({ nativeEvent }, context) => {
      return context.transforms.updateRotate(nativeEvent.pointerId, nativeEvent.clientX, nativeEvent.clientY);
    },
    onPointerUp: ({ nativeEvent }, context) => {
      return context.transforms.endRotate(nativeEvent.pointerId);
    }
  };
}
