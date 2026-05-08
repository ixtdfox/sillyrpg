import type { SceneGeneratedTerrainDescriptor } from "../../core/world/scene/SceneDescriptor";

export interface TerrainPresetOption {
  readonly id: string;
  readonly label: string;
  readonly description: string;
}

export interface TerrainGeneratorPanelStats {
  readonly minHeight: number;
  readonly maxHeight: number;
  readonly vertexCount: number;
  readonly triangleCount: number;
}

export interface TerrainGeneratorPanelViewModel {
  readonly enabled: boolean;
  readonly descriptor: SceneGeneratedTerrainDescriptor | null;
  readonly presets: readonly TerrainPresetOption[];
  readonly stats: TerrainGeneratorPanelStats | null;
  readonly dirty: boolean;
  readonly draftDirty: boolean;
  readonly appliedSummary: string;
  readonly message?: string;
}

export interface TerrainGeneratorPanelCallbacks {
  readonly onChangeTerrainDraft: (draft: SceneGeneratedTerrainDescriptor) => void;
  readonly onSelectTerrainPreset: (presetId: string) => void;
  readonly onGenerateTerrain: () => void;
  readonly onRandomizeSeed: () => void;
  readonly onFlattenTerrain: () => void;
  readonly onResetTerrainPreset: (presetId: string) => void;
}
