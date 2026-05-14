import { NullEngine, Scene, TransformNode, Vector3 } from "@babylonjs/core";
import { LangManager } from "../../../src/core/lang/LangManager";
import { LocationManager } from "../../../src/core/world/location/LocationManager";

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

class FakeTerrainLodController {
  public debugEnabled = false;
  public disposeCount = 0;
  public updateCount = 0;

  public setDebugEnabled(enabled: boolean): void {
    this.debugEnabled = enabled;
  }

  public update(): void {
    this.updateCount += 1;
  }

  public dispose(): void {
    this.disposeCount += 1;
  }
}

function testTerrainLodDebugAndUpdatePropagation(): void {
  const engine = new NullEngine();
  const scene = new Scene(engine);
  const manager = new LocationManager(new LangManager());
  const controller = new FakeTerrainLodController();
  installLoadedContent(manager, scene, controller);

  assert(manager.hasTerrainLodControllers(), "Expected manager to report active terrain LOD controllers.");
  assert(manager.toggleTerrainLodDebug() === true, "Expected debug toggle to return enabled state.");
  assert(controller.debugEnabled === true, "Expected debug toggle to propagate to active terrain LOD controller.");

  manager.updateTerrainLodControllers(0.16, {
    position: Vector3.Zero(),
    source: "player"
  });

  assert(controller.updateCount === 1, "Expected LOD update to propagate to active terrain LOD controller.");

  scene.dispose();
  engine.dispose();
}

function testTerrainLodControllersDisposeWhenChunkUnloads(): void {
  const engine = new NullEngine();
  const scene = new Scene(engine);
  const manager = new LocationManager(new LangManager());
  const controller = new FakeTerrainLodController();
  installLoadedContent(manager, scene, controller);

  manager.unloadDistrictSceneChunk([0, 0]);

  assert(controller.disposeCount === 1, "Expected chunk unload to dispose terrain LOD controllers.");

  scene.dispose();
  engine.dispose();
}

function installLoadedContent(
  manager: LocationManager,
  scene: Scene,
  controller: FakeTerrainLodController
): void {
  const root = new TransformNode("test-root", scene);
  const internal = manager as unknown as {
    activeDistrictScenes: Map<string, unknown>;
  };
  internal.activeDistrictScenes.set("0:0", {
    sceneId: "test-scene",
    coord: [0, 0],
    root,
    meshes: [],
    renderableMeshes: [],
    terrainMeshes: [],
    terrainLodControllers: [controller],
    sceneObjectMeshes: [],
    transformNodes: [],
    skeletons: [],
    animationGroups: [],
    particleSystems: [],
    lightingDescriptor: {},
    objectCount: 0
  });
}

function run(): void {
  testTerrainLodDebugAndUpdatePropagation();
  testTerrainLodControllersDisposeWhenChunkUnloads();
}

run();
console.log("LocationManager terrain LOD tests passed");
