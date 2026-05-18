const STORAGE_KEY = "edison.preferences.v1";

type EdisonPreferenceStore = Record<string, unknown>;

export class EdisonPreferencesService {
  public get<TValue>(key: string, fallback: TValue): TValue {
    const store = this.readStore();
    return key in store ? store[key] as TValue : fallback;
  }

  public set<TValue>(key: string, value: TValue): void {
    const store = this.readStore();
    store[key] = value;
    this.writeStore(store);
  }

  public remove(key: string): void {
    const store = this.readStore();
    delete store[key];
    this.writeStore(store);
  }

  public getPluginValue<TValue>(pluginId: string, key: string, fallback: TValue): TValue {
    return this.get(this.pluginKey(pluginId, key), fallback);
  }

  public setPluginValue<TValue>(pluginId: string, key: string, value: TValue): void {
    this.set(this.pluginKey(pluginId, key), value);
  }

  private pluginKey(pluginId: string, key: string): string {
    return `plugin.${pluginId}.${key}`;
  }

  private readStore(): EdisonPreferenceStore {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) {
        return {};
      }

      const parsed = JSON.parse(raw) as unknown;
      return parsed && typeof parsed === "object" && !Array.isArray(parsed)
        ? parsed as EdisonPreferenceStore
        : {};
    } catch {
      return {};
    }
  }

  private writeStore(store: EdisonPreferenceStore): void {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
    } catch {
      // Preferences are convenience state; failing to persist must not break the editor.
    }
  }
}
