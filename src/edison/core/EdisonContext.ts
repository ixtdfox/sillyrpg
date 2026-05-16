import type { EdisonCommandRegistry } from "./EdisonCommandRegistry";
import type { EdisonEventBus } from "./EdisonEventBus";
import type { EdisonObjectRegistry } from "./EdisonObjectRegistry";
import type { EdisonSceneDocumentService } from "./EdisonSceneDocumentService";
import type { EdisonSelectionService } from "./EdisonSelectionService";
import type { EdisonTransformService } from "./EdisonTransformService";
import type { EdisonViewportService } from "./EdisonViewportService";
import type { EdisonPanelRegistry } from "../layout/EdisonPanelRegistry";
import type { EdisonToolbarRegistry } from "../layout/EdisonToolbarRegistry";
import type { EdisonToolRegistry } from "../tools/EdisonToolRegistry";

export interface EdisonPluginContext {
  readonly apiVersion: "1";
  readonly commands: EdisonCommandRegistry;
  readonly toolbar: EdisonToolbarRegistry;
  readonly panels: EdisonPanelRegistry;
  readonly tools: EdisonToolRegistry;
  readonly selection: EdisonSelectionService;
  readonly scene: EdisonSceneDocumentService;
  readonly viewport: EdisonViewportService;
  readonly objects: EdisonObjectRegistry;
  readonly transforms: EdisonTransformService;
  readonly events: EdisonEventBus;
}
