import type { SceneDescriptor } from "../../core/world/scene/SceneDescriptor";
import { loadSceneDescriptor } from "../../core/world/scene/SceneDescriptorLoader";

export interface EdisonSaveAsset {
  readonly path: string;
  readonly encoding: "base64" | "dataUrl";
  readonly mimeType: "image/png";
  readonly data: string;
}

export class EdisonPersistenceService {
  public async save(
    descriptorPath: string,
    descriptor: SceneDescriptor,
    assets: readonly EdisonSaveAsset[] = []
  ): Promise<void> {
    await this.saveDescriptor(descriptorPath, descriptor);
    await this.saveAssets(assets);
  }

  public async saveDescriptor(descriptorPath: string, descriptor: SceneDescriptor): Promise<void> {
    const response = await fetch("/__editor/scene", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        path: descriptorPath,
        descriptor,
        assets: []
      })
    });

    await this.throwIfFailed(response, `Scene descriptor save failed with status ${response.status}.`);
  }

  public async saveAssets(assets: readonly EdisonSaveAsset[] = []): Promise<void> {
    for (const asset of assets) {
      const response = await fetch("/__editor/scene/assets", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          assets: [asset]
        })
      });

      await this.throwIfFailed(response, `Generated asset save failed for ${asset.path} with status ${response.status}.`);
    }
  }

  public async loadSavedDescriptor(descriptorPath: string): Promise<SceneDescriptor> {
    return (await loadSceneDescriptor(descriptorPath, { cacheBust: String(Date.now()) })).descriptor;
  }

  public exportJson(fileName: string, json: string): void {
    const blob = new Blob([json], { type: "application/json" });
    const objectUrl = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = objectUrl;
    link.download = fileName;
    link.click();
    URL.revokeObjectURL(objectUrl);
  }

  private async throwIfFailed(response: Response, fallbackMessage: string): Promise<void> {
    if (response.ok) {
      return;
    }

    const message = await response.text();
    throw new Error(message || fallbackMessage);
  }
}
