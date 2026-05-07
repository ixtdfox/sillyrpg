import { normalizeAssetPath } from "../../model/SceneAssetPath";
import { parseSceneDescriptor, type SceneDescriptor } from "./SceneDescriptor";

export interface LoadedSceneDescriptor {
  readonly path: string;
  readonly url: string;
  readonly descriptor: SceneDescriptor;
}

export async function loadSceneDescriptor(descriptorPath: string): Promise<LoadedSceneDescriptor> {
  const url = normalizeAssetPath(descriptorPath);
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to load scene descriptor '${descriptorPath}': ${response.status}`);
  }

  const payload = (await response.json()) as unknown;
  const descriptor = parseSceneDescriptor(payload, `Scene descriptor '${descriptorPath}'`);
  return { path: descriptorPath, url, descriptor };
}
