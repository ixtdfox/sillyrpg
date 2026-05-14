/**
 * Общая числовая политика terrain-пакета.
 *
 * В terrain-коде много доменных расчетов, но базовая защита от NaN/Infinity,
 * нормализация интерполяции и smoothstep должны работать одинаково для
 * генератора, редактора кистей, материалов и LOD. Этот класс заменяет набор
 * разрозненных top-level helper-функций.
 */
export class TerrainScalarMath {
  /**
   * Ограничивает число диапазоном [min..max], а non-finite значения заменяет fallback.
   */
  public clampFinite(value: number, min: number, max: number, fallback: number): number {
    if (!Number.isFinite(value)) {
      return fallback;
    }

    return Math.max(min, Math.min(max, value));
  }

  /**
   * Ограничивает число диапазоном [min..max]; non-finite значения считаются min.
   */
  public clamp(value: number, min: number, max: number): number {
    if (!Number.isFinite(value)) {
      return min;
    }

    return Math.max(min, Math.min(max, value));
  }

  /**
   * Ограничивает значение нормализованным диапазоном [0..1].
   */
  public clamp01(value: number): number {
    return this.clamp(value, 0, 1);
  }

  /**
   * Линейная интерполяция с уже готовым коэффициентом t.
   */
  public lerp(a: number, b: number, t: number): number {
    return a + ((b - a) * t);
  }

  /**
   * Линейная интерполяция, где t дополнительно зажимается в [0..1].
   */
  public lerpClamped(a: number, b: number, t: number): number {
    return this.lerp(a, b, this.clamp01(t));
  }

  /**
   * Hermite smoothstep для плавных масок высоты, falloff и noise blending.
   */
  public smoothstep(edge0: number, edge1: number, value: number): number {
    if (edge0 === edge1) {
      return value < edge0 ? 0 : 1;
    }

    const t = this.clamp01((value - edge0) / (edge1 - edge0));
    return t * t * (3 - 2 * t);
  }
}

/**
 * Политика округления индексов height/splat grids.
 *
 * Все terrain grids имеют включительные координаты вершин/texels. Этот класс
 * централизует clamp, чтобы разные подсистемы не расходились на краях карты.
 */
export class TerrainIndexMath {
  private readonly scalarMath: TerrainScalarMath;

  public constructor(scalarMath = new TerrainScalarMath()) {
    this.scalarMath = scalarMath;
  }

  /**
   * Округляет индекс и зажимает его в диапазон [0..count - 1].
   */
  public clampIndex(value: number, count: number): number {
    if (!Number.isFinite(value)) {
      return 0;
    }

    return Math.max(0, Math.min(Math.max(0, count - 1), Math.round(value)));
  }

  /**
   * Нормализует resolution и бросает ошибку, если сетка не может существовать.
   */
  public normalizePositiveResolution(value: number, label: string): number {
    if (!Number.isFinite(value) || value < 1) {
      throw new Error(`TerrainSplatMap ${label} must be at least 1.`);
    }

    return Math.max(1, Math.round(value));
  }

  /**
   * Нормализует индекс chunk'а texture map и валидирует диапазон.
   */
  public normalizeChunkIndex(value: number, count: number): number {
    const rounded = Math.round(value);
    if (!Number.isFinite(value) || rounded < 0 || rounded >= count) {
      throw new Error(`TerrainSplatMap chunkIndex must be between 0 and ${Math.max(0, count - 1)}.`);
    }

    return rounded;
  }

  /**
   * Возвращает значение [0..1] через общую scalar-политику.
   */
  public clamp01(value: number): number {
    return this.scalarMath.clamp01(value);
  }
}
