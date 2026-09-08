import type { EdisonCommandRegistry } from "./EdisonCommandRegistry";
import type { EdisonConnectedObjectService } from "./EdisonConnectedObjectService";
import type { EdisonEventBus } from "./EdisonEventBus";
import type { EdisonInteriorEditService } from "./EdisonInteriorEditService";
import type { EdisonInteriorMagicFillService } from "./EdisonInteriorMagicFillService";
import type { EdisonObjectRegistry } from "./EdisonObjectRegistry";
import type { EdisonPlacementService } from "./EdisonPlacementService";
import type { EdisonPreferencesService } from "./EdisonPreferencesService";
import type { EdisonSceneDocumentService } from "./EdisonSceneDocumentService";
import type { EdisonSelectionService } from "./EdisonSelectionService";
import type { EdisonTerrainSnapService } from "./EdisonTerrainSnapService";
import type { EdisonTransformService } from "./EdisonTransformService";
import type { EdisonViewportService } from "./EdisonViewportService";
import type { EdisonPanelRegistry } from "../layout/EdisonPanelRegistry";
import type { EdisonToolbarRegistry } from "../layout/EdisonToolbarRegistry";
import type { EdisonToolRegistry } from "../tools/EdisonToolRegistry";

export interface EdisonPluginContext {
  readonly apiVersion: "1";
  readonly commands: EdisonCommandRegistry;
  readonly connectedObjects: EdisonConnectedObjectService;
  readonly interiorEdit: EdisonInteriorEditService;
  readonly interiorMagicFill: EdisonInteriorMagicFillService;
  readonly toolbar: EdisonToolbarRegistry;
  readonly panels: EdisonPanelRegistry;
  readonly tools: EdisonToolRegistry;
  readonly selection: EdisonSelectionService;
  readonly scene: EdisonSceneDocumentService;
  readonly terrainSnap: EdisonTerrainSnapService;
  readonly viewport: EdisonViewportService;
  readonly objects: EdisonObjectRegistry;
  readonly placement: EdisonPlacementService;
  readonly transforms: EdisonTransformService;
  readonly events: EdisonEventBus;
  readonly preferences: EdisonPreferencesService;
}
