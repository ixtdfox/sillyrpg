import { DEFAULT_TERRAIN_PRESET, type TerrainStrategyId } from "./TerrainTypes";
import { getTerrainGeneratorPreset } from "./TerrainGeneratorPresets";
import type { TerrainGenerationStrategy } from "./TerrainGenerationStrategy";

export class TerrainGenerationStrategyRegistry {
  private readonly strategies: Map<string, TerrainGenerationStrategy>;
  private readonly defaultStrategyId: TerrainStrategyId;

  public constructor(strategies: readonly TerrainGenerationStrategy[], defaultStrategyId: TerrainStrategyId = "urbanPad") {
    this.strategies = new Map(strategies.map((strategy) => [strategy.id, strategy]));
    this.defaultStrategyId = defaultStrategyId;
  }

  public resolveStrategyId(generator: { readonly preset: string; readonly strategy?: string }): TerrainStrategyId {
    const requested = generator.strategy;
    if (requested && this.strategies.has(requested)) {
      return requested as TerrainStrategyId;
    }

    const preset = getTerrainGeneratorPreset(generator.preset || DEFAULT_TERRAIN_PRESET);
    if (preset.generator.strategy && this.strategies.has(preset.generator.strategy)) {
      return preset.generator.strategy as TerrainStrategyId;
    }

    return this.defaultStrategyId;
  }

  public getStrategy(strategyId: TerrainStrategyId): TerrainGenerationStrategy {
    return this.strategies.get(strategyId) ?? this.strategies.get(this.defaultStrategyId)!;
  }
}
