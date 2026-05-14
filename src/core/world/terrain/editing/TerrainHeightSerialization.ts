import type {
  SceneGeneratedTerrainDescriptor,
  SceneGeneratedTerrainEditedHeightMap
} from "../../scene/SceneDescriptor";
import { TerrainHeightField } from "../TerrainHeightField";

/**
 * Serializer edited terrain heights.
 *
 * Класс переводит SceneDescriptor DTO в runtime TerrainHeightField и обратно.
 * Вся строгая проверка resolution/length/non-finite значений находится здесь,
 * чтобы генератор высот не смешивался с persistence-форматом.
 */
export class TerrainHeightFieldSerializer {
  /**
   * Восстанавливает edited heightfield из descriptor или возвращает null.
   */
  public deserialize(descriptor: SceneGeneratedTerrainDescriptor): TerrainHeightField | null {
    const editedHeightMap = descriptor.editedHeightMap;
    if (!editedHeightMap) {
      return null;
    }

    const expectedLength = descriptor.resolution[0] * descriptor.resolution[1];
    if (editedHeightMap.resolution[0] !== descriptor.resolution[0] || editedHeightMap.resolution[1] !== descriptor.resolution[1]) {
      throw new Error(
        `editedHeightMap resolution ${editedHeightMap.resolution[0]} x ${editedHeightMap.resolution[1]} does not match terrain resolution ${descriptor.resolution[0]} x ${descriptor.resolution[1]}.`
      );
    }
    if (editedHeightMap.heights.length !== expectedLength) {
      throw new Error(`editedHeightMap expected ${expectedLength} heights, received ${editedHeightMap.heights.length}.`);
    }

    const heights = new Float32Array(expectedLength);
    for (let index = 0; index < expectedLength; index += 1) {
      const value = editedHeightMap.heights[index];
      if (!Number.isFinite(value)) {
        throw new Error(`editedHeightMap contains a non-finite height at index ${index}.`);
      }
      heights[index] = value;
    }

    return new TerrainHeightField(
      descriptor.size[0],
      descriptor.size[1],
      descriptor.resolution[0],
      descriptor.resolution[1],
      heights
    );
  }

  /**
   * Превращает runtime TerrainHeightField в JSON-совместимый DTO.
   */
  public serialize(field: TerrainHeightField): SceneGeneratedTerrainEditedHeightMap {
    return {
      encoding: "array",
      resolution: [field.resolutionX, field.resolutionZ],
      heights: Array.from(field.heights)
    };
  }
}
