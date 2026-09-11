import { Vector3 } from "@babylonjs/core";
import { parseSceneDescriptor, type SceneDescriptor } from "../../src/core/world/scene/SceneDescriptor";
import { EdisonEventBus } from "../../src/edison/core/EdisonEventBus";
import { EdisonSceneDocumentService } from "../../src/edison/core/EdisonSceneDocumentService";

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

function testBatchTransformUpdate(): void {
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
    "EdisonSceneDocumentService batch transform test"
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
  testBatchTransformUpdate();
}

run();
console.log("EdisonSceneDocumentService tests passed");
