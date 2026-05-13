import { parseSceneDescriptor } from "../../src/core/world/scene/SceneDescriptor";
import { buildSaveSceneDescriptorRequestBody } from "../../src/editor/state/EditorScenePersistence";

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

function testBuildSaveSceneDescriptorRequestBodyIncludesAssets(): void {
  const descriptor = parseSceneDescriptor(
    {
      schemaVersion: 2,
      id: "save-test-scene",
      objects: []
    },
    "save request test"
  );

  const body = buildSaveSceneDescriptorRequestBody(descriptor.id, descriptor, [
    {
      path: "assets/generated/terrain/save-test-scene/terrain-0_albedo.png",
      encoding: "dataUrl",
      mimeType: "image/png",
      data: "data:image/png;base64,AAAA"
    }
  ]);

  assert(body.path === "save-test-scene", "Expected request body path to match the save target.");
  assert(body.assets?.length === 1, "Expected request body assets to be included.");
  assert(body.assets?.[0]?.mimeType === "image/png", "Expected request body assets to preserve mime type.");
}

function testBuildSaveSceneDescriptorRequestBodyIncludesMultipleTerrainAssets(): void {
  const descriptor = parseSceneDescriptor(
    {
      schemaVersion: 2,
      id: "save-test-scene-multi",
      objects: []
    },
    "multi-asset save request test"
  );

  const body = buildSaveSceneDescriptorRequestBody(descriptor.id, descriptor, [
    {
      path: "assets/generated/terrain/save-test-scene-multi/terrain-0_albedo.png",
      encoding: "dataUrl",
      mimeType: "image/png",
      data: "data:image/png;base64,AAAA"
    },
    {
      path: "assets/generated/terrain/save-test-scene-multi/terrain-0_splat_0.png",
      encoding: "dataUrl",
      mimeType: "image/png",
      data: "data:image/png;base64,BBBB"
    }
  ]);

  assert(body.assets?.length === 2, "Expected request body to preserve multiple generated terrain assets.");
  assert(body.assets?.[1]?.path.includes("splat_0"), "Expected secondary generated terrain assets to be included.");
}

function run(): void {
  testBuildSaveSceneDescriptorRequestBodyIncludesAssets();
  testBuildSaveSceneDescriptorRequestBodyIncludesMultipleTerrainAssets();
}

run();
console.log("EditorScenePersistence tests passed");
