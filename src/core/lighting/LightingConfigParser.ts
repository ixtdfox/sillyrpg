import { LightingPresetCatalog } from "./LightingPreset";
import type {
  DirectionalLightingDescriptor,
  HemisphericLightingDescriptor,
  LightingPresetId,
  LightingVector3Tuple,
  SceneLightingDescriptor,
  ShadowCasterMode,
  ShadowFilterMode,
  ShadowGeneratorKind,
  ShadowLightingDescriptor,
  ShadowReceiverMode
} from "./LightingTypes";

const LIGHTING_PRESET_IDS: readonly LightingPresetId[] = ["day", "overcast", "dusk", "night"];
const SHADOW_GENERATOR_KINDS: readonly ShadowGeneratorKind[] = ["standard", "cascaded"];
const SHADOW_CASTER_MODES: readonly ShadowCasterMode[] = ["all", "metadata", "none"];
const SHADOW_RECEIVER_MODES: readonly ShadowReceiverMode[] = ["terrainOnly", "all", "metadata", "none"];
const SHADOW_FILTER_MODES: readonly ShadowFilterMode[] = ["none", "pcf", "esm", "blurEsm"];
const HEX_COLOR_PATTERN = /^#[0-9A-Fa-f]{6}$/;

/**
 * Фасад разбора lighting-секции из JSON-дескриптора сцены.
 *
 * Класс держит весь алгоритм нормализации рядом с зависимостями: каталогом
 * пресетов, валидатором низкоуровневых полей и адаптером старых shadow-флагов.
 * Такой фасад проще тестировать и расширять: новый источник пресетов или
 * другая политика валидации подставляются через конструктор, а не через
 * глобальные функции.
 */
export class LightingConfigParser {
  public constructor(
    private readonly presetCatalog: LightingPresetCatalog = LightingPresetCatalog.getShared(),
    private readonly fields: LightingConfigFieldReader = new LightingConfigFieldReader(),
    private readonly legacyShadowFilterAdapter: LegacyShadowFilterAdapter = new LegacyShadowFilterAdapter()
  ) {}

  /**
   * Разбирает произвольное значение в полный descriptor освещения.
   *
   * Если секция отсутствует, возвращается клон дефолтного дневного пресета.
   * Если секция задана частично, сначала выбирается базовый пресет, затем
   * поверх него накладываются только валидные пользовательские overrides.
   */
  public parseSceneLightingDescriptor(value: unknown, sourceLabel: string): SceneLightingDescriptor {
    if (value === undefined) {
      return this.presetCatalog.createDefault();
    }

    const record = this.fields.requireRecord(value, `${sourceLabel} must be an object.`);
    const preset = this.parseLightingPresetId(record.preset, `${sourceLabel}.preset`) ?? LightingPresetCatalog.DEFAULT_PRESET_ID;
    const base = this.presetCatalog.get(preset);

    return {
      ...base,
      preset,
      clearColor:
        record.clearColor === undefined ? base.clearColor : this.fields.requireHexColor(record.clearColor, `${sourceLabel}.clearColor`),
      ambient:
        record.ambient === undefined
          ? base.ambient
          : {
              ...(base.ambient ?? {}),
              ...this.parseHemisphericLightingDescriptor(record.ambient, `${sourceLabel}.ambient`)
            },
      sun:
        record.sun === undefined
          ? base.sun
          : {
              ...(base.sun ?? {}),
              ...this.parseDirectionalLightingDescriptor(record.sun, `${sourceLabel}.sun`)
            },
      shadows:
        record.shadows === undefined
          ? base.shadows
          : {
              ...(base.shadows ?? {}),
              ...this.parseShadowLightingDescriptor(record.shadows, `${sourceLabel}.shadows`)
            }
    };
  }

  /**
   * Разбирает частичное описание hemispheric light.
   *
   * Метод возвращает только поля, реально присутствовавшие во входе. Слияние с
   * пресетом выполняет фасад, поэтому здесь нет неявных fallback-значений.
   */
  private parseHemisphericLightingDescriptor(value: unknown, sourceLabel: string): HemisphericLightingDescriptor {
    const record = this.fields.requireRecord(value, `${sourceLabel} must be an object.`);
    const enabled = this.fields.optionalBoolean(record.enabled, `${sourceLabel}.enabled must be a boolean if provided.`);
    const direction = this.fields.optionalVector3Tuple(record.direction, `${sourceLabel}.direction`);
    const intensity = this.fields.optionalFiniteNumber(record.intensity, `${sourceLabel}.intensity must be a finite number if provided.`);
    const diffuse = this.fields.optionalHexColor(record.diffuse, `${sourceLabel}.diffuse`);
    const specular = this.fields.optionalHexColor(record.specular, `${sourceLabel}.specular`);
    const groundColor = this.fields.optionalHexColor(record.groundColor, `${sourceLabel}.groundColor`);

    return {
      ...(enabled !== undefined ? { enabled } : {}),
      ...(direction !== undefined ? { direction } : {}),
      ...(intensity !== undefined ? { intensity } : {}),
      ...(diffuse !== undefined ? { diffuse } : {}),
      ...(specular !== undefined ? { specular } : {}),
      ...(groundColor !== undefined ? { groundColor } : {})
    };
  }

  /**
   * Разбирает частичное описание directional light.
   *
   * Direction и position валидируются одинаково, но остаются разными полями
   * descriptor, потому что downstream factory трактует direction как нормаль, а
   * position как точку размещения источника света.
   */
  private parseDirectionalLightingDescriptor(value: unknown, sourceLabel: string): DirectionalLightingDescriptor {
    const record = this.fields.requireRecord(value, `${sourceLabel} must be an object.`);
    const enabled = this.fields.optionalBoolean(record.enabled, `${sourceLabel}.enabled must be a boolean if provided.`);
    const direction = this.fields.optionalVector3Tuple(record.direction, `${sourceLabel}.direction`);
    const position = this.fields.optionalVector3Tuple(record.position, `${sourceLabel}.position`);
    const intensity = this.fields.optionalFiniteNumber(record.intensity, `${sourceLabel}.intensity must be a finite number if provided.`);
    const diffuse = this.fields.optionalHexColor(record.diffuse, `${sourceLabel}.diffuse`);
    const specular = this.fields.optionalHexColor(record.specular, `${sourceLabel}.specular`);

    return {
      ...(enabled !== undefined ? { enabled } : {}),
      ...(direction !== undefined ? { direction } : {}),
      ...(position !== undefined ? { position } : {}),
      ...(intensity !== undefined ? { intensity } : {}),
      ...(diffuse !== undefined ? { diffuse } : {}),
      ...(specular !== undefined ? { specular } : {})
    };
  }

  /**
   * Разбирает shadow-настройки и поддерживает оба формата фильтрации.
   *
   * Новый формат использует поле `filter`. Старые descriptor'ы могли хранить
   * пару boolean-флагов Babylon (`usePercentageCloserFiltering`,
   * `useBlurExponentialShadowMap`), поэтому адаптер переводит их в единый
   * доменный enum, если explicit `filter` не задан.
   */
  private parseShadowLightingDescriptor(value: unknown, sourceLabel: string): ShadowLightingDescriptor {
    const record = this.fields.requireRecord(value, `${sourceLabel} must be an object.`);
    const enabled = this.fields.optionalBoolean(record.enabled, `${sourceLabel}.enabled must be a boolean if provided.`);
    const generator = this.fields.optionalEnum(record.generator, SHADOW_GENERATOR_KINDS, `${sourceLabel}.generator`);
    const mapSize = this.fields.optionalFiniteInteger(record.mapSize, `${sourceLabel}.mapSize must be a finite integer if provided.`);
    const cascadeCount = this.fields.optionalFiniteInteger(record.cascadeCount, `${sourceLabel}.cascadeCount must be a finite integer if provided.`);
    const shadowMaxZ = this.fields.optionalFiniteNumber(record.shadowMaxZ, `${sourceLabel}.shadowMaxZ must be a finite number if provided.`);
    const freezeShadowCastersBoundingInfo = this.fields.optionalBoolean(
      record.freezeShadowCastersBoundingInfo,
      `${sourceLabel}.freezeShadowCastersBoundingInfo must be a boolean if provided.`
    );
    const darkness = this.fields.optionalFiniteNumber(record.darkness, `${sourceLabel}.darkness must be a finite number if provided.`);
    const parsedFilter = this.fields.optionalEnum(record.filter, SHADOW_FILTER_MODES, `${sourceLabel}.filter`);
    const useBlurExponentialShadowMap = this.fields.optionalBoolean(
      record.useBlurExponentialShadowMap,
      `${sourceLabel}.useBlurExponentialShadowMap must be a boolean if provided.`
    );
    const usePercentageCloserFiltering = this.fields.optionalBoolean(
      record.usePercentageCloserFiltering,
      `${sourceLabel}.usePercentageCloserFiltering must be a boolean if provided.`
    );
    const blurKernel = this.fields.optionalFiniteNumber(record.blurKernel, `${sourceLabel}.blurKernel must be a finite number if provided.`);
    const bias = this.fields.optionalFiniteNumber(record.bias, `${sourceLabel}.bias must be a finite number if provided.`);
    const normalBias = this.fields.optionalFiniteNumber(record.normalBias, `${sourceLabel}.normalBias must be a finite number if provided.`);
    const depthScale = this.fields.optionalFiniteNumber(record.depthScale, `${sourceLabel}.depthScale must be a finite number if provided.`);
    const lambda = this.fields.optionalFiniteNumber(record.lambda, `${sourceLabel}.lambda must be a finite number if provided.`);
    const casterMode = this.fields.optionalEnum(record.casterMode, SHADOW_CASTER_MODES, `${sourceLabel}.casterMode`);
    const receiverMode = this.fields.optionalEnum(record.receiverMode, SHADOW_RECEIVER_MODES, `${sourceLabel}.receiverMode`);
    const includeCharacters = this.fields.optionalBoolean(record.includeCharacters, `${sourceLabel}.includeCharacters must be a boolean if provided.`);
    const includeSceneObjects = this.fields.optionalBoolean(record.includeSceneObjects, `${sourceLabel}.includeSceneObjects must be a boolean if provided.`);
    const includeTerrain = this.fields.optionalBoolean(record.includeTerrain, `${sourceLabel}.includeTerrain must be a boolean if provided.`);
    const preferBuildingShadowProxies = this.fields.optionalBoolean(
      record.preferBuildingShadowProxies,
      `${sourceLabel}.preferBuildingShadowProxies must be a boolean if provided.`
    );
    const filter =
      parsedFilter ??
      this.legacyShadowFilterAdapter.toFilterMode(usePercentageCloserFiltering, useBlurExponentialShadowMap);

    return {
      ...(enabled !== undefined ? { enabled } : {}),
      ...(generator !== undefined ? { generator } : {}),
      ...(mapSize !== undefined ? { mapSize } : {}),
      ...(cascadeCount !== undefined ? { cascadeCount } : {}),
      ...(shadowMaxZ !== undefined ? { shadowMaxZ } : {}),
      ...(freezeShadowCastersBoundingInfo !== undefined ? { freezeShadowCastersBoundingInfo } : {}),
      ...(darkness !== undefined ? { darkness } : {}),
      ...(filter !== undefined ? { filter } : {}),
      ...(useBlurExponentialShadowMap !== undefined ? { useBlurExponentialShadowMap } : {}),
      ...(usePercentageCloserFiltering !== undefined ? { usePercentageCloserFiltering } : {}),
      ...(blurKernel !== undefined ? { blurKernel } : {}),
      ...(bias !== undefined ? { bias } : {}),
      ...(normalBias !== undefined ? { normalBias } : {}),
      ...(depthScale !== undefined ? { depthScale } : {}),
      ...(lambda !== undefined ? { lambda } : {}),
      ...(casterMode !== undefined ? { casterMode } : {}),
      ...(receiverMode !== undefined ? { receiverMode } : {}),
      ...(includeCharacters !== undefined ? { includeCharacters } : {}),
      ...(includeSceneObjects !== undefined ? { includeSceneObjects } : {}),
      ...(includeTerrain !== undefined ? { includeTerrain } : {}),
      ...(preferBuildingShadowProxies !== undefined ? { preferBuildingShadowProxies } : {})
    };
  }

  /** Валидирует preset как доменный enum и оставляет отсутствие поля валидным override-сценарием. */
  private parseLightingPresetId(value: unknown, sourceLabel: string): LightingPresetId | undefined {
    return this.fields.optionalEnum(value, LIGHTING_PRESET_IDS, sourceLabel);
  }
}

/**
 * Низкоуровневый reader/validator для атомарных JSON-полей.
 *
 * Он инкапсулирует повторяемые проверки типов и форматы ошибок. За счет этого
 * `LightingConfigParser` остается orchestration-классом, а не набором
 * процедурных guard-функций.
 */
export class LightingConfigFieldReader {
  /** Требует plain-object и отсекает `null`, массивы и примитивы. */
  public requireRecord(value: unknown, errorMessage: string): Record<string, unknown> {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw new Error(errorMessage);
    }

    return value as Record<string, unknown>;
  }

  /** Читает optional boolean: `undefined` означает отсутствие override, любой другой тип считается ошибкой. */
  public optionalBoolean(value: unknown, errorMessage: string): boolean | undefined {
    if (value === undefined) {
      return undefined;
    }

    if (typeof value !== "boolean") {
      throw new Error(errorMessage);
    }

    return value;
  }

  /** Читает optional enum и строит сообщение об ошибке из разрешенного списка значений. */
  public optionalEnum<T extends string>(
    value: unknown,
    allowedValues: readonly T[],
    sourceLabel: string
  ): T | undefined {
    if (value === undefined) {
      return undefined;
    }

    if (typeof value !== "string") {
      throw new Error(`${sourceLabel} must be a string if provided.`);
    }

    if (!allowedValues.includes(value as T)) {
      throw new Error(`${sourceLabel} must be one of: ${allowedValues.map((item) => `'${item}'`).join(", ")}.`);
    }

    return value as T;
  }

  /** Читает Vector3 tuple в JSON-формате `[x, y, z]` и требует конечные числа. */
  public optionalVector3Tuple(value: unknown, sourceLabel: string): LightingVector3Tuple | undefined {
    if (value === undefined) {
      return undefined;
    }

    if (!Array.isArray(value) || value.length !== 3) {
      throw new Error(`${sourceLabel} must be a [x, y, z] tuple.`);
    }

    const [x, y, z] = value;
    if (![x, y, z].every((item) => typeof item === "number" && Number.isFinite(item))) {
      throw new Error(`${sourceLabel} must contain three finite numbers.`);
    }

    return [x, y, z] as const;
  }

  /** Читает optional hex color и делегирует strict-проверку обязательному варианту. */
  public optionalHexColor(value: unknown, sourceLabel: string): string | undefined {
    if (value === undefined) {
      return undefined;
    }

    return this.requireHexColor(value, sourceLabel);
  }

  /** Требует строку цвета ровно в формате `#RRGGBB`. */
  public requireHexColor(value: unknown, sourceLabel: string): string {
    if (typeof value !== "string" || !HEX_COLOR_PATTERN.test(value)) {
      throw new Error(`${sourceLabel} must be a #RRGGBB color string.`);
    }

    return value;
  }

  /** Читает optional finite number и запрещает `NaN`, `Infinity` и строковые числа. */
  public optionalFiniteNumber(value: unknown, errorMessage: string): number | undefined {
    if (value === undefined) {
      return undefined;
    }

    if (typeof value !== "number" || !Number.isFinite(value)) {
      throw new Error(errorMessage);
    }

    return value;
  }

  /** Читает optional integer поверх проверки finite number. */
  public optionalFiniteInteger(value: unknown, errorMessage: string): number | undefined {
    const parsed = this.optionalFiniteNumber(value, errorMessage);
    if (parsed === undefined) {
      return undefined;
    }

    if (!Number.isInteger(parsed)) {
      throw new Error(errorMessage);
    }

    return parsed;
  }
}

/**
 * Adapter для старого способа настройки фильтра теней.
 *
 * Descriptor теперь хранит единый `ShadowFilterMode`, но старые сцены могли
 * использовать Babylon-specific boolean-флаги. Класс оставляет эту совместимость
 * явно выделенной и не смешивает ее с основным парсингом.
 */
export class LegacyShadowFilterAdapter {
  /** Переводит пару legacy boolean-флагов в один современный enum или оставляет фильтр не заданным. */
  public toFilterMode(
    usePercentageCloserFiltering: boolean | undefined,
    useBlurExponentialShadowMap: boolean | undefined
  ): ShadowFilterMode | undefined {
    if (usePercentageCloserFiltering === true) {
      return "pcf";
    }

    if (useBlurExponentialShadowMap === true) {
      return "blurEsm";
    }

    if (usePercentageCloserFiltering === false || useBlurExponentialShadowMap === false) {
      return "none";
    }

    return undefined;
  }
}
