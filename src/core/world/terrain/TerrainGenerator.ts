import type { SceneGeneratedTerrainDescriptor } from "../scene/SceneDescriptor";
import { TerrainGenerationContext } from "./TerrainGenerationContext";
import { TerrainGenerationStrategyRegistry } from "./TerrainGenerationStrategyRegistry";
import type { TerrainHeightModifier } from "./TerrainHeightModifier";
import { TerrainHeightField } from "./TerrainHeightField";
import { TerrainCenterFlattenModifier } from "./modifiers/TerrainCenterFlattenModifier";
import { TerrainFalloffModifier } from "./modifiers/TerrainFalloffModifier";
import { TerrainHeightQuantizeModifier } from "./modifiers/TerrainHeightQuantizeModifier";
import { TerrainSmoothModifier } from "./modifiers/TerrainSmoothModifier";
import { TerrainTerraceModifier } from "./modifiers/TerrainTerraceModifier";
import { FlatTerrainStrategy } from "./strategies/FlatTerrainStrategy";
import { IslandPlateauTerrainStrategy } from "./strategies/IslandPlateauTerrainStrategy";
import { MountainsTerrainStrategy } from "./strategies/MountainsTerrainStrategy";
import { NoiseTerrainStrategy } from "./strategies/NoiseTerrainStrategy";
import { RockyRidgesTerrainStrategy } from "./strategies/RockyRidgesTerrainStrategy";
import { UrbanPadTerrainStrategy } from "./strategies/UrbanPadTerrainStrategy";

export class TerrainGenerator {
  private readonly strategyRegistry: TerrainGenerationStrategyRegistry;
  private readonly modifiers: readonly TerrainHeightModifier[];

  public constructor(
    strategyRegistry = new TerrainGenerationStrategyRegistry([
      new FlatTerrainStrategy(),
      new NoiseTerrainStrategy(),
      new UrbanPadTerrainStrategy(),
      new IslandPlateauTerrainStrategy(),
      new RockyRidgesTerrainStrategy(),
      new MountainsTerrainStrategy()
    ]),
    modifiers: readonly TerrainHeightModifier[] = [
      new TerrainFalloffModifier(),
      new TerrainCenterFlattenModifier(),
      new TerrainTerraceModifier(),
      new TerrainSmoothModifier(),
      new TerrainHeightQuantizeModifier()
    ]
  ) {
    this.strategyRegistry = strategyRegistry;
    this.modifiers = modifiers;
  }

  public generate(descriptor: SceneGeneratedTerrainDescriptor): TerrainHeightField {
    const strategyId = this.strategyRegistry.resolveStrategyId(descriptor.generator);
    const normalizedDescriptor = {
      ...descriptor,
      generator: {
        ...descriptor.generator,
        strategy: strategyId
      }
    };
    const context = new TerrainGenerationContext(normalizedDescriptor, strategyId);
    let heightField = this.strategyRegistry.getStrategy(strategyId).generate(context);
    for (const modifier of this.modifiers) {
      heightField = modifier.apply(heightField, context);
    }
    return heightField;
  }
}
