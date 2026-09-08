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

      const objectId = context.interiorEdit.isActive()
        ? context.viewport.pickObjectId(
            nativeEvent.clientX,
            nativeEvent.clientY,
            (candidateId) => context.interiorEdit.canEditObject(context.scene.getObject(candidateId))
          )
        : context.viewport.pickObjectId(nativeEvent.clientX, nativeEvent.clientY);
      if (objectId) {
        context.selection.selectSceneObject(objectId);
      }
      const selectedObjectId = objectId ?? context.selection.getSelectedObjectId();
      if (!selectedObjectId) {
        return false;
      }

      if (!context.interiorEdit.canEditObject(context.scene.getObject(selectedObjectId))) {
        context.selection.clear();
        return true;
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
