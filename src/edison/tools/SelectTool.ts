import type { EdisonTool } from "./EdisonTool";

export function createSelectTool(): EdisonTool {
  return {
    id: "select",
    title: "Select",
    icon: "select",
    cursor: "default",
    order: 10,
    onPointerDown: ({ nativeEvent }, context) => {
      if (nativeEvent.button !== 0 || nativeEvent.altKey) {
        return false;
      }

      const objectId = context.viewport.pickObjectId(nativeEvent.clientX, nativeEvent.clientY);
      if (objectId) {
        context.selection.selectSceneObject(objectId);
      } else {
        context.selection.clear();
      }
      return true;
    }
  };
}
