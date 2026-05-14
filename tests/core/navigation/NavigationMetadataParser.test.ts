import { MeshBuilder, NullEngine, Scene, TransformNode } from "@babylonjs/core";
import { NavigationMetadataParser } from "../../../src/core/navigation/BuildingNavigationMetadata";

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

function createScene(): { engine: NullEngine; scene: Scene } {
  const engine = new NullEngine();
  const scene = new Scene(engine);
  return { engine, scene };
}

function testReadsStairCheckpointFromGltfExtras(): void {
  const { engine, scene } = createScene();
  const mesh = MeshBuilder.CreateBox("stair-checkpoint", { size: 1 }, scene);
  mesh.metadata = {
    gltf: {
      extras: {
        nav_kind: "stair_checkpoint",
        stair_id: "stair-a",
        checkpoint_index: "2",
        from_story: "0",
        to_story: "1",
        stair_kind: "external",
        cost: "3",
        bidirectional: "false"
      }
    }
  };

  const metadata = NavigationMetadataParser.getShared().parseStairCheckpointMetadata(mesh);

  assert(metadata?.stair_id === "stair-a", "Expected stair id from GLTF extras.");
  assert(metadata?.checkpoint_index === 2, "Expected numeric checkpoint index from string metadata.");
  assert(metadata?.stair_kind === "external", "Expected stair kind from metadata.");
  assert(metadata?.bidirectional === false, "Expected boolean normalization from string metadata.");
  scene.dispose();
  engine.dispose();
}

function testReadsGameNavigationMetadataFromParent(): void {
  const { engine, scene } = createScene();
  const parent = new TransformNode("wall-parent", scene);
  parent.metadata = {
    game_nav: true,
    game_nav_kind: "wall",
    game_nav_story_index: "1",
    game_nav_blocks_vision: true
  };
  const child = MeshBuilder.CreateBox("wall-child", { size: 1 }, scene);
  child.parent = parent;

  const metadata = NavigationMetadataParser.getShared().parseGameNavigationMetadata(child);

  assert(metadata?.kind === "wall", "Expected child mesh to inherit game nav kind from parent metadata.");
  assert(metadata?.storyIndex === 1, "Expected story index from parent metadata.");
  assert(metadata?.blocksMovement === true, "Expected wall to block movement by default.");
  assert(metadata?.blocksVision === true, "Expected explicit vision blocking metadata.");
  scene.dispose();
  engine.dispose();
}

function testPickableSurfacePolicyAcceptsFloorAndRejectsWall(): void {
  const { engine, scene } = createScene();
  const floor = MeshBuilder.CreateGround("story-floor", { width: 2, height: 2 }, scene);
  const wall = MeshBuilder.CreateBox("outer-wall", { size: 1 }, scene);
  const parser = NavigationMetadataParser.getShared();

  assert(parser.isNavigationPickableSurface(floor), "Expected floor-like mesh to be navigation pickable.");
  assert(!parser.isNavigationPickableSurface(wall), "Expected wall-like mesh not to be navigation pickable.");
  scene.dispose();
  engine.dispose();
}

function run(): void {
  testReadsStairCheckpointFromGltfExtras();
  testReadsGameNavigationMetadataFromParent();
  testPickableSurfacePolicyAcceptsFloorAndRejectsWall();
}

run();
console.log("NavigationMetadataParser tests passed");
