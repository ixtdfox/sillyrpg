export interface EdisonPluginZipInstallResult {
  readonly ok: boolean;
  readonly message: string;
}

export class EdisonPluginZipInstaller {
  public async install(file: File): Promise<EdisonPluginZipInstallResult> {
    if (!file.name.toLowerCase().endsWith(".zip")) {
      return {
        ok: false,
        message: "Edison plugins must be provided as .zip archives."
      };
    }

    return {
      ok: false,
      message: "ZIP plugin installation is planned; archive parsing is not implemented yet."
    };
  }
}
