import type { EdisonPluginContext } from "../core/EdisonContext";
import type { EdisonPlugin } from "./EdisonPlugin";
import type { EdisonPluginManifest } from "./EdisonPluginManifest";

export interface EdisonInstalledPlugin {
  readonly manifest: EdisonPluginManifest;
  readonly active: boolean;
}

interface PluginRecord {
  readonly plugin: EdisonPlugin;
  active: boolean;
}

export class EdisonPluginManager {
  private readonly plugins = new Map<string, PluginRecord>();
  private readonly listeners = new Set<() => void>();

  public constructor(private readonly context: EdisonPluginContext) {}

  public async register(plugin: EdisonPlugin): Promise<void> {
    if (this.plugins.has(plugin.manifest.id)) {
      throw new Error(`Edison plugin '${plugin.manifest.id}' is already installed.`);
    }

    this.plugins.set(plugin.manifest.id, { plugin, active: false });
    await this.activate(plugin.manifest.id);
    this.notifyChanged();
  }

  public async activate(pluginId: string): Promise<void> {
    const record = this.plugins.get(pluginId);
    if (!record || record.active) {
      return;
    }

    await record.plugin.activate(this.context);
    record.active = true;
    this.notifyChanged();
  }

  public async deactivate(pluginId: string): Promise<void> {
    const record = this.plugins.get(pluginId);
    if (!record || !record.active) {
      return;
    }

    await record.plugin.deactivate?.(this.context);
    record.active = false;
    this.notifyChanged();
  }

  public listInstalledPlugins(): readonly EdisonInstalledPlugin[] {
    return [...this.plugins.values()]
      .map((record) => ({
        manifest: record.plugin.manifest,
        active: record.active
      }))
      .sort((left, right) => left.manifest.name.localeCompare(right.manifest.name));
  }

  public onDidChange(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  public async dispose(): Promise<void> {
    for (const pluginId of [...this.plugins.keys()]) {
      await this.deactivate(pluginId);
    }
    this.plugins.clear();
    this.listeners.clear();
  }

  private notifyChanged(): void {
    for (const listener of [...this.listeners]) {
      listener();
    }
  }
}
