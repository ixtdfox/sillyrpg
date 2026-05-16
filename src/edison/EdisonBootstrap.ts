import { BuiltinCorePlugin } from "./plugins/BuiltinCorePlugin";
import { EdisonPluginManager } from "./plugins/EdisonPluginManager";
import { EdisonPluginZipInstaller } from "./plugins/EdisonPluginZipInstaller";
import type { EdisonPluginContext } from "./plugins/EdisonPlugin";

export interface EdisonBootstrapOptions {
  readonly context: EdisonPluginContext;
  readonly pluginManager: EdisonPluginManager;
  readonly zipInstaller: EdisonPluginZipInstaller;
  readonly onBackToMenu: () => void;
  readonly reloadSceneContent: () => Promise<void>;
  readonly loadInitialSceneContent: () => Promise<void>;
}

export class EdisonBootstrap {
  public constructor(private readonly options: EdisonBootstrapOptions) {}

  public async start(): Promise<void> {
    await this.options.pluginManager.register(new BuiltinCorePlugin({
      zipInstaller: this.options.zipInstaller,
      onBackToMenu: this.options.onBackToMenu,
      reloadSceneContent: this.options.reloadSceneContent
    }));

    await this.options.loadInitialSceneContent();
  }
}
