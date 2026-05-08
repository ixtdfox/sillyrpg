import { Vector3 } from "@babylonjs/core";
import { parseSceneDescriptor } from "../../src/core/world/scene/SceneDescriptor";
import { EditorSceneDocument } from "../../src/editor/state/EditorSceneDocument";

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

function testVerticalPositionPersistsThroughSaveAndReload(): void {
  const document = new EditorSceneDocument(
    "test-scene.json",
    parseSceneDescriptor(
      {
        schemaVersion: 2,
        id: "test-scene",
        terrain: null,
        objects: [
          {
            id: "building-1",
            type: "building",
            asset: "assets/models/buildings/silent_1.glb",
            position: [1, 0, 2],
            rotation: [0, 0, 0],
            scale: [1, 1, 1]
          }
        ]
      },
      "EditorSceneDocument vertical persistence test"
    )
  );

  document.updateObjectTransform("building-1", {
    position: new Vector3(1, 3, 2)
  });

  const reloaded = parseSceneDescriptor(JSON.parse(document.toJson()), "reloaded test scene");
  assert(reloaded.objects[0]?.position[1] === 3, "Expected saved/reloaded object Y position to remain snapped.");
}

function run(): void {
  testVerticalPositionPersistsThroughSaveAndReload();
}

run();
console.log("EditorSceneDocument tests passed");
