/**
 * Normalizes configured asset paths into root-relative URLs.
 *
 * Supported forms:
 * - /assets/foo.glb
 * - assets/foo.glb
 * - nested/path/foo.glb
 * - foo.glb
 */
export function normalizeSceneAssetPath(assetPath: string): string {
  const trimmedPath = assetPath.trim();
  if (trimmedPath.startsWith("data:") || trimmedPath.startsWith("blob:")) {
    return trimmedPath;
  }

  if (trimmedPath.startsWith("/")) {
    return trimmedPath;
  }

  if (trimmedPath.startsWith("assets/")) {
    return `/${trimmedPath}`;
  }

  if (trimmedPath.includes("/")) {
    return `/${trimmedPath}`;
  }

  return `/assets/${trimmedPath}`;
}

/**
 * Alias kept for paths that are not scene-model specific anymore.
 */
export function normalizeAssetPath(assetPath: string): string {
  return normalizeSceneAssetPath(assetPath);
}

/**
 * Splits an asset path into Babylon loader root URL and file name segments.
 */
export function resolveSceneAssetPath(assetPath: string): { rootUrl: string; fileName: string } {
  const normalizedPath = normalizeSceneAssetPath(assetPath);
  const lastSlashIndex = normalizedPath.lastIndexOf("/");

  return {
    rootUrl: normalizedPath.slice(0, lastSlashIndex + 1),
    fileName: normalizedPath.slice(lastSlashIndex + 1)
  };
}

/**
 * Returns lowercase extension with leading dot from file path.
 */
export function getAssetFileExtension(assetPath: string): string {
  const normalizedPath = assetPath.trim();
  const dotIndex = normalizedPath.lastIndexOf(".");
  if (dotIndex === -1) {
    return "";
  }

  return normalizedPath.slice(dotIndex).toLowerCase();
}
