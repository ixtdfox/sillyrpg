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

function testLightingPersistsThroughSaveAndReload(): void {
  const document = new EditorSceneDocument(
    "test-scene.json",
    parseSceneDescriptor(
      {
        schemaVersion: 2,
        id: "test-scene",
        terrain: null,
        objects: []
      },
      "EditorSceneDocument lighting persistence test"
    )
  );

  document.markSaved();
  document.updateLighting({
    preset: "day",
    clearColor: "#112244",
    ambient: {
      enabled: true,
      direction: [0, 1, 0],
      intensity: 0.73,
      diffuse: "#FFFFFF",
      specular: "#DDEEFF",
      groundColor: "#6E7565"
    },
    sun: {
      enabled: true,
      direction: [-0.5, -1, -0.25],
      position: [50, 80, 35],
      intensity: 1.1,
      diffuse: "#FFF4D6",
      specular: "#FFFFFF"
    },
    shadows: {
      enabled: true,
      mapSize: 2048,
      darkness: 0.42,
      useBlurExponentialShadowMap: true,
      blurKernel: 20
    }
  });

  const reloaded = parseSceneDescriptor(JSON.parse(document.toJson()), "reloaded lighting scene");
  assert(document.dirty === true, "Expected lighting update to mark document dirty.");
  assert(reloaded.lighting?.clearColor === "#112244", "Expected saved lighting clear color.");
  assert(reloaded.lighting?.ambient?.intensity === 0.73, "Expected saved ambient intensity.");
  assert(reloaded.lighting?.shadows?.mapSize === 2048, "Expected saved shadow map size.");
}

function run(): void {
  testVerticalPositionPersistsThroughSaveAndReload();
  testLightingPersistsThroughSaveAndReload();
}

run();
console.log("EditorSceneDocument tests passed");
