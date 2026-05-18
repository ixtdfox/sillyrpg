import type { EdisonPluginManifest } from "./EdisonPluginManifest";

export interface EdisonPluginArchiveFilePayload {
  readonly path: string;
  readonly encoding: "base64";
  readonly data: string;
}

export interface EdisonPersistedPlugin {
  readonly manifest: EdisonPluginManifest;
  readonly entryUrl: string;
  readonly installedAt: string;
  readonly updatedAt: string;
}

export interface EdisonPersistedPluginInstallResult {
  readonly action: "installed" | "updated";
  readonly plugin: EdisonPersistedPlugin;
}

export class EdisonPluginPersistenceService {
  public async listInstalledPlugins(): Promise<readonly EdisonPersistedPlugin[]> {
    const response = await fetch("/__edison/plugins", {
      method: "GET",
      headers: { "Accept": "application/json" }
    });
    if (!response.ok) {
      throw new Error(await this.readError(response, "Installed Edison plugins could not be loaded."));
    }

    const payload = await response.json() as Partial<{ readonly plugins: readonly EdisonPersistedPlugin[] }>;
    if (!Array.isArray(payload.plugins)) {
      return [];
    }

    return payload.plugins.map((plugin) => this.normalizePersistedPlugin(plugin));
  }

  public async installPluginArchive(
    manifest: EdisonPluginManifest,
    files: readonly EdisonPluginArchiveFilePayload[]
  ): Promise<EdisonPersistedPluginInstallResult> {
    const response = await fetch("/__edison/plugins/install", {
      method: "POST",
      headers: {
        "Accept": "application/json",
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ manifest, files })
    });
    if (!response.ok) {
      throw new Error(await this.readError(response, "Edison plugin archive could not be installed."));
    }

    const payload = await response.json() as Partial<EdisonPersistedPluginInstallResult>;
    if ((payload.action !== "installed" && payload.action !== "updated") || !payload.plugin) {
      throw new Error("Edison plugin install response was malformed.");
    }

    return {
      action: payload.action,
      plugin: this.normalizePersistedPlugin(payload.plugin)
    };
  }

  private normalizePersistedPlugin(plugin: Partial<EdisonPersistedPlugin>): EdisonPersistedPlugin {
    if (!plugin.manifest || !plugin.entryUrl || !plugin.installedAt || !plugin.updatedAt) {
      throw new Error("Persisted Edison plugin record was malformed.");
    }

    return {
      manifest: plugin.manifest,
      entryUrl: plugin.entryUrl,
      installedAt: plugin.installedAt,
      updatedAt: plugin.updatedAt
    };
  }

  private async readError(response: Response, fallback: string): Promise<string> {
    const text = await response.text().catch(() => "");
    return text.trim() || fallback;
  }
}
