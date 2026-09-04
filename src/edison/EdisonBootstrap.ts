import { BuiltinCorePlugin } from "./plugins/BuiltinCorePlugin";
import { ConnectedObjectsPlugin } from "./plugins/ConnectedObjectsPlugin";
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
      installPluginZip: async (file) => {
        const result = await this.options.zipInstaller.install(file);
        if (result.ok && result.plugin) {
          await this.options.pluginManager.register(result.plugin);
        }

        return result;
      },
      onBackToMenu: this.options.onBackToMenu,
      reloadSceneContent: this.options.reloadSceneContent
    }));
    await this.options.pluginManager.register(new ConnectedObjectsPlugin());

    const installedPlugins = await this.options.zipInstaller.loadInstalledPlugins();
    for (const result of installedPlugins) {
      if (result.ok && result.plugin) {
        await this.options.pluginManager.register(result.plugin);
      } else if (result.message) {
        this.options.context.events.emit("edison.message", { text: result.message });
      }
    }

    await this.options.loadInitialSceneContent();
  }
}
