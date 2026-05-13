import { resolveTexturePaintStrokeAction } from "../../src/editor/terrain/tools/EditorTerrainTexturePaintRecovery";

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

function testFailedRawLoadAllowsStartingNewEditableMap(): void {
  const action = resolveTexturePaintStrokeAction({
    hasEditedTextureMap: true,
    rawLoadState: "failed",
    runtimeReady: false
  });

  assert(action === "startNewMap", "Expected failed raw paint loads to recover by starting a new editable texture map on stroke.");
}

function testLoadedRawMapKeepsPaintingOnRestoredRuntime(): void {
  const action = resolveTexturePaintStrokeAction({
    hasEditedTextureMap: true,
    rawLoadState: "loaded",
    runtimeReady: true
  });

  assert(action === "paintLoadedMap", "Expected loaded raw paint data to continue painting on the restored runtime map.");
}

function testIdleRawMapRequestsAsyncLoadFirst(): void {
  const action = resolveTexturePaintStrokeAction({
    hasEditedTextureMap: true,
    rawLoadState: "idle",
    runtimeReady: false
  });

  assert(action === "loadSavedMap", "Expected idle raw paint state to request async loading before painting.");
}

function run(): void {
  testFailedRawLoadAllowsStartingNewEditableMap();
  testLoadedRawMapKeepsPaintingOnRestoredRuntime();
  testIdleRawMapRequestsAsyncLoadFirst();
}

run();
console.log("EditorTerrainTexturePaintRecovery tests passed");
