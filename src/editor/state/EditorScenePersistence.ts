import type { SceneDescriptor } from "../../core/world/scene/SceneDescriptor";

export interface EditorSceneSaveAsset {
  readonly path: string;
  readonly encoding: "base64" | "dataUrl";
  readonly mimeType: "image/png";
  readonly data: string;
}

export interface SaveSceneDescriptorRequestBody {
  readonly path: string;
  readonly descriptor: SceneDescriptor;
  readonly assets?: readonly EditorSceneSaveAsset[];
}

export function buildSaveSceneDescriptorRequestBody(
  descriptorPath: string,
  descriptor: SceneDescriptor,
  assets: readonly EditorSceneSaveAsset[] = []
): SaveSceneDescriptorRequestBody {
  return {
    path: descriptorPath,
    descriptor,
    assets
  };
}

export async function saveSceneDescriptor(
  descriptorPath: string,
  descriptor: SceneDescriptor,
  assets: readonly EditorSceneSaveAsset[] = []
): Promise<void> {
  const response = await fetch("/__editor/scene", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(buildSaveSceneDescriptorRequestBody(descriptorPath, descriptor, assets))
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || `Save failed with status ${response.status}.`);
  }
}

export function exportSceneDescriptorJson(fileName: string, json: string): void {
  const blob = new Blob([json], { type: "application/json" });
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = objectUrl;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(objectUrl);
}
