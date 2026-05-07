declare module "virtual:editor-building-assets" {
  import type { EditorBuildingAsset } from "./EditorBuildingAsset";

  const discoveredBuildingAssets: readonly EditorBuildingAsset[];
  export default discoveredBuildingAssets;
}
