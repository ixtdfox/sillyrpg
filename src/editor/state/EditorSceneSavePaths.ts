export function validateEditorSceneDescriptorPath(scenePath: string): string {
  if (scenePath.startsWith("/") || scenePath.startsWith("\\")) {
    throw new Error("Absolute scene paths are not allowed.");
  }

  const normalized = scenePath.replace(/\\/g, "/");
  if (!normalized.startsWith("assets/data/scenes/")) {
    throw new Error("Scene path must stay under assets/data/scenes.");
  }
  if (normalized.includes("..")) {
    throw new Error("Scene path traversal is not allowed.");
  }

  return normalized;
}

export function validateGeneratedTerrainAssetPath(assetPath: string): string {
  if (assetPath.startsWith("/") || assetPath.startsWith("\\")) {
    throw new Error("Absolute generated asset paths are not allowed.");
  }

  const normalized = assetPath.replace(/\\/g, "/");
  if (!normalized.startsWith("assets/generated/terrain/")) {
    throw new Error("Generated asset path must stay under assets/generated/terrain.");
  }
  if (normalized.includes("..")) {
    throw new Error("Generated asset path traversal is not allowed.");
  }
  if (!normalized.endsWith(".png")) {
    throw new Error("Generated terrain assets must be .png files.");
  }

  return normalized;
}
