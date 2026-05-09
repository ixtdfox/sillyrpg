import { NullEngine, Scene } from "@babylonjs/core";
import { SceneLightingController } from "../../src/core/lighting/SceneLightingController";
import { SceneShadowRegistry } from "../../src/core/lighting/SceneShadowRegistry";
import { parseSceneDescriptor } from "../../src/core/world/scene/SceneDescriptor";
import { EditorLightingController } from "../../src/editor/lighting/EditorLightingController";
import { EditorSceneLoader } from "../../src/editor/EditorSceneLoader";
import { EditorSceneDocument } from "../../src/editor/state/EditorSceneDocument";

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

function assertClose(actual: number, expected: number, message: string): void {
  const epsilon = 1e-6;
  assert(Math.abs(actual - expected) <= epsilon, `${message}: expected ${expected}, received ${actual}`);
}

function createDocument(): EditorSceneDocument {
  return new EditorSceneDocument(
    "lighting-test.json",
    parseSceneDescriptor(
      {
        schemaVersion: 2,
        id: "lighting-test",
        lighting: {
          preset: "day",
          ambient: {
            intensity: 0.5
          },
          sun: {
            intensity: 1
          }
        },
        terrain: null,
        objects: []
      },
      "EditorLightingController test scene"
    )
  );
}

function testBindAppliesDocumentLighting(): void {
  const engine = new NullEngine();
  const scene = new Scene(engine);
  const sceneLightingController = new SceneLightingController(scene);
  const editorController = new EditorLightingController(new SceneShadowRegistry(sceneLightingController), {
    onChanged: () => void 0
  });
  const document = createDocument();
  const sceneLoader = new EditorSceneLoader(scene);

  editorController.bind(document, sceneLoader);

  assert(scene.getLightByName("global-ambient-light") !== null, "Expected bind to create ambient light.");
  assert(scene.getLightByName("global-sun-light") !== null, "Expected bind to create sun light.");
  assertClose(sceneLightingController.getRig()?.getAmbientLight()?.intensity ?? 0, 0.5, "Expected ambient intensity from document.");

  editorController.dispose();
  sceneLoader.dispose();
  scene.dispose();
  engine.dispose();
}

function testAmbientUpdateMarksDirtyAndAppliesLive(): void {
  const engine = new NullEngine();
  const scene = new Scene(engine);
  const sceneLightingController = new SceneLightingController(scene);
  let changedCount = 0;
  const editorController = new EditorLightingController(new SceneShadowRegistry(sceneLightingController), {
    onChanged: () => {
      changedCount += 1;
    }
  });
  const document = createDocument();
  const sceneLoader = new EditorSceneLoader(scene);
  document.markSaved();
  editorController.bind(document, sceneLoader);

  editorController.updateAmbient({ intensity: 0.91 });

  assert(document.dirty === true, "Expected lighting update to mark document dirty.");
  assert(document.descriptor.lighting?.ambient?.intensity === 0.91, "Expected document lighting to update.");
  assertClose(sceneLightingController.getRig()?.getAmbientLight()?.intensity ?? 0, 0.91, "Expected live ambient intensity.");
  assert(changedCount >= 2, "Expected bind and update to notify changes.");

  editorController.dispose();
  sceneLoader.dispose();
  scene.dispose();
  engine.dispose();
}

function testPresetAndShadowUpdatesApplyLive(): void {
  const engine = new NullEngine();
  const scene = new Scene(engine);
  const sceneLightingController = new SceneLightingController(scene);
  const editorController = new EditorLightingController(new SceneShadowRegistry(sceneLightingController), {
    onChanged: () => void 0
  });
  const document = createDocument();
  const sceneLoader = new EditorSceneLoader(scene);
  editorController.bind(document, sceneLoader);

  editorController.selectPreset("night");
  assert(document.descriptor.lighting?.preset === "night", "Expected preset update to replace lighting descriptor.");
  assert(document.descriptor.lighting?.clearColor === "#202C46", "Expected night preset clear color.");

  editorController.updateShadows({ enabled: true, mapSize: 2048 });
  assert(document.descriptor.lighting?.shadows?.enabled === true, "Expected shadows to be enabled in document.");
  assert(sceneLightingController.getRig()?.getShadowGenerator() !== null, "Expected live shadow generator.");

  editorController.dispose();
  sceneLoader.dispose();
  scene.dispose();
  engine.dispose();
}

function run(): void {
  testBindAppliesDocumentLighting();
  testAmbientUpdateMarksDirtyAndAppliesLive();
  testPresetAndShadowUpdatesApplyLive();
}

run();
console.log("EditorLightingController tests passed");
