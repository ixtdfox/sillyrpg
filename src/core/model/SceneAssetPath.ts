/**
 * Normalizes configured model paths into root-relative asset URLs.
 *
 * Supported forms:
 * - /assets/foo.glb
 * - assets/foo.glb
 * - nested/path/foo.glb
 * - foo.glb
 */
export function normalizeSceneAssetPath(modelPath: string): string {
  if (modelPath.startsWith("/")) {
    return modelPath;
  }

  if (modelPath.startsWith("assets/")) {
    return `/${modelPath}`;
  }

  if (modelPath.includes("/")) {
    return `/${modelPath}`;
  }

  return `/assets/${modelPath}`;
}

/**
 * Splits a model path into Babylon loader root URL and file name segments.
 */
export function resolveSceneAssetPath(modelPath: string): { rootUrl: string; fileName: string } {
  const normalizedPath = normalizeSceneAssetPath(modelPath.trim());
  const lastSlashIndex = normalizedPath.lastIndexOf("/");

  return {
    rootUrl: normalizedPath.slice(0, lastSlashIndex + 1),
    fileName: normalizedPath.slice(lastSlashIndex + 1)
  };
}
