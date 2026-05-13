export type TexturePaintRawLoadState = "idle" | "loading" | "loaded" | "failed";

export type TexturePaintStrokeAction = "block" | "paintLoadedMap" | "loadSavedMap" | "startNewMap";

export function resolveTexturePaintStrokeAction(input: {
  readonly hasEditedTextureMap: boolean;
  readonly rawLoadState: TexturePaintRawLoadState;
  readonly runtimeReady: boolean;
}): TexturePaintStrokeAction {
  if (!input.hasEditedTextureMap) {
    return "startNewMap";
  }

  if (input.rawLoadState === "loading") {
    return "block";
  }

  if (input.rawLoadState === "loaded") {
    return input.runtimeReady ? "paintLoadedMap" : "block";
  }

  if (input.rawLoadState === "failed") {
    return "startNewMap";
  }

  return "loadSavedMap";
}
