import type { SceneTerrainDescriptor } from "../../core/world/scene/SceneDescriptor";

export class TerrainCoreAdapter {
  public describeTerrain(terrain: SceneTerrainDescriptor | null | undefined): string {
    if (!terrain) {
      return "none";
    }

    if (terrain.kind === "plane") {
      return `plane ${terrain.size[0]} x ${terrain.size[1]}`;
    }

    if (terrain.kind === "generated") {
      return `generated ${terrain.generator.preset} ${terrain.resolution[0]} x ${terrain.resolution[1]}${terrain.editedHeightMap ? " edited" : ""}`;
    }

    return terrain.model;
  }
}
