import { normalizeAssetPath } from "../../model/SceneAssetPath";
import { parseSceneDescriptor, type SceneDescriptor } from "./SceneDescriptor";

export interface LoadedSceneDescriptor {
  readonly path: string;
  readonly url: string;
  readonly descriptor: SceneDescriptor;
}

export interface LoadSceneDescriptorOptions {
  readonly cacheBust?: string;
}

export async function loadSceneDescriptor(
  descriptorPath: string,
  options: LoadSceneDescriptorOptions = {}
): Promise<LoadedSceneDescriptor> {
  const url = normalizeAssetPath(descriptorPath);
  const requestUrl = options.cacheBust ? appendCacheBust(url, options.cacheBust) : url;
  const response = await fetch(requestUrl, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Failed to load scene descriptor '${descriptorPath}': ${response.status}`);
  }

  const payload = (await response.json()) as unknown;
  const descriptor = parseSceneDescriptor(payload, `Scene descriptor '${descriptorPath}'`);
  return { path: descriptorPath, url, descriptor };
}

function appendCacheBust(url: string, cacheBust: string): string {
  const separator = url.includes("?") ? "&" : "?";
  return `${url}${separator}edisonCacheBust=${encodeURIComponent(cacheBust)}`;
}
