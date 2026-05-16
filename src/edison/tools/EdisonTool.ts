import type { EdisonPluginContext } from "../plugins/EdisonPlugin";

export interface EdisonToolPointerEvent {
  readonly nativeEvent: PointerEvent;
}

export interface EdisonTool {
  readonly id: string;
  readonly title: string;
  readonly icon?: string;
  readonly cursor?: string;
  readonly order?: number;
  activate?: () => void;
  deactivate?: () => void;
  onPointerDown?: (event: EdisonToolPointerEvent, context: EdisonPluginContext) => boolean | void;
  onPointerMove?: (event: EdisonToolPointerEvent, context: EdisonPluginContext) => boolean | void;
  onPointerUp?: (event: EdisonToolPointerEvent, context: EdisonPluginContext) => boolean | void;
}
