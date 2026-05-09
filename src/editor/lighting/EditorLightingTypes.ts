import type {
  DirectionalLightingDescriptor,
  HemisphericLightingDescriptor,
  LightingPresetId,
  SceneLightingDescriptor,
  ShadowLightingDescriptor
} from "../../core/lighting/LightingTypes";
import type { ShadowDiagnostics } from "../../core/lighting/SceneShadowRegistry";

export interface LightingPresetOption {
  readonly id: LightingPresetId;
  readonly label: string;
}

export interface LightingPanelViewModel {
  readonly enabled: boolean;
  readonly descriptor: SceneLightingDescriptor | null;
  readonly shadowDiagnostics: ShadowDiagnostics | null;
  readonly presetOptions: readonly LightingPresetOption[];
  readonly dirty: boolean;
  readonly message: string;
}

export interface LightingPanelCallbacks {
  readonly onSelectPreset: (presetId: LightingPresetId) => void;
  readonly onChangeClearColor: (value: string) => void;
  readonly onChangeAmbient: (patch: Partial<HemisphericLightingDescriptor>) => void;
  readonly onChangeSun: (patch: Partial<DirectionalLightingDescriptor>) => void;
  readonly onChangeShadows: (patch: Partial<ShadowLightingDescriptor>) => void;
  readonly onResetToPreset: () => void;
}
