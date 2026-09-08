import { Vector3 } from "@babylonjs/core";
import { parseSceneDescriptor, type SceneDescriptor } from "../../src/core/world/scene/SceneDescriptor";
import { EditorSceneDocument } from "../../src/editor/state/EditorSceneDocument";
import { EdisonEventBus } from "../../src/edison/core/EdisonEventBus";
import { EdisonSceneDocumentService } from "../../src/edison/core/EdisonSceneDocumentService";

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

function testEdisonSceneDocumentBatchTransformUpdate(): void {
  const descriptor = parseSceneDescriptor(
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
        },
        {
          id: "interior-1",
          type: "interior",
          asset: "assets/models/interior/Chair/Chair_1.glb",
          position: [2, 0, 3],
          rotation: [0, 0, 0],
          scale: [1, 1, 1],
          interiorBuildingId: "building-1",
          interiorStoryIndex: 0
        }
      ]
    },
    "EdisonSceneDocument batch transform test"
  );
  const service = new EdisonSceneDocumentService({} as never, {} as never, {} as never, new EdisonEventBus());
  (service as unknown as { descriptor: SceneDescriptor }).descriptor = descriptor;

  const updatedObjects = service.updateObjectTransforms([
    { objectId: "building-1", position: new Vector3(4, 0, 5) },
    { objectId: "interior-1", position: new Vector3(5, 0, 6) }
  ]);

  assert(updatedObjects.length === 2, "Expected both transform updates to be returned.");
  assert(service.getObject("building-1")?.position.join(",") === "4,0,5", "Expected building position to update.");
  assert(service.getObject("interior-1")?.position.join(",") === "5,0,6", "Expected interior position to update.");
  assert(service.getSnapshot().dirty === true, "Expected batch transform update to mark document dirty.");
}

function run(): void {
  testVerticalPositionPersistsThroughSaveAndReload();
  testLightingPersistsThroughSaveAndReload();
  testEdisonSceneDocumentBatchTransformUpdate();
}

run();
console.log("EditorSceneDocument tests passed");
