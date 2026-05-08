import { NullEngine, Scene } from "@babylonjs/core";
import { TerrainHeightField } from "../../../src/core/world/terrain/TerrainHeightField";
import { TerrainMeshBuilder } from "../../../src/core/world/terrain/TerrainMeshBuilder";

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

function assertClose(actual: number, expected: number, message: string): void {
  const epsilon = 1e-6;
  assert(Math.abs(actual - expected) <= epsilon, `${message}: expected ${expected}, received ${actual}`);
}

function testVertexDataMatchesBabylonGroundOrientation(): void {
  const field = TerrainHeightField.createFilled(2, 2, 2, 2, 0);
  const builder = new TerrainMeshBuilder();
  const geometry = builder.buildVertexData(field);

  assert(JSON.stringify(geometry.indices) === JSON.stringify([3, 1, 0, 2, 3, 0]), "Expected Babylon-compatible ground winding.");
  assertClose(geometry.positions[2] ?? 0, 1, "First vertex should start at positive Z like CreateGround.");
  assertClose(geometry.positions[8] ?? 0, -1, "Third vertex should be on negative Z row.");
}

function testFlatTerrainNormalsPointUp(): void {
  const field = TerrainHeightField.createFilled(4, 4, 3, 3, 0);
  const builder = new TerrainMeshBuilder();
  const geometry = builder.buildVertexData(field);

  let sumY = 0;
  for (let index = 1; index < geometry.normals.length; index += 3) {
    sumY += geometry.normals[index] ?? 0;
  }
  const averageY = sumY / (geometry.normals.length / 3);
  assert(averageY > 0.99, `Expected upward normals for flat terrain, received average Y ${averageY}.`);
}

function testFlatTerrainMeshBoundsStayOnGroundPlane(): void {
  const engine = new NullEngine();
  const scene = new Scene(engine);
  const field = TerrainHeightField.createFilled(6, 8, 3, 3, 0);
  const builder = new TerrainMeshBuilder();
  const mesh = builder.build(
    scene,
    {
      id: "terrain-0",
      kind: "generated",
      size: [6, 8],
      resolution: [3, 3],
      position: [0, 0, 0],
      rotation: [0, 0, 0],
      scale: [1, 1, 1],
      generator: {
        preset: "flat-gray",
        strategy: "flat",
        seed: 1,
        height: {
          base: 0,
          amplitude: 0,
          frequency: 0.1,
          octaves: 1,
          persistence: 0.5,
          lacunarity: 2
        }
      },
      material: {
        kind: "flat",
        color: "#8D9298"
      }
    },
    field
  );

  const bounds = mesh.getBoundingInfo().boundingBox;
  assertClose(bounds.minimumWorld.y, 0, "Flat terrain minimum Y should stay on the ground plane.");
  assertClose(bounds.maximumWorld.y, 0, "Flat terrain maximum Y should stay on the ground plane.");
  scene.dispose();
  engine.dispose();
}

function run(): void {
  testVertexDataMatchesBabylonGroundOrientation();
  testFlatTerrainNormalsPointUp();
  testFlatTerrainMeshBoundsStayOnGroundPlane();
}

run();
console.log("TerrainMeshBuilder tests passed");
