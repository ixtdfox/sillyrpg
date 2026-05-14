import type { TerrainBrushSettings, TerrainEditToolId } from "../editing/TerrainBrushTypes";
import type { TerrainTextureLayerDescriptor } from "../editing/TerrainTextureLayer";
import type { TerrainGeneratorPanelStats } from "../EditorTerrainTypes";

export interface TerrainTextureLayerViewModel extends TerrainTextureLayerDescriptor {
  readonly paintable: boolean;
}

export interface TerrainToolsPanelViewModel {
  readonly enabled: boolean;
  readonly hasTerrain: boolean;
  readonly activeTool: TerrainEditToolId;
  readonly brush: TerrainBrushSettings;
  readonly targetHeight: number;
  readonly snapHeightStep: number;
  readonly edited: boolean;
  readonly stats: TerrainGeneratorPanelStats | null;
  readonly textureLayers: readonly TerrainTextureLayerViewModel[];
  readonly selectedTextureLayerId: string | null;
  readonly textureLayerLimitMessage?: string;
  readonly message?: string;
}

export interface TerrainToolsPanelCallbacks {
  readonly onSelectTerrainTool: (tool: TerrainEditToolId) => void;
  readonly onChangeBrushSettings: (settings: TerrainBrushSettings) => void;
  readonly onSelectTextureLayer: (layerId: string) => void;
  readonly onChangeTargetHeight: (height: number) => void;
  readonly onFlattenAllTerrain: () => void;
  readonly onClearTerrainEdits: () => void;
}
