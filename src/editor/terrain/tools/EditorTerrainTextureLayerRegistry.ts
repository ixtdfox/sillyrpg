import type { TerrainTextureLayerDescriptor } from "../../../core/world/terrain/editing/TerrainTextureLayer";

const terrainTextureModules = import.meta.glob<string>("../../../../assets/textures/terrain/*.png", {
  eager: true,
  query: "?url",
  import: "default"
});

export class EditorTerrainTextureLayerRegistry {
  public getLayers(): readonly TerrainTextureLayerDescriptor[] {
    return Object.entries(terrainTextureModules)
      .map(([path, url]) => {
        const filename = path.split("/").pop() ?? path;
        const label = filename.replace(/\.png$/i, "");
        return {
          id: label,
          label: toReadableLabel(label),
          url
        };
      })
      .sort((a, b) => a.label.localeCompare(b.label));
  }
}

function toReadableLabel(filenameWithoutExtension: string): string {
  return filenameWithoutExtension
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}
