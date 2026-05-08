import type { TerrainBrushSettings, TerrainEditToolId } from "../../../core/world/terrain/editing/TerrainBrushTypes";
import type { TerrainGeneratorPanelStats } from "../EditorTerrainTypes";

export interface TerrainToolsPanelViewModel {
  readonly enabled: boolean;
  readonly hasTerrain: boolean;
  readonly activeTool: TerrainEditToolId;
  readonly brush: TerrainBrushSettings;
  readonly targetHeight: number;
  readonly snapHeightStep: number;
  readonly edited: boolean;
  readonly stats: TerrainGeneratorPanelStats | null;
  readonly message?: string;
}

export interface TerrainToolsPanelCallbacks {
  readonly onSelectTerrainTool: (tool: TerrainEditToolId) => void;
  readonly onChangeBrushSettings: (settings: TerrainBrushSettings) => void;
  readonly onChangeTargetHeight: (height: number) => void;
  readonly onFlattenAllTerrain: () => void;
  readonly onClearTerrainEdits: () => void;
}
