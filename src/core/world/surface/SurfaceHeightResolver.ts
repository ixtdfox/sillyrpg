import { Vector3 } from "@babylonjs/core";
import type { GridCell } from "../../grid/GridCell";
import type { RectGridRuntime } from "../../grid/RectGridRuntime";
import type { TerrainSurfaceRegistry } from "../terrain/TerrainSurfaceRegistry";

/**
 * Источник итоговой высоты, выбранный SurfaceHeightResolver.
 */
export type SurfaceHeightSource =
  | "terrain-heightfield"
  | "navigation-story"
  | "raycast"
  | "fallback";

/**
 * Запрос на высоту поверхности под world position.
 */
export interface SurfaceHeightRequest {
  readonly position: Vector3;
  readonly cell?: GridCell;
  readonly storyIndex: number;
  readonly fallbackY?: number;
}

/**
 * Результат выбора высоты вместе с источником для диагностики.
 */
export interface SurfaceHeightResult {
  readonly y: number;
  readonly source: SurfaceHeightSource;
  readonly storyIndex: number;
}

/**
 * Минимальный контекст, который нужен стратегиям выбора surface height.
 */
export interface SurfaceHeightResolverContext {
  readonly gridRuntime: Pick<RectGridRuntime, "getMergedStoryYByStory" | "getGrid">;
  readonly terrainSurfaceRegistry: Pick<TerrainSurfaceRegistry, "sampleWorldHeight">;
}

/**
 * Strategy выбора высоты из одного конкретного источника.
 */
export interface SurfaceHeightStrategy {
  readonly source: SurfaceHeightSource;
  resolve(input: SurfaceHeightRequest, context: SurfaceHeightResolverContext): SurfaceHeightResult | null;
}

/**
 * Strategy terrain heightfield.
 *
 * Terrain используется только для storyIndex=0: верхние этажи должны оставаться
 * привязанными к navigation stories, иначе персонажи на зданиях провалятся на
 * рельеф под ними.
 */
export class TerrainHeightfieldSurfaceStrategy implements SurfaceHeightStrategy {
  public readonly source = "terrain-heightfield";

  /**
   * Возвращает terrain world Y под X/Z или null, если terrain неприменим.
   */
  public resolve(
    input: SurfaceHeightRequest,
    context: SurfaceHeightResolverContext
  ): SurfaceHeightResult | null {
    if (input.storyIndex !== 0) {
      return null;
    }

    const terrainY = context.terrainSurfaceRegistry.sampleWorldHeight(input.position.x, input.position.z);
    if (terrainY === null || !Number.isFinite(terrainY)) {
      return null;
    }

    return {
      y: terrainY,
      source: this.source,
      storyIndex: input.storyIndex
    };
  }
}

/**
 * Strategy высоты navigation story.
 */
export class NavigationStorySurfaceStrategy implements SurfaceHeightStrategy {
  public readonly source = "navigation-story";

  /**
   * Берет высоту этажа из merged story map или origin Y сетки.
   */
  public resolve(
    input: SurfaceHeightRequest,
    context: SurfaceHeightResolverContext
  ): SurfaceHeightResult | null {
    const storyY =
      context.gridRuntime.getMergedStoryYByStory().get(input.storyIndex) ??
      context.gridRuntime.getGrid().getOrigin().y;

    if (!Number.isFinite(storyY)) {
      return null;
    }

    return {
      y: storyY,
      source: this.source,
      storyIndex: input.storyIndex
    };
  }
}

/**
 * Последняя Strategy цепочки: безопасный fallback на fallbackY или input.position.y.
 */
export class FallbackSurfaceHeightStrategy implements SurfaceHeightStrategy {
  public readonly source = "fallback";

  /**
   * Всегда возвращает результат, чтобы resolver не оставался без высоты.
   */
  public resolve(input: SurfaceHeightRequest, _context?: SurfaceHeightResolverContext): SurfaceHeightResult {
    return {
      y: input.fallbackY ?? input.position.y,
      source: this.source,
      storyIndex: input.storyIndex
    };
  }
}

/**
 * Политика включения debug-логов surface height.
 */
export class SurfaceHeightDebugPolicy {
  private readonly storageKey: string;

  public constructor(storageKey = "sillyrpg.debug.surfaceHeight") {
    this.storageKey = storageKey;
  }

  /**
   * Проверяет localStorage, не выбрасывая ошибки в headless/test окружениях.
   */
  public isEnabled(): boolean {
    try {
      return globalThis.localStorage?.getItem(this.storageKey) === "1";
    } catch {
      return false;
    }
  }
}

/**
 * Logger diagnostic events для SurfaceHeightResolver.
 */
export class SurfaceHeightDebugLogger {
  private readonly debugPolicy: SurfaceHeightDebugPolicy;
  private lastDebugKey: string | null;

  public constructor(debugPolicy = new SurfaceHeightDebugPolicy()) {
    this.debugPolicy = debugPolicy;
    this.lastDebugKey = null;
  }

  /**
   * Логирует только новые состояния, чтобы не шуметь одинаковыми кадрами.
   */
  public log(result: SurfaceHeightResult, input: SurfaceHeightRequest): void {
    if (!this.debugPolicy.isEnabled()) {
      return;
    }

    const cellKey = input.cell ? `${input.cell.x}:${input.cell.z}` : "n/a";
    const debugKey = `${result.source}:${result.storyIndex}:${cellKey}:${result.y.toFixed(2)}`;
    if (debugKey === this.lastDebugKey) {
      return;
    }

    this.lastDebugKey = debugKey;
    console.debug(
      `[SurfaceHeight] source=${result.source} story=${result.storyIndex} cell=${cellKey} y=${result.y.toFixed(2)}`
    );
  }
}

/**
 * Facade выбора высоты поверхности для gameplay navigation.
 *
 * Класс использует Chain of Responsibility: стратегии вызываются по порядку и
 * первая успешная возвращает SurfaceHeightResult. Так terrain, navigation story
 * и fallback остаются независимыми объектами, но внешний код получает один API.
 */
export class SurfaceHeightResolver {
  private readonly context: SurfaceHeightResolverContext;
  private readonly strategies: readonly SurfaceHeightStrategy[];
  private readonly fallbackStrategy: FallbackSurfaceHeightStrategy;
  private readonly debugLogger: SurfaceHeightDebugLogger;

  public constructor(
    gridRuntime: Pick<RectGridRuntime, "getMergedStoryYByStory" | "getGrid">,
    terrainSurfaceRegistry: Pick<TerrainSurfaceRegistry, "sampleWorldHeight">,
    strategies: readonly SurfaceHeightStrategy[] = [
      new TerrainHeightfieldSurfaceStrategy(),
      new NavigationStorySurfaceStrategy(),
      new FallbackSurfaceHeightStrategy()
    ],
    debugLogger = new SurfaceHeightDebugLogger(),
    fallbackStrategy = new FallbackSurfaceHeightStrategy()
  ) {
    this.context = {
      gridRuntime,
      terrainSurfaceRegistry
    };
    this.strategies = strategies;
    this.debugLogger = debugLogger;
    this.fallbackStrategy = fallbackStrategy;
  }

  /**
   * Возвращает высоту поверхности по приоритетной цепочке стратегий.
   */
  public resolveY(input: SurfaceHeightRequest): SurfaceHeightResult {
    const result = this.resolveFromStrategies(input);
    this.debugLogger.log(result, input);
    return result;
  }

  /**
   * Возвращает grounded world position с дополнительным foot offset.
   */
  public resolveGroundedPosition(input: SurfaceHeightRequest & { footOffset?: number }): Vector3 {
    const resolved = this.resolveY(input);
    return new Vector3(
      input.position.x,
      resolved.y + (input.footOffset ?? 0),
      input.position.z
    );
  }

  private resolveFromStrategies(input: SurfaceHeightRequest): SurfaceHeightResult {
    for (const strategy of this.strategies) {
      const result = strategy.resolve(input, this.context);
      if (result) {
        return result;
      }
    }

    return this.fallbackStrategy.resolve(input, this.context);
  }
}
