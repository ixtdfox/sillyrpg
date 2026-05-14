/** Идентификатор готового lighting preset, доступного сценам и редактору. */
export type LightingPresetId = "day" | "overcast" | "dusk" | "night";

/** Immutable tuple для хранения Vector3-значений в JSON-friendly descriptor'ах. */
export type LightingVector3Tuple = readonly [number, number, number];
/** Тип Babylon shadow generator, который должен быть создан factory. */
export type ShadowGeneratorKind = "standard" | "cascaded";
/** Политика выбора meshes, которые могут отбрасывать тени. */
export type ShadowCasterMode = "all" | "metadata" | "none";
/** Политика выбора meshes, которые могут принимать тени. */
export type ShadowReceiverMode = "terrainOnly" | "all" | "metadata" | "none";
/** Доменный режим фильтрации теней, независимый от конкретных Babylon-флагов. */
export type ShadowFilterMode = "none" | "pcf" | "esm" | "blurEsm";

/**
 * Полный descriptor освещения сцены.
 *
 * Descriptor намеренно хранит только сериализуемые значения. Runtime-классы
 * Babylon появляются позже в `LightingRigFactory`.
 */
export interface SceneLightingDescriptor {
  readonly preset?: LightingPresetId;
  readonly clearColor?: string;
  readonly ambient?: HemisphericLightingDescriptor;
  readonly sun?: DirectionalLightingDescriptor;
  readonly shadows?: ShadowLightingDescriptor;
}

/** Descriptor hemispheric ambient light: мягкий общий свет и цвет земли. */
export interface HemisphericLightingDescriptor {
  readonly enabled?: boolean;
  readonly direction?: LightingVector3Tuple;
  readonly intensity?: number;
  readonly diffuse?: string;
  readonly specular?: string;
  readonly groundColor?: string;
}

/** Descriptor directional sun light: направление, позиция и цветовые параметры солнца. */
export interface DirectionalLightingDescriptor {
  readonly enabled?: boolean;
  readonly direction?: LightingVector3Tuple;
  readonly position?: LightingVector3Tuple;
  readonly intensity?: number;
  readonly diffuse?: string;
  readonly specular?: string;
}

/**
 * Descriptor shadow subsystem.
 *
 * Поля `filter`, `casterMode` и `receiverMode` являются доменными настройками.
 * Legacy boolean-флаги оставлены для совместимости со старыми сценами и затем
 * адаптируются в единый `ShadowFilterMode`.
 */
export interface ShadowLightingDescriptor {
  readonly enabled?: boolean;
  readonly generator?: ShadowGeneratorKind;
  readonly mapSize?: number;
  readonly darkness?: number;
  readonly filter?: ShadowFilterMode;
  readonly useBlurExponentialShadowMap?: boolean;
  readonly usePercentageCloserFiltering?: boolean;
  readonly blurKernel?: number;
  readonly bias?: number;
  readonly normalBias?: number;
  readonly depthScale?: number;
  readonly lambda?: number;
  readonly casterMode?: ShadowCasterMode;
  readonly receiverMode?: ShadowReceiverMode;
  readonly includeCharacters?: boolean;
  readonly includeSceneObjects?: boolean;
  readonly includeTerrain?: boolean;
}
