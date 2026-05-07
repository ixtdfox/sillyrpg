import type { EditorBuildingAsset } from "./EditorBuildingAsset";
import discoveredBuildingAssets from "virtual:editor-building-assets";

export function getDiscoveredBuildingAssets(): readonly EditorBuildingAsset[] {
  return discoveredBuildingAssets;
}
