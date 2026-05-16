export type EdisonPanelSlot =
  | "left.tools"
  | "left.hierarchy"
  | "center.sceneView"
  | "right.inspector"
  | "right.plugins"
  | "bottom.status"
  | "top.toolbar";

export interface EdisonDisposable {
  dispose(): void;
}
