import { NullEngine, Scene } from "@babylonjs/core";
import { TerrainHeightField } from "../../../src/core/world/terrain/TerrainHeightField";
import { TerrainMeshBuilder } from "../../../src/core/world/terrain/TerrainMeshBuilder";
import { TerrainNormalBuilder } from "../../../src/core/world/terrain/TerrainNormalBuilder";

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

function testNormalsArrayMatchesPositionsArray(): void {
  const field = createRaisedCenterHeightField();
  const builder = new TerrainMeshBuilder();
  const geometry = builder.buildVertexData(field);

  assert(geometry.normals.length === geometry.positions.length, "Expected one normal vector per position vector.");
}

function testNonFlatTerrainNormalsAreValidAndDirectional(): void {
  const field = createRaisedCenterHeightField();
  const builder = new TerrainMeshBuilder();
  const geometry = builder.buildVertexData(field);
  const diagnostics = new TerrainNormalBuilder().diagnose(geometry.normals);

  assert(diagnostics.invalidNormals === 0, "Expected generated terrain normals to be finite.");
  assert(diagnostics.zeroLengthNormals === 0, "Expected generated terrain normals to be non-zero.");
  assert(diagnostics.minY < 0.99, "Expected sloped terrain normals to differ from flat upward normals.");
}

function testNormalsRecomputeAfterEditedHeightFieldRebuild(): void {
  const flat = TerrainHeightField.createFilled(4, 4, 3, 3, 0);
  const edited = createRaisedCenterHeightField();
  const builder = new TerrainMeshBuilder();
  const flatGeometry = builder.buildVertexData(flat);
  const editedGeometry = builder.buildVertexData(edited);

  assert(
    JSON.stringify(flatGeometry.normals) !== JSON.stringify(editedGeometry.normals),
    "Expected terrain normals to change when edited heights are rebuilt."
  );
}

function testFlatNormalModeDuplicatesVerticesForFacetedNormals(): void {
  const field = createRaisedCenterHeightField();
  const builder = new TerrainMeshBuilder();
  const geometry = builder.buildVertexData(field, "flat");

  assert(geometry.positions.length === field.getTriangleCount() * 3 * 3, "Expected flat normal mode to duplicate vertices per face.");
  assert(geometry.normals.length === geometry.positions.length, "Expected flat normal mode normals to match duplicated positions.");
  assert(geometry.vertexHeights.length === field.getTriangleCount() * 3, "Expected flat normal mode height samples per duplicated vertex.");
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
  testNormalsArrayMatchesPositionsArray();
  testNonFlatTerrainNormalsAreValidAndDirectional();
  testNormalsRecomputeAfterEditedHeightFieldRebuild();
  testFlatNormalModeDuplicatesVerticesForFacetedNormals();
  testFlatTerrainMeshBoundsStayOnGroundPlane();
}

run();
console.log("TerrainMeshBuilder tests passed");

function createRaisedCenterHeightField(): TerrainHeightField {
  return new TerrainHeightField(
    4,
    4,
    3,
    3,
    new Float32Array([
      0, 0, 0,
      0, 2, 0,
      0, 0, 0
    ])
  );
}
