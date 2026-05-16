export interface EdisonPluginManifest {
  readonly id: string;
  readonly name: string;
  readonly version: string;
  readonly author?: string;
  readonly description?: string;
  readonly entry: string;
  readonly edisonApiVersion: "1";
}
