import type { EdisonPluginContext } from "../core/EdisonContext";
import type { EdisonPluginManifest } from "./EdisonPluginManifest";

export type { EdisonPluginContext };

export interface EdisonPlugin {
  readonly manifest: EdisonPluginManifest;
  activate(context: EdisonPluginContext): void | Promise<void>;
  deactivate?(context: EdisonPluginContext): void | Promise<void>;
}
