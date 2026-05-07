export interface EditorBuildingAsset {
  readonly id: string;
  readonly title: string;
  readonly model: string;
  readonly relativePath: string;
  readonly directory: string;
  readonly filename: string;
  readonly tags: readonly string[];
}
