import { NullEngine, Scene, StandardMaterial, Vector3 } from "@babylonjs/core";
import { TerrainHeightField } from "../../../src/core/world/terrain/TerrainHeightField";
import { TerrainHeightFieldNormalSampler } from "../../../src/core/world/terrain/TerrainHeightFieldNormalSampler";
import { TerrainMeshBuilder } from "../../../src/core/world/terrain/TerrainMeshBuilder";
import { TerrainNormalBuilder } from "../../../src/core/world/terrain/TerrainNormalBuilder";
import { TerrainQuadtreeLodBuilder } from "../../../src/core/world/terrain/lod/TerrainQuadtreeLodBuilder";
import { TerrainQuadtreePatchMeshBuilder } from "../../../src/core/world/terrain/lod/TerrainQuadtreePatchMeshBuilder";
import {
  TerrainNativeLodDepthResolver,
  TerrainQuadtreeLodDescriptorResolver,
  TerrainSourceDensityWarningPolicy
} from "../../../src/core/world/terrain/lod/TerrainQuadtreeLodTypes";
import { TerrainGeneratorPresetCatalog } from "../../../src/editor/terrain/generation/TerrainGeneratorPresets";

const nativeLodDepthResolver = new TerrainNativeLodDepthResolver();
const quadtreeLodDescriptorResolver = new TerrainQuadtreeLodDescriptorResolver();

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

function assertClose(actual: number, expected: number, message: string): void {
  const epsilon = 1e-6;
  assert(Math.abs(actual - expected) <= epsilon, `${message}: expected ${expected}, received ${actual}`);
}

function assertCloseWithin(actual: number, expected: number, epsilon: number, message: string): void {
  assert(Math.abs(actual - expected) <= epsilon, `${message}: expected ${expected} +/- ${epsilon}, received ${actual}`);
}

function assertVectorClose(actual: Vector3, expected: Vector3, message: string): void {
  assertClose(actual.x, expected.x, `${message} X`);
  assertClose(actual.y, expected.y, `${message} Y`);
  assertClose(actual.z, expected.z, `${message} Z`);
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

function testHeightFieldNormalSamplerUsesWorldSpaceSlopes(): void {
  const field = new TerrainHeightField(
    2,
    2,
    3,
    3,
    new Float32Array([
      2, 3, 4,
      1, 2, 3,
      0, 1, 2
    ])
  );
  const normal = new TerrainHeightFieldNormalSampler(field).sampleNormal(1, 1);
  const expected = new Vector3(-1, 1, -1).normalize();

  assertVectorClose(normal, expected, "Canonical terrain normal should follow world X/Z height slopes.");
  assert(normal.y > 0, "Canonical terrain normal should face upward.");
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

function testBakedTextureTerrainUsesDiffuseTextureMaterial(): void {
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
        kind: "bakedTexture",
        texture: "assets/generated/terrain/test-scene/terrain-0_albedo.png",
        uvScale: [2, 3]
      }
    },
    field
  );

  const material = mesh.material as StandardMaterial | null;
  const diffuseTexture = material?.diffuseTexture as { uScale?: number; vScale?: number } | null | undefined;
  assert(material instanceof StandardMaterial, "Expected generated terrain to use a StandardMaterial.");
  assert(material?.diffuseTexture !== null, "Expected baked terrain material to create a diffuse texture.");
  assert(diffuseTexture?.uScale === 2, "Expected baked terrain diffuse texture to use the configured U scale.");
  assert(diffuseTexture?.vScale === 3, "Expected baked terrain diffuse texture to use the configured V scale.");
  assert(mesh.useVertexColors === false, "Expected baked terrain material to disable vertex colors.");

  scene.dispose();
  engine.dispose();
}

function run(): void {
  testVertexDataMatchesBabylonGroundOrientation();
  testFlatTerrainNormalsPointUp();
  testNormalsArrayMatchesPositionsArray();
  testNonFlatTerrainNormalsAreValidAndDirectional();
  testNormalsRecomputeAfterEditedHeightFieldRebuild();
  testHeightFieldNormalSamplerUsesWorldSpaceSlopes();
  testFlatNormalModeDuplicatesVerticesForFacetedNormals();
  testFlatTerrainMeshBoundsStayOnGroundPlane();
  testBakedTextureTerrainUsesDiffuseTextureMaterial();
  testQuadtreePatchUsesGlobalUvsAndSkirts();
  testQuadtreePatchUsesCanonicalNormalsAcrossLodLevelsAndSkirts();
  testQuadtreePatchSampleStepOneMatchesCanonicalWindingAndMetadata();
  testGeneratedTerrainDefaultResolutionFollowsGridStep();
  testNativeMaxDepthResolvesFromHeightfield();
  testQuadtreeSelectionKeepsNearFullResolutionInLargerPatches();
  testQuadtreeSelectionKeepsFarTerrainCoarse();
  testLegacyNearLeafWorldSizeMigratesToPatchWorldSizeDefault();
  testSourceDensityWarningPolicyUsesDesiredNearGridSize();
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

function testQuadtreePatchUsesGlobalUvsAndSkirts(): void {
  const field = TerrainHeightField.createFilled(8, 8, 9, 9, 0);
  const root = new TerrainQuadtreeLodBuilder().buildRoot(field, 0);
  const geometry = new TerrainQuadtreePatchMeshBuilder().buildVertexData(
    field,
    root,
    createFlatTerrainDescriptor(8, 8, 9, 9),
    1,
    2
  );
  const uvValues = geometry.uvs;
  const minU = Math.min(...uvValues.filter((_value, index) => index % 2 === 0));
  const maxU = Math.max(...uvValues.filter((_value, index) => index % 2 === 0));
  const minV = Math.min(...uvValues.filter((_value, index) => index % 2 === 1));
  const maxV = Math.max(...uvValues.filter((_value, index) => index % 2 === 1));
  const yValues = geometry.positions.filter((_value, index) => index % 3 === 1);

  assertClose(minU, 0, "Patch UVs should keep global minimum U.");
  assertClose(maxU, 1, "Patch UVs should keep global maximum U.");
  assertClose(minV, 0, "Patch UVs should keep global minimum V.");
  assertClose(maxV, 1, "Patch UVs should keep global maximum V.");
  assert(Math.min(...yValues) <= -2, "Patch skirts should extend below the terrain edge.");
}

function testQuadtreePatchUsesCanonicalNormalsAcrossLodLevelsAndSkirts(): void {
  const field = new TerrainHeightField(
    8,
    8,
    5,
    5,
    new Float32Array([
      2, 3, 4, 5, 6,
      1, 3, 5, 5, 4,
      0, 2, 6, 4, 2,
      1, 1, 3, 3, 1,
      2, 2, 2, 1, 0
    ])
  );
  const root = new TerrainQuadtreeLodBuilder().buildRoot(field, 1);
  const child = root.children[3]!;
  const descriptor = createFlatTerrainDescriptor(8, 8, 5, 5);
  const builder = new TerrainQuadtreePatchMeshBuilder();
  const sampler = new TerrainHeightFieldNormalSampler(field);
  const rootGeometryWithoutSkirts = builder.buildVertexData(field, root, descriptor, 2, 0);
  const rootGeometryWithSkirts = builder.buildVertexData(field, root, descriptor, 2, 1);
  const childGeometryWithSkirts = builder.buildVertexData(field, child, descriptor, 1, 1);
  const canonicalNormal = sampler.sampleNormal(2, 2);

  assertVectorClose(
    readNormal(rootGeometryWithoutSkirts.normals, 4),
    canonicalNormal,
    "Root LOD patch should use canonical normal for shared center vertex"
  );
  assertVectorClose(
    readNormal(rootGeometryWithSkirts.normals, 4),
    canonicalNormal,
    "Root LOD patch skirt triangles should not alter top vertex normals"
  );
  assertVectorClose(
    readNormal(childGeometryWithSkirts.normals, 0),
    canonicalNormal,
    "Child LOD patch should reuse the same canonical normal for the shared vertex"
  );

  const topVertexCount = 9;
  for (let vertexIndex = 0; vertexIndex < topVertexCount; vertexIndex += 1) {
    assertVectorClose(
      readNormal(rootGeometryWithSkirts.normals, vertexIndex),
      readNormal(rootGeometryWithoutSkirts.normals, vertexIndex),
      `Skirts should not change top vertex normal ${vertexIndex}`
    );
  }
}

function testQuadtreePatchSampleStepOneMatchesCanonicalWindingAndMetadata(): void {
  const engine = new NullEngine();
  const scene = new Scene(engine);
  const field = TerrainHeightField.createFilled(2, 2, 2, 2, 0);
  const root = new TerrainQuadtreeLodBuilder().buildRoot(field, 0);
  const descriptor = createFlatTerrainDescriptor(2, 2, 2, 2);
  const builder = new TerrainQuadtreePatchMeshBuilder();
  const geometry = builder.buildVertexData(field, root, descriptor, 1, 0);

  assert(JSON.stringify(geometry.indices) === JSON.stringify([3, 1, 0, 2, 3, 0]), "Patch winding should match canonical terrain winding.");
  assertClose(geometry.positions[0] ?? 0, -1, "Patch first vertex X should match canonical coordinates.");
  assertClose(geometry.positions[2] ?? 0, 1, "Patch first vertex Z should match canonical coordinates.");

  const mesh = builder.buildPatchMesh(scene, {
    node: root,
    heightField: field,
    descriptor,
    sampleStep: 1,
    skirtDepth: 0,
    material: null,
    name: "test-lod-patch"
  });

  assert(mesh.isPickable === false, "LOD patch mesh should not be pickable.");
  assert(mesh.checkCollisions === false, "LOD patch mesh should not participate in collisions.");
  assert(mesh.metadata?.terrainVisualOnly === true, "LOD patch mesh should be visual-only.");
  assert(mesh.metadata?.terrainSurfaceCanonical === false, "LOD patch mesh should be non-canonical.");
  scene.dispose();
  engine.dispose();
}

function readNormal(normals: readonly number[], vertexIndex: number): Vector3 {
  const offset = vertexIndex * 3;
  return new Vector3(normals[offset] ?? 0, normals[offset + 1] ?? 0, normals[offset + 2] ?? 0);
}

function testNativeMaxDepthResolvesFromHeightfield(): void {
  assert(nativeLodDepthResolver.resolve(TerrainHeightField.createFilled(400, 400, 65, 65, 0)) === 6, "65x65 should resolve native max depth 6.");
  assert(nativeLodDepthResolver.resolve(TerrainHeightField.createFilled(400, 400, 257, 257, 0)) === 8, "257x257 should resolve native max depth 8.");
  assert(nativeLodDepthResolver.resolve(TerrainHeightField.createFilled(40, 40, 41, 41, 0)) === 6, "41x41 should allow enough depth to reach native source quads.");
}

function testGeneratedTerrainDefaultResolutionFollowsGridStep(): void {
  const presetCatalog = new TerrainGeneratorPresetCatalog();
  const descriptor = presetCatalog.createDescriptor({
    presetId: "urban-pad",
    size: [128, 128]
  });
  const explicitResolutionDescriptor = presetCatalog.createDescriptor({
    presetId: "urban-pad",
    size: [128, 128],
    resolution: [65, 65]
  });
  const quadSizeX = descriptor.size[0] / (descriptor.resolution[0] - 1);
  const quadSizeZ = descriptor.size[1] / (descriptor.resolution[1] - 1);

  assert(descriptor.terrainGridStep === 1, "Generated terrain should record the default terrain grid step.");
  assert(descriptor.resolution[0] === 129, "128m terrain should default to 129 source vertices on X.");
  assert(descriptor.resolution[1] === 129, "128m terrain should default to 129 source vertices on Z.");
  assertClose(quadSizeX, 1, "Default generated terrain source quad size X should match grid step.");
  assertClose(quadSizeZ, 1, "Default generated terrain source quad size Z should match grid step.");
  assert(
    explicitResolutionDescriptor.resolution[0] === 65 && explicitResolutionDescriptor.resolution[1] === 65,
    "Explicit generated terrain resolution should be preserved."
  );
  assert(explicitResolutionDescriptor.resolutionMode === "manual", "Explicit generated terrain resolution should select manual mode.");
}

function testQuadtreeSelectionKeepsNearFullResolutionInLargerPatches(): void {
  const field = TerrainHeightField.createFilled(200, 200, 201, 201, 0);
  const builder = new TerrainQuadtreeLodBuilder();
  const descriptor = quadtreeLodDescriptorResolver.resolve(undefined, field);
  const root = builder.buildRoot(field, descriptor.maxDepth);
  const leaves = builder.selectVisibleLeaves(root, Vector3.Zero(), descriptor, field);
  const maxDepth = leaves.reduce((currentMax, leaf) => Math.max(currentMax, leaf.node.depth), 0);
  const nearLeaves = leaves.filter((leaf) => leaf.distanceToAnchor <= descriptor.nearFullResolutionRadius);
  const nearLeafSizes = nearLeaves.map((leaf) => Math.max(leaf.node.sizeWorldX, leaf.node.sizeWorldZ));
  const minNearLeafSize = Math.min(...nearLeafSizes);
  const maxNearLeafSize = Math.max(...nearLeafSizes);

  assert(leaves.length > 1, "Quadtree LOD should split visible leaves near the anchor.");
  assert(leaves.length < 500, `200m terrain LOD should not create thousands of patch meshes, received ${leaves.length}.`);
  assert(maxDepth > 0, "Quadtree LOD should produce more detailed leaves near the anchor.");
  assert(nearLeaves.length > 0, "Quadtree LOD should produce leaves inside the near full-resolution radius.");
  assert(nearLeaves.every((leaf) => leaf.sampleStep === 1), "Near quadtree leaves should use source full-resolution sampleStep=1.");
  assert(
    maxNearLeafSize <= descriptor.nearPatchWorldSize + 1e-6,
    `Near full-resolution patch meshes should be capped by nearPatchWorldSize, received ${maxNearLeafSize}.`
  );
  assert(
    minNearLeafSize >= 8,
    `Near full-resolution patches should contain multiple 1m source quads, received minimum size ${minNearLeafSize}.`
  );
  assert(
    nearLeaves.every((leaf) => Math.max(leaf.node.sizeWorldX, leaf.node.sizeWorldZ) > 2),
    "Near full-resolution leaves should not split into 1x1 world-unit patch meshes."
  );
}

function testQuadtreeSelectionKeepsFarTerrainCoarse(): void {
  const field = TerrainHeightField.createFilled(512, 512, 513, 513, 0);
  const builder = new TerrainQuadtreeLodBuilder();
  const descriptor = quadtreeLodDescriptorResolver.resolve(undefined, field);
  const root = builder.buildRoot(field, descriptor.maxDepth);
  const leaves = builder.selectVisibleLeaves(root, Vector3.Zero(), descriptor, field);
  const depths = new Set(leaves.map((leaf) => leaf.node.depth));
  const sampleSteps = new Set(leaves.map((leaf) => leaf.sampleStep));
  const nearLeaves = leaves.filter((leaf) => leaf.distanceToAnchor <= descriptor.nearFullResolutionRadius);
  const maxDepthLeaves = leaves.filter((leaf) => leaf.node.depth === descriptor.maxDepth);
  const coveredQuadCount = leaves.reduce((sum, leaf) => {
    const node = leaf.node;
    assert(node.ix0 >= 0 && node.iz0 >= 0, "Leaf node should not start outside the heightfield.");
    assert(node.ix1 <= field.resolutionX - 1, "Leaf node X range should not exceed the heightfield.");
    assert(node.iz1 <= field.resolutionZ - 1, "Leaf node Z range should not exceed the heightfield.");
    assert(node.ix1 > node.ix0 && node.iz1 > node.iz0, "Leaf node should have a valid non-empty quad range.");
    return sum + ((node.ix1 - node.ix0) * (node.iz1 - node.iz0));
  }, 0);

  assert(leaves.length < (field.resolutionX - 1) * (field.resolutionZ - 1), "Large terrain LOD should not force every source quad visible as a max-depth patch.");
  assert(
    coveredQuadCount === (field.resolutionX - 1) * (field.resolutionZ - 1),
    "Selected quadtree leaves should cover the terrain quads without gaps or duplicate quad ranges."
  );
  assert(nearLeaves.length > 0, "Large terrain LOD should keep full-resolution leaves near the anchor.");
  assert(nearLeaves.every((leaf) => leaf.sampleStep === 1), "Large terrain near leaves should use sampleStep=1.");
  assert(
    Array.from(sampleSteps).some((sampleStep) => sampleStep > 1),
    "Large terrain LOD should use coarser sample steps away from the anchor."
  );
  assert(
    Array.from(depths).some((depth) => depth < descriptor.maxDepth),
    "Large terrain LOD should keep coarser patches away from the anchor."
  );
  assert(maxDepthLeaves.length < leaves.length, "Large terrain LOD should not make every selected leaf a max-depth leaf.");
}

function testSourceDensityWarningPolicyUsesDesiredNearGridSize(): void {
  const policy = new TerrainSourceDensityWarningPolicy();
  const coarse = policy.diagnose(TerrainHeightField.createFilled(128, 128, 33, 33, 0), 1);
  const dense = policy.diagnose(TerrainHeightField.createFilled(128, 128, 129, 129, 0), 1);

  assertCloseWithin(coarse.sourceQuadSize, 4, 1e-6, "Coarse source quad size should be measured from the heightfield.");
  assert(coarse.shouldWarn, "4m source quads should warn when desired near grid size is 1m.");
  assertCloseWithin(dense.sourceQuadSize, 1, 1e-6, "Dense source quad size should be measured from the heightfield.");
  assert(!dense.shouldWarn, "1m source quads should not warn when desired near grid size is 1m.");
}

function testLegacyNearLeafWorldSizeMigratesToPatchWorldSizeDefault(): void {
  const field = TerrainHeightField.createFilled(128, 128, 129, 129, 0);
  const resolver = new TerrainQuadtreeLodDescriptorResolver();
  const warnings: string[] = [];
  const originalWarn = console.warn;
  console.warn = (message?: unknown): void => {
    warnings.push(String(message));
  };

  try {
    const descriptor = resolver.resolve({ nearLeafWorldSize: 1 }, field);
    assert(descriptor.nearPatchWorldSize === 16, "Legacy 1m nearLeafWorldSize should migrate to the default patch size.");
    assert(
      warnings.some((warning) => warning.includes("nearLeafWorldSize is deprecated")),
      "Legacy nearLeafWorldSize migration should warn."
    );
  } finally {
    console.warn = originalWarn;
  }
}

function createFlatTerrainDescriptor(
  width: number,
  depth: number,
  resolutionX: number,
  resolutionZ: number
) {
  return {
    id: "terrain-0",
    kind: "generated" as const,
    size: [width, depth] as const,
    resolution: [resolutionX, resolutionZ] as const,
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
      kind: "flat" as const,
      color: "#8D9298"
    }
  };
}
