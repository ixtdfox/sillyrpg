import type { EdisonTool } from "./EdisonTool";

export function createDeleteTool(): EdisonTool {
  return {
    id: "delete",
    title: "Delete",
    icon: "delete",
    cursor: "not-allowed",
    order: 40,
    onPointerDown: ({ nativeEvent }, context) => {
      if (nativeEvent.button !== 0 || nativeEvent.altKey) {
        return false;
      }

      const objectId = context.viewport.pickObjectId(nativeEvent.clientX, nativeEvent.clientY);
      if (objectId) {
        context.selection.selectSceneObject(objectId);
      }
      context.transforms.deleteSelected();
      return true;
    }
  };
}
