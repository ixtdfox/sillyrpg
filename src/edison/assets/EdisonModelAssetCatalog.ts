import { normalizeAssetPath } from "../../core/model/SceneAssetPath";
import discoveredModelAssets from "virtual:edison-model-assets";

export interface EdisonModelAssetOption {
  readonly id: string;
  readonly title: string;
  readonly label: string;
  readonly modelUrl: string;
  readonly rawModelPath: string;
  readonly relativePath: string;
  readonly directory: string;
  readonly category: string;
  readonly categoryLabel: string;
  readonly objectType: string;
  readonly filename: string;
  readonly extension: string;
  readonly tags: readonly string[];
  readonly connectedPresetId?: string;
  readonly gridSize?: number;
}

export interface EdisonModelCategoryOption {
  readonly id: string;
  readonly label: string;
  readonly count: number;
}

export class EdisonModelAssetCatalog {
  public getModelOptions(connectedObjects: readonly EdisonModelAssetOption[] = []): readonly EdisonModelAssetOption[] {
    const models = discoveredModelAssets.filter((asset) => asset.category !== "connected").map((asset) => {
      const category = asset.category || "unknown";
      return {
        id: asset.id,
        title: asset.title,
        label: asset.title,
        modelUrl: normalizeAssetPath(asset.model),
        rawModelPath: asset.model,
        relativePath: asset.relativePath,
        directory: asset.directory,
        category,
        categoryLabel: category === "unknown" ? "Unknown" : humanize(category),
        objectType: resolveObjectType(category),
        filename: asset.filename,
        extension: asset.extension,
        tags: [...asset.tags]
      };
    });

    return [...models, ...connectedObjects];
  }

  public getCategories(models = this.getModelOptions()): readonly EdisonModelCategoryOption[] {
    const counts = new Map<string, number>();
    for (const model of models) {
      counts.set(model.category, (counts.get(model.category) ?? 0) + 1);
    }

    return [
      { id: "buildings", label: "Buildings", count: counts.get("buildings") ?? 0 },
      { id: "terrain", label: "Terrain", count: counts.get("terrain") ?? 0 },
      { id: "connected", label: "Connected Objects", count: counts.get("connected") ?? 0 }
    ];
  }
}

function resolveObjectType(category: string): string {
  if (category === "buildings") {
    return "building";
  }

  if (category === "unknown") {
    return "model";
  }

  return category;
}

function humanize(value: string): string {
  return value
    .replace(/[_-]+/gu, " ")
    .replace(/\s+/gu, " ")
    .trim()
    .replace(/\b\w/gu, (character) => character.toUpperCase());
}
