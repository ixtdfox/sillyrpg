export type LightingPresetId = "day" | "overcast" | "dusk" | "night";

export type LightingVector3Tuple = readonly [number, number, number];
export type ShadowGeneratorKind = "standard" | "cascaded";
export type ShadowCasterMode = "all" | "metadata" | "none";
export type ShadowReceiverMode = "terrainOnly" | "all" | "metadata" | "none";

export interface SceneLightingDescriptor {
  readonly preset?: LightingPresetId;
  readonly clearColor?: string;
  readonly ambient?: HemisphericLightingDescriptor;
  readonly sun?: DirectionalLightingDescriptor;
  readonly shadows?: ShadowLightingDescriptor;
}

export interface HemisphericLightingDescriptor {
  readonly enabled?: boolean;
  readonly direction?: LightingVector3Tuple;
  readonly intensity?: number;
  readonly diffuse?: string;
  readonly specular?: string;
  readonly groundColor?: string;
}

export interface DirectionalLightingDescriptor {
  readonly enabled?: boolean;
  readonly direction?: LightingVector3Tuple;
  readonly position?: LightingVector3Tuple;
  readonly intensity?: number;
  readonly diffuse?: string;
  readonly specular?: string;
}

export interface ShadowLightingDescriptor {
  readonly enabled?: boolean;
  readonly generator?: ShadowGeneratorKind;
  readonly mapSize?: number;
  readonly darkness?: number;
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
