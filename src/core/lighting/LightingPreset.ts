import type {
  DirectionalLightingDescriptor,
  HemisphericLightingDescriptor,
  LightingPresetId,
  SceneLightingDescriptor,
  ShadowLightingDescriptor
} from "./LightingTypes";

const SAFE_OUTDOOR_SHADOWS: ShadowLightingDescriptor = {
  enabled: true,
  generator: "cascaded",
  mapSize: 2048,
  darkness: 0.45,
  filter: "pcf",
  usePercentageCloserFiltering: true,
  useBlurExponentialShadowMap: false,
  blurKernel: 0,
  bias: 0.0005,
  normalBias: 0.02,
  depthScale: 60,
  lambda: 0.65,
  casterMode: "all",
  receiverMode: "terrainOnly",
  includeSceneObjects: true,
  includeCharacters: true,
  includeTerrain: false
};

const LIGHTING_PRESETS: Readonly<Record<LightingPresetId, SceneLightingDescriptor>> = {
  day: {
    preset: "day",
    clearColor: "#8DB7D6",
    ambient: {
      enabled: true,
      direction: [0, 1, 0],
      intensity: 0.55,
      diffuse: "#FFFFFF",
      specular: "#DDEEFF",
      groundColor: "#6E7565"
    },
    sun: {
      enabled: true,
      direction: [-0.55, -1.0, -0.35],
      position: [60, 90, 40],
      intensity: 1.05,
      diffuse: "#FFF4D6",
      specular: "#FFFFFF"
    },
    shadows: {
      ...SAFE_OUTDOOR_SHADOWS
    }
  },
  overcast: {
    preset: "overcast",
    clearColor: "#A9B8C3",
    ambient: {
      enabled: true,
      direction: [0, 1, 0],
      intensity: 0.72,
      diffuse: "#F1F4F5",
      specular: "#C9D6DD",
      groundColor: "#70786E"
    },
    sun: {
      enabled: true,
      direction: [-0.35, -1.0, -0.2],
      position: [45, 85, 32],
      intensity: 0.55,
      diffuse: "#E8ECEB",
      specular: "#EEF2F2"
    },
    shadows: {
      ...SAFE_OUTDOOR_SHADOWS,
      normalBias: 0.025
    }
  },
  dusk: {
    preset: "dusk",
    clearColor: "#D19A74",
    ambient: {
      enabled: true,
      direction: [0, 1, 0],
      intensity: 0.42,
      diffuse: "#F2C6A2",
      specular: "#F1D1B8",
      groundColor: "#5F594F"
    },
    sun: {
      enabled: true,
      direction: [-0.75, -0.35, -0.25],
      position: [85, 35, 36],
      intensity: 0.82,
      diffuse: "#FFB35B",
      specular: "#FFE2B3"
    },
    shadows: {
      ...SAFE_OUTDOOR_SHADOWS,
      normalBias: 0.025
    }
  },
  night: {
    preset: "night",
    clearColor: "#202C46",
    ambient: {
      enabled: true,
      direction: [0, 1, 0],
      intensity: 0.24,
      diffuse: "#7D91B7",
      specular: "#9DADD0",
      groundColor: "#252B38"
    },
    sun: {
      enabled: true,
      direction: [0.35, -1.0, 0.2],
      position: [-45, 70, -32],
      intensity: 0.18,
      diffuse: "#9FB5E7",
      specular: "#C7D5FF"
    },
    shadows: {
      ...SAFE_OUTDOOR_SHADOWS,
      normalBias: 0.03
    }
  }
};

/**
 * Prototype helper для безопасного копирования lighting descriptor'ов.
 *
 * Пресеты используются как шаблоны. Любой потребитель получает отдельный объект,
 * чтобы редактор, парсер или runtime-контроллер не могли случайно мутировать
 * общий preset singleton.
 */
export class SceneLightingDescriptorCloner {
  /** Создает глубокий клон descriptor на уровне всех вложенных lighting-объектов. */
  public clone(descriptor: SceneLightingDescriptor): SceneLightingDescriptor {
    return {
      preset: descriptor.preset,
      clearColor: descriptor.clearColor,
      ambient: this.cloneHemisphericLightingDescriptor(descriptor.ambient),
      sun: this.cloneDirectionalLightingDescriptor(descriptor.sun),
      shadows: this.cloneShadowLightingDescriptor(descriptor.shadows)
    };
  }

  private cloneHemisphericLightingDescriptor(
    descriptor: HemisphericLightingDescriptor | undefined
  ): HemisphericLightingDescriptor | undefined {
    if (!descriptor) {
      return undefined;
    }

    return {
      ...descriptor,
      direction: descriptor.direction ? ([...descriptor.direction] as const) : undefined
    };
  }

  private cloneDirectionalLightingDescriptor(
    descriptor: DirectionalLightingDescriptor | undefined
  ): DirectionalLightingDescriptor | undefined {
    if (!descriptor) {
      return undefined;
    }

    return {
      ...descriptor,
      direction: descriptor.direction ? ([...descriptor.direction] as const) : undefined,
      position: descriptor.position ? ([...descriptor.position] as const) : undefined
    };
  }

  private cloneShadowLightingDescriptor(
    descriptor: ShadowLightingDescriptor | undefined
  ): ShadowLightingDescriptor | undefined {
    return descriptor ? { ...descriptor } : undefined;
  }
}

/**
 * Repository/Singleton для доменных пресетов освещения.
 *
 * Класс скрывает storage-пресетов и всегда возвращает клоны. В результате
 * остальные слои работают с объектным сервисом, а не с набором свободных
 * функций вокруг глобального словаря.
 */
export class LightingPresetCatalog {
  public static readonly DEFAULT_PRESET_ID: LightingPresetId = "day";
  private static readonly shared = new LightingPresetCatalog();

  /** Возвращает общий singleton-каталог для внешних слоев без ручного wiring. */
  public static getShared(): LightingPresetCatalog {
    return LightingPresetCatalog.shared;
  }

  public constructor(
    private readonly presets: Readonly<Record<LightingPresetId, SceneLightingDescriptor>> = LIGHTING_PRESETS,
    private readonly cloner: SceneLightingDescriptorCloner = new SceneLightingDescriptorCloner()
  ) {}

  /** Возвращает клон выбранного preset-шаблона. */
  public get(presetId: LightingPresetId): SceneLightingDescriptor {
    return this.cloner.clone(this.presets[presetId]);
  }

  /** Возвращает клон дефолтного preset-шаблона. */
  public createDefault(): SceneLightingDescriptor {
    return this.get(LightingPresetCatalog.DEFAULT_PRESET_ID);
  }

  /** Явно копирует произвольный descriptor тем же prototype-механизмом. */
  public clone(descriptor: SceneLightingDescriptor): SceneLightingDescriptor {
    return this.cloner.clone(descriptor);
  }
}
