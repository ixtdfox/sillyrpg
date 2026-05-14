import { MeshBuilder, NullEngine, Scene, TransformNode, type AbstractMesh } from "@babylonjs/core";
import { EditorSceneLoader } from "../../../src/editor/EditorSceneLoader";
import { TerrainGeneratorPresetCatalog } from "../../../src/core/world/terrain/TerrainGeneratorPresets";
const terrainPresetCatalog = new TerrainGeneratorPresetCatalog();

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

async function testTerrainReplacementRemovesOldRefsAndPreservesObjects(): Promise<void> {
  const engine = new NullEngine();
  const scene = new Scene(engine);
  const loader = new EditorSceneLoader(scene);
  const root = new TransformNode("scene-root", scene);
  const oldTerrainRoot = new TransformNode("old-terrain-root", scene);
  oldTerrainRoot.parent = root;
  const oldTerrainMesh = MeshBuilder.CreateGround("old-terrain", { width: 40, height: 40 }, scene);
  oldTerrainMesh.parent = oldTerrainRoot;
  oldTerrainMesh.metadata = { editorTerrain: true, editorSelectable: false };

  const objectMesh = MeshBuilder.CreateBox("object-mesh", { size: 1 }, scene);
  objectMesh.parent = root;
  objectMesh.metadata = { sceneObjectId: "object-1", editorSelectable: true };

  const privateLoader = loader as unknown as {
    currentContent: {
      option: { id: string; label: string; rawDescriptorPath: string };
      descriptor: { schemaVersion: 2; id: string; objects: readonly []; terrain: null };
      root: TransformNode;
      meshes: AbstractMesh[];
      renderableMeshes: AbstractMesh[];
      helperMeshes: AbstractMesh[];
      transformNodes: TransformNode[];
      skeletons: [];
      animationGroups: [];
      particleSystems: [];
      sceneObjects: readonly [];
      terrain: unknown;
      summary: { descriptorUrl?: string; rawDescriptorPath: string; terrainLabel: string; objectCount: number };
    };
    terrainInstance: {
      root: TransformNode;
      meshes: AbstractMesh[];
      renderableMeshes: AbstractMesh[];
      helperMeshes: [];
      transformNodes: [];
      skeletons: [];
      animationGroups: [];
      particleSystems: [];
      descriptor: { id: string; kind: "plane"; size: readonly [number, number] };
    };
  };

  privateLoader.currentContent = {
    option: { id: "test", label: "Test", rawDescriptorPath: "test.json" },
    descriptor: { schemaVersion: 2, id: "test-scene", objects: [], terrain: null },
    root,
    meshes: [objectMesh, oldTerrainMesh],
    renderableMeshes: [objectMesh, oldTerrainMesh],
    helperMeshes: [],
    transformNodes: [oldTerrainRoot],
    skeletons: [],
    animationGroups: [],
    particleSystems: [],
    sceneObjects: [],
    terrain: null,
    summary: { rawDescriptorPath: "test.json", terrainLabel: "plane 40x40", objectCount: 0 }
  };
  privateLoader.terrainInstance = {
    root: oldTerrainRoot,
    meshes: [oldTerrainMesh],
    renderableMeshes: [oldTerrainMesh],
    helperMeshes: [],
    transformNodes: [],
    skeletons: [],
    animationGroups: [],
    particleSystems: [],
    descriptor: { id: "terrain-0", kind: "plane", size: [40, 40] }
  };

  const descriptor = terrainPresetCatalog.createDescriptor({ presetId: "soft-hills", seed: 88 });
  const nextTerrain = await loader.setTerrain(descriptor);
  const content = loader.getCurrentContent();

  assert(content !== null, "Expected current content after terrain replacement.");
  assert(content!.renderableMeshes.includes(objectMesh), "Expected existing object mesh to survive terrain replacement.");
  assert(!content!.renderableMeshes.includes(oldTerrainMesh), "Expected old terrain mesh to be removed from renderable meshes.");
  assert(content!.renderableMeshes.includes(nextTerrain.renderableMeshes[0]!), "Expected new terrain mesh in renderable meshes.");
  assert(content!.summary.terrainLabel.includes("generated soft-hills"), "Expected generated terrain summary label.");

  scene.dispose();
  engine.dispose();
}

Promise.resolve(testTerrainReplacementRemovesOldRefsAndPreservesObjects()).then(() => {
  console.log("EditorSceneLoader terrain replacement tests passed");
});
