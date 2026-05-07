import { normalizeAssetPath } from "../../core/model/SceneAssetPath";
import type { EditorBuildingAssetOption } from "../types";
import { getDiscoveredBuildingAssets } from "./buildingAssetDiscovery";

export class EditorBuildingAssetRegistry {
  public getBuildingOptions(): readonly EditorBuildingAssetOption[] {
    return getDiscoveredBuildingAssets().map((asset) => ({
      id: asset.id,
      title: asset.title,
      label: asset.title,
      modelUrl: normalizeAssetPath(asset.model),
      rawModelPath: asset.model,
      relativePath: asset.relativePath,
      directory: asset.directory,
      filename: asset.filename,
      tags: [...asset.tags]
    }));
  }
}
