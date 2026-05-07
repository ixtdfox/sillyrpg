import type { SceneDescriptor } from "../../core/world/scene/SceneDescriptor";

export async function saveSceneDescriptor(descriptorPath: string, descriptor: SceneDescriptor): Promise<void> {
  const response = await fetch("/__editor/scene", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      path: descriptorPath,
      descriptor
    })
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
