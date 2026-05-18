declare module "virtual:edison-model-assets" {
  export interface EdisonDiscoveredModelAsset {
    readonly id: string;
    readonly title: string;
    readonly model: string;
    readonly relativePath: string;
    readonly directory: string;
    readonly category: string;
    readonly filename: string;
    readonly extension: string;
    readonly tags: readonly string[];
  }

  const modelAssets: readonly EdisonDiscoveredModelAsset[];
  export default modelAssets;
}
