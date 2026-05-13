import {
  applyCutawayHiddenMeshState,
  restoreCutawayHiddenMeshState,
} from "../../../src/core/entity/systems/BuildingVisibilitySystem";

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

function testCutawayHideKeepsMeshRenderableButNotPickable(): void {
  const mesh = {
    visibility: 1,
    isPickable: true,
  };

  applyCutawayHiddenMeshState(mesh);

  assert(mesh.visibility === 0, "Expected cutaway-hidden mesh visibility to be zero.");
  assert(mesh.isPickable === false, "Expected cutaway-hidden mesh to stop intercepting picks.");
}

function testCutawayRestoreRestoresOriginalStateIncludingPicking(): void {
  const calls: boolean[] = [];
  const mesh = {
    isVisible: true,
    visibility: 0,
    isPickable: false,
    setEnabled(enabled: boolean) {
      calls.push(enabled);
    },
  };

  restoreCutawayHiddenMeshState(mesh, {
    isEnabled: false,
    isVisible: false,
    visibility: 0.42,
    isPickable: true,
  });

  assert(calls.length === 1 && calls[0] === false, "Expected restore to reinstate the original enabled state.");
  assert(mesh.isVisible === false, "Expected restore to reinstate the original isVisible state.");
  assert(mesh.visibility === 0.42, "Expected restore to reinstate the original visibility scalar.");
  assert(mesh.isPickable === true, "Expected restore to reinstate the original pickability.");
}

function run(): void {
  testCutawayHideKeepsMeshRenderableButNotPickable();
  testCutawayRestoreRestoresOriginalStateIncludingPicking();
}

run();
console.log("BuildingVisibilitySystem tests passed");
