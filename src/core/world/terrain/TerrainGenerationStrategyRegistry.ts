import { DEFAULT_TERRAIN_PRESET, type TerrainStrategyId } from "./TerrainTypes";
import { TerrainGeneratorPresetCatalog } from "./TerrainGeneratorPresets";
import type { TerrainGenerationStrategy } from "./TerrainGenerationStrategy";

/**
 * Registry стратегий генерации высот.
 *
 * Это Strategy Registry: descriptor может запросить конкретную стратегию, но
 * если строка неизвестна, registry мягко возвращается к стратегии preset'а или
 * defaultStrategyId.
 */
export class TerrainGenerationStrategyRegistry {
  private readonly strategies: Map<string, TerrainGenerationStrategy>;
  private readonly defaultStrategyId: TerrainStrategyId;
  private readonly presetCatalog: TerrainGeneratorPresetCatalog;

  public constructor(
    strategies: readonly TerrainGenerationStrategy[],
    defaultStrategyId: TerrainStrategyId = "urbanPad",
    presetCatalog = new TerrainGeneratorPresetCatalog()
  ) {
    this.strategies = new Map(strategies.map((strategy) => [strategy.id, strategy]));
    this.defaultStrategyId = defaultStrategyId;
    this.presetCatalog = presetCatalog;
  }

  /**
   * Разрешает фактический strategy id для descriptor generator.
   */
  public resolveStrategyId(generator: { readonly preset: string; readonly strategy?: string }): TerrainStrategyId {
    const requested = generator.strategy;
    if (requested && this.strategies.has(requested)) {
      return requested as TerrainStrategyId;
    }

    const preset = this.presetCatalog.getPreset(generator.preset || DEFAULT_TERRAIN_PRESET);
    if (preset.generator.strategy && this.strategies.has(preset.generator.strategy)) {
      return preset.generator.strategy as TerrainStrategyId;
    }

    return this.defaultStrategyId;
  }

  /**
   * Возвращает стратегию с fallback на default strategy.
   */
  public getStrategy(strategyId: TerrainStrategyId): TerrainGenerationStrategy {
    return this.strategies.get(strategyId) ?? this.strategies.get(this.defaultStrategyId)!;
  }
}
