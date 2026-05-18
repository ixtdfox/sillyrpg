import type { SceneDescriptor } from "../../core/world/scene/SceneDescriptor";

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
    const response = await fetch("/__editor/scene", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        path: descriptorPath,
        descriptor,
        assets
      })
    });

    if (!response.ok) {
      const message = await response.text();
      throw new Error(message || `Save failed with status ${response.status}.`);
    }
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
}
