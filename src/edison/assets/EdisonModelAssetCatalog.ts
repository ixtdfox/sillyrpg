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
}

export interface EdisonModelCategoryOption {
  readonly id: string;
  readonly label: string;
  readonly count: number;
}

export class EdisonModelAssetCatalog {
  public getModelOptions(): readonly EdisonModelAssetOption[] {
    return discoveredModelAssets.map((asset) => {
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
  }

  public getCategories(models = this.getModelOptions()): readonly EdisonModelCategoryOption[] {
    const counts = new Map<string, { label: string; count: number }>();
    for (const model of models) {
      const current = counts.get(model.category) ?? { label: model.categoryLabel, count: 0 };
      counts.set(model.category, { label: current.label, count: current.count + 1 });
    }

    return [...counts.entries()]
      .map(([id, value]) => ({
        id,
        label: value.label,
        count: value.count
      }))
      .sort((left, right) => {
        if (left.id === "unknown") {
          return 1;
        }
        if (right.id === "unknown") {
          return -1;
        }
        return left.label.localeCompare(right.label);
      });
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
