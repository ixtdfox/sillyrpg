import { validateEditorSceneDescriptorPath, validateGeneratedTerrainAssetPath } from "../../src/editor/state/EditorSceneSavePaths";

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

function testValidateScenePathAcceptsSceneDescriptorPath(): void {
  const result = validateEditorSceneDescriptorPath("assets/data/scenes/test-zone/test-scene.scene.json");
  assert(result === "assets/data/scenes/test-zone/test-scene.scene.json", "Expected valid scene path to pass through.");
}

function testValidateGeneratedTerrainAssetPathRejectsTraversal(): void {
  let threw = false;
  try {
    validateGeneratedTerrainAssetPath("assets/generated/terrain/test-scene/../../oops.png");
  } catch (error) {
    threw = (error as Error).message.includes("traversal");
  }

  assert(threw, "Expected generated terrain asset path traversal to be rejected.");
}

function testValidateGeneratedTerrainAssetPathRejectsWrongExtension(): void {
  let threw = false;
  try {
    validateGeneratedTerrainAssetPath("assets/generated/terrain/test-scene/terrain-0_albedo.jpg");
  } catch (error) {
    threw = (error as Error).message.includes(".png");
  }

  assert(threw, "Expected generated terrain asset path to require .png.");
}

function run(): void {
  testValidateScenePathAcceptsSceneDescriptorPath();
  testValidateGeneratedTerrainAssetPathRejectsTraversal();
  testValidateGeneratedTerrainAssetPathRejectsWrongExtension();
}

run();
console.log("editorSceneFsPlugin tests passed");
