import {
  AssetContainer,
  MeshBuilder,
  NullEngine,
  PBRMaterial,
  RawTexture,
  Scene
} from "@babylonjs/core";
import { BuildingAssetMaterialPool } from "../../../src/core/world/scene/BuildingAssetMaterialPool";

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

function createAtlasMaterial(
  scene: Scene,
  name: string,
  category: string,
  texture: RawTexture,
  roughness = 0.5
): PBRMaterial {
  const material = new PBRMaterial(name, scene);
  material.albedoTexture = texture;
  material.metallic = 0;
  material.roughness = roughness;
  material.metadata = {
    gltf: {
      extras: {
        atlas_material: true,
        atlas_category: category,
        atlas_alpha: false,
        atlas_image_path: "/shared/house_atlas.png"
      }
    }
  };
  return material;
}

function createContainer(scene: Scene, suffix: string, roughness = 0.5): {
  container: AssetContainer;
  texture: RawTexture;
  wallMaterial: PBRMaterial;
} {
  const container = new AssetContainer(scene);
  const texture = RawTexture.CreateRGBATexture(new Uint8Array([255, 255, 255, 255]), 1, 1, scene);
  const wallMaterial = createAtlasMaterial(scene, `Atlas_walls_Opaque${suffix}`, "walls", texture, roughness);
  const floorMaterial = createAtlasMaterial(scene, `Atlas_floors_Opaque${suffix}`, "floors", texture, roughness);
  const wall = MeshBuilder.CreateBox(`wall${suffix}`, { size: 1 }, scene);
  const floor = MeshBuilder.CreateGround(`floor${suffix}`, { width: 1, height: 1 }, scene);
  wall.material = wallMaterial;
  floor.material = floorMaterial;
  container.meshes.push(wall, floor);
  container.materials.push(wallMaterial, floorMaterial);
  container.textures.push(texture);
  wallMaterial._parentContainer = container;
  floorMaterial._parentContainer = container;
  texture._parentContainer = container;
  return { container, texture, wallMaterial };
}

function testSharesOpaqueAtlasMaterialsAndDisposesOrphanTexture(): void {
  const engine = new NullEngine();
  const scene = new Scene(engine);
  const pool = new BuildingAssetMaterialPool();
  const first = createContainer(scene, "");
  const second = createContainer(scene, ".001");

  const firstResult = pool.canonicalize(first.container);
  const secondResult = pool.canonicalize(second.container);

  assert(firstResult.reusedMaterialCount === 1, "Expected opaque atlas categories in the first container to share one material.");
  assert(secondResult.reusedMaterialCount === 2, "Expected the second container to reuse the canonical opaque material.");
  assert(first.container.meshes.every((mesh) => mesh.material === first.wallMaterial), "Expected one opaque material in the first container.");
  assert(second.container.meshes.every((mesh) => mesh.material === first.wallMaterial), "Expected the second container to reuse the first material.");
  assert(secondResult.disposedTextureCount === 1, "Expected the orphaned texture from the second container to be disposed.");
  assert(!scene.textures.includes(second.texture), "Expected disposed duplicate texture to leave the scene.");
  assert(scene.textures.includes(first.texture), "Expected the canonical texture to remain alive.");
  scene.dispose();
  engine.dispose();
}

function testDifferentRenderStateDoesNotMerge(): void {
  const engine = new NullEngine();
  const scene = new Scene(engine);
  const pool = new BuildingAssetMaterialPool();
  const first = createContainer(scene, "", 0.5);
  const different = createContainer(scene, ".different", 0.8);

  pool.canonicalize(first.container);
  const result = pool.canonicalize(different.container);

  assert(result.reusedMaterialCount === 1, "Expected only equivalent materials inside the second container to merge.");
  assert(different.container.meshes[0]?.material !== first.wallMaterial, "Expected roughness difference to prevent cross-container sharing.");
  assert(scene.textures.includes(different.texture), "Expected texture used by a distinct material to remain alive.");
  scene.dispose();
  engine.dispose();
}

testSharesOpaqueAtlasMaterialsAndDisposesOrphanTexture();
testDifferentRenderStateDoesNotMerge();
console.log("BuildingAssetMaterialPool tests passed");
