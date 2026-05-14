import type { SceneGeneratedTerrainDescriptor } from "../scene/SceneDescriptor";
import { TerrainHeightFieldSerializer } from "./editing/TerrainHeightSerialization";
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

/**
 * Facade генерации terrain heightfield.
 *
 * Класс объединяет Strategy Registry, цепочку height modifiers и serializer
 * отредактированных карт высот. Внешний код получает один объектный entry point
 * вместо набора процедурных функций.
 */
export class TerrainGenerator {
  private readonly strategyRegistry: TerrainGenerationStrategyRegistry;
  private readonly modifiers: readonly TerrainHeightModifier[];
  private readonly heightFieldSerializer: TerrainHeightFieldSerializer;

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
    ],
    heightFieldSerializer = new TerrainHeightFieldSerializer()
  ) {
    this.strategyRegistry = strategyRegistry;
    this.modifiers = modifiers;
    this.heightFieldSerializer = heightFieldSerializer;
  }

  /**
   * Возвращает edited heightfield из descriptor или генерирует новый terrain.
   */
  public generate(descriptor: SceneGeneratedTerrainDescriptor): TerrainHeightField {
    const editedHeightField = this.heightFieldSerializer.deserialize(descriptor);
    if (editedHeightField) {
      return editedHeightField;
    }

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
