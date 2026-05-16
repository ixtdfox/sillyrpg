import { FreeCamera, NullEngine, Scene, StandardMaterial, TransformNode, Vector3 } from "@babylonjs/core";
import { TerrainHeightField } from "../../../src/core/world/terrain/TerrainHeightField";
import { TerrainHeightFieldNormalSampler } from "../../../src/core/world/terrain/TerrainHeightFieldNormalSampler";
import { TerrainMeshBuilder } from "../../../src/core/world/terrain/TerrainMeshBuilder";
import { TerrainNormalBuilder } from "../../../src/core/world/terrain/TerrainNormalBuilder";
import { TerrainQuadtreeLodBuilder, TerrainQuadtreeSampleStepPolicy } from "../../../src/core/world/terrain/lod/TerrainQuadtreeLodBuilder";
import { TerrainQuadtreeLodController } from "../../../src/core/world/terrain/lod/TerrainQuadtreeLodController";
import { TerrainFrustumCullingPolicy } from "../../../src/core/world/terrain/lod/TerrainFrustumCullingPolicy";
import { TerrainQuadtreeLodSeamResolver } from "../../../src/core/world/terrain/lod/TerrainQuadtreeLodSeamResolver";
import { TerrainQuadtreePatchMeshBuilder } from "../../../src/core/world/terrain/lod/TerrainQuadtreePatchMeshBuilder";
import {
  TerrainNativeLodDepthResolver,
  TerrainQuadtreeLodDescriptorResolver,
  TerrainSourceDensityWarningPolicy
} from "../../../src/core/world/terrain/lod/TerrainQuadtreeLodTypes";
import type { TerrainQuadtreeLeafSelection, TerrainQuadtreeNode } from "../../../src/core/world/terrain/lod/TerrainQuadtreeLodTypes";
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
  testQuadtreePatchUsesGlobalUvsWithoutSkirts();
  testQuadtreePatchUsesCanonicalNormalsAcrossLodLevels();
  testQuadtreePatchSampleStepOneMatchesCanonicalWindingAndMetadata();
  testQuadtreeSeamResolverDetectsMixedLodNeighbors();
  testQuadtreePatchMeshKeepsLogicalGridAndBuildDiagnostics();
  testQuadtreePatchSeamRefinementMatchesSharedEdgeVertices();
  testQuadtreePatchEdgeFansBridgeMixedLodWithoutSkirts();
  testQuadtreePatchMorphsCoarseInteriorHeightTowardFinerEdge();
  testGeneratedTerrainDefaultResolutionFollowsGridStep();
  testNativeMaxDepthResolvesFromHeightfield();
  testQuadtreeLodHasNoSkirtDepth();
  testQuadtreeSampleStepPolicyTreatsRingStepAsMinimumDecimation();
  testQuadtreeSampleStepPolicyKeepsNaturalBudgetFloor();
  testQuadtreeSelectionKeepsNearFullResolutionInLargerPatches();
  testQuadtreeSelectionKeepsFarTerrainCoarse();
  testQuadtreeStitchedSelectionHasMatchingSharedEdges();
  testQuadtreeDefaultRingsSelectHighFarSampleSteps();
  testQuadtreeFarSampleStepsReduceApproximateTriangleCount();
  testTerrainFrustumPolicyRejectsOutsideNodes();
  testTerrainFrustumPolicyKeepsNearAnchorNodes();
  testQuadtreeLodControllerKeepsNearAnchorTerrainWithFrustumCulling();
  testQuadtreeLodControllerDisposesInactivePatchMeshes();
  testQuadtreeLodControllerReusesPatchesAndReportsLifecycle();
  testQuadtreeLodControllerEvictsInactiveCacheByCountTrianglesAndTtl();
  testQuadtreeLodControllerExpandsNearRadiusForDistantPlayerCamera();
  testQuadtreeLodControllerAppliesRuntimeDistanceTuning();
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

function createSlopedHeightField(
  width: number,
  depth: number,
  resolutionX: number,
  resolutionZ: number
): TerrainHeightField {
  const heights = new Float32Array(resolutionX * resolutionZ);
  for (let iz = 0; iz < resolutionZ; iz += 1) {
    for (let ix = 0; ix < resolutionX; ix += 1) {
      heights[(iz * resolutionX) + ix] = (ix * 3) + (iz * 7);
    }
  }
  return new TerrainHeightField(width, depth, resolutionX, resolutionZ, heights);
}

function createTestLeaf(node: TerrainQuadtreeNode, sampleStep: number): TerrainQuadtreeLeafSelection {
  return {
    node,
    sampleStep,
    desiredSampleStep: sampleStep,
    desiredMaxSampleStep: sampleStep,
    distanceToAnchor: 0
  };
}

function createTestNode(id: string, ix0: number, iz0: number, ix1: number, iz1: number): TerrainQuadtreeNode {
  return {
    id,
    depth: 0,
    ix0,
    iz0,
    ix1,
    iz1,
    centerLocalX: (ix0 + ix1) * 0.5,
    centerLocalZ: (iz0 + iz1) * 0.5,
    sizeWorldX: ix1 - ix0,
    sizeWorldZ: iz1 - iz0,
    children: []
  };
}

function heightFieldIndexToLocalX(heightField: TerrainHeightField, ix: number): number {
  const u = heightField.resolutionX <= 1 ? 0 : ix / (heightField.resolutionX - 1);
  return (u - 0.5) * heightField.width;
}

function heightFieldIndexToLocalZ(heightField: TerrainHeightField, iz: number): number {
  const v = heightField.resolutionZ <= 1 ? 0 : iz / (heightField.resolutionZ - 1);
  return (0.5 - v) * heightField.depth;
}

function collectVerticesAtX(
  positions: readonly number[],
  expectedX: number,
  minZ = Number.NEGATIVE_INFINITY,
  maxZ = Number.POSITIVE_INFINITY
): Map<string, string> {
  const vertices = new Map<string, string>();
  for (let offset = 0; offset < positions.length; offset += 3) {
    const x = positions[offset] ?? 0;
    if (Math.abs(x - expectedX) > 1e-6) {
      continue;
    }

    const y = positions[offset + 1] ?? 0;
    const z = positions[offset + 2] ?? 0;
    if (z < minZ - 1e-6 || z > maxZ + 1e-6) {
      continue;
    }
    vertices.set(z.toFixed(6), `${x.toFixed(6)},${y.toFixed(6)},${z.toFixed(6)}`);
  }
  return new Map([...vertices.entries()].sort(([left], [right]) => Number(left) - Number(right)));
}

function collectVerticesAtZ(
  positions: readonly number[],
  expectedZ: number,
  minX = Number.NEGATIVE_INFINITY,
  maxX = Number.POSITIVE_INFINITY
): Map<string, string> {
  const vertices = new Map<string, string>();
  for (let offset = 0; offset < positions.length; offset += 3) {
    const z = positions[offset + 2] ?? 0;
    if (Math.abs(z - expectedZ) > 1e-6) {
      continue;
    }

    const x = positions[offset] ?? 0;
    const y = positions[offset + 1] ?? 0;
    if (x < minX - 1e-6 || x > maxX + 1e-6) {
      continue;
    }
    vertices.set(x.toFixed(6), `${x.toFixed(6)},${y.toFixed(6)},${z.toFixed(6)}`);
  }
  return new Map([...vertices.entries()].sort(([left], [right]) => Number(left) - Number(right)));
}

function mergeVertexMaps(...maps: readonly Map<string, string>[]): Map<string, string> {
  const merged = new Map<string, string>();
  for (const map of maps) {
    for (const [key, value] of map) {
      merged.set(key, value);
    }
  }
  return new Map([...merged.entries()].sort(([left], [right]) => Number(left) - Number(right)));
}

function testQuadtreePatchUsesGlobalUvsWithoutSkirts(): void {
  const field = TerrainHeightField.createFilled(8, 8, 9, 9, 0);
  const root = new TerrainQuadtreeLodBuilder().buildRoot(field, 0);
  const geometry = new TerrainQuadtreePatchMeshBuilder().buildVertexData(
    field,
    root,
    createFlatTerrainDescriptor(8, 8, 9, 9),
    1
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
  assert(Math.min(...yValues) === 0 && Math.max(...yValues) === 0, "Patch vertices should stay on the terrain surface without skirt geometry.");
}

function testQuadtreePatchUsesCanonicalNormalsAcrossLodLevels(): void {
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
  const rootGeometry = builder.buildVertexData(field, root, descriptor, 2);
  const childGeometry = builder.buildVertexData(field, child, descriptor, 1);
  const canonicalNormal = sampler.sampleNormal(2, 2);

  assertVectorClose(
    readNormal(rootGeometry.normals, 4),
    canonicalNormal,
    "Root LOD patch should use canonical normal for shared center vertex"
  );
  assertVectorClose(
    readNormal(childGeometry.normals, 0),
    canonicalNormal,
    "Child LOD patch should reuse the same canonical normal for the shared vertex"
  );
}

function testQuadtreePatchSampleStepOneMatchesCanonicalWindingAndMetadata(): void {
  const engine = new NullEngine();
  const scene = new Scene(engine);
  const field = TerrainHeightField.createFilled(2, 2, 2, 2, 0);
  const root = new TerrainQuadtreeLodBuilder().buildRoot(field, 0);
  const descriptor = createFlatTerrainDescriptor(2, 2, 2, 2);
  const builder = new TerrainQuadtreePatchMeshBuilder();
  const geometry = builder.buildVertexData(field, root, descriptor, 1);

  assert(JSON.stringify(geometry.indices) === JSON.stringify([3, 1, 0, 2, 3, 0]), "Patch winding should match canonical terrain winding.");
  assertClose(geometry.positions[0] ?? 0, -1, "Patch first vertex X should match canonical coordinates.");
  assertClose(geometry.positions[2] ?? 0, 1, "Patch first vertex Z should match canonical coordinates.");

  const mesh = builder.buildPatchMesh(scene, {
    node: root,
    heightField: field,
    descriptor,
    sampleStep: 1,
    material: null,
    name: "test-lod-patch"
  });

  assert(mesh.isPickable === false, "LOD patch mesh should not be pickable.");
  assert(mesh.checkCollisions === false, "LOD patch mesh should not participate in collisions.");
  assert(mesh.metadata?.terrainVisualOnly === true, "LOD patch mesh should be visual-only.");
  assert(mesh.metadata?.terrainSurfaceCanonical === false, "LOD patch mesh should be non-canonical.");
  assert(mesh.metadata?.terrainQuadtreeSeamStrategy === "edge-fans", "LOD patch mesh should expose edge-fan seam stitching metadata.");
  scene.dispose();
  engine.dispose();
}

function testQuadtreePatchMeshKeepsLogicalGridAndBuildDiagnostics(): void {
  const engine = new NullEngine();
  const scene = new Scene(engine);
  const field = TerrainHeightField.createFilled(8, 8, 9, 9, 0);
  const root = new TerrainQuadtreeLodBuilder().buildRoot(field, 0);
  const descriptor = createFlatTerrainDescriptor(8, 8, 9, 9);
  const mesh = new TerrainQuadtreePatchMeshBuilder().buildPatchMesh(scene, {
    node: root,
    heightField: field,
    descriptor,
    sampleStep: 1,
    logicalSampleStep: 4,
    buildSampleStep: 1,
    material: null,
    name: "test-lod-patch-build-step"
  });

  assert(mesh.getTotalVertices() === 9, `Patch mesh should keep the logical grid when no seam info is present, received ${mesh.getTotalVertices()} vertices.`);
  assert(mesh.metadata?.terrainQuadtreeSampleStep === 4, "Patch metadata should preserve the logical sample step.");
  assert(mesh.metadata?.terrainQuadtreeBuildSampleStep === 1, "Patch metadata should expose the actual build sample step.");
  scene.dispose();
  engine.dispose();
}

function testQuadtreeSeamResolverDetectsMixedLodNeighbors(): void {
  const field = TerrainHeightField.createFilled(16, 16, 17, 17, 0);
  const root = new TerrainQuadtreeLodBuilder().buildRoot(field, 1);
  const coarseNode = root.children[0]!;
  const fineNode = root.children[1]!;
  const resolver = new TerrainQuadtreeLodSeamResolver();
  const [coarseLeaf, fineLeaf] = resolver.applySeamCompatibility([
    createTestLeaf(coarseNode, 4),
    createTestLeaf(fineNode, 1)
  ]);

  assert(coarseLeaf !== undefined && fineLeaf !== undefined, "Test setup should create seam-compatible leaves.");
  assert(coarseLeaf.seamInfo?.east?.mode === "stitch-to-finer", "Coarse leaf should detect a finer east neighbor.");
  assert(coarseLeaf.seamInfo.east.neighborSampleStep === 1, "Coarse seam should record the finer neighbor sample step.");
  assert(coarseLeaf.buildSampleStep === 1, "Coarse leaf diagnostic build sample step should be reduced for seam compatibility.");
  assert(fineLeaf.seamInfo?.west?.mode === "stitch-to-coarser", "Fine leaf should detect a coarser west neighbor.");
  assert(fineLeaf.buildSampleStep === 1, "Fine leaf should keep its own build sample step.");

  const [longCoarseLeaf] = resolver.applySeamCompatibility([
    createTestLeaf(createTestNode("coarse-west", 0, 0, 8, 16), 4),
    createTestLeaf(createTestNode("fine-east-north", 8, 0, 16, 8), 1),
    createTestLeaf(createTestNode("same-east-south", 8, 8, 16, 16), 4)
  ]);
  const eastSegments = longCoarseLeaf?.seamInfo?.east?.segments ?? [];

  assert(eastSegments.length === 2, "Coarse edge should retain separate seam segments for multiple edge neighbors.");
  assert(eastSegments[0]?.startIndex === 0 && eastSegments[0]?.endIndex === 8, "First east seam segment should cover the north half.");
  assert(eastSegments[0]?.mode === "stitch-to-finer", "North half should stitch to the finer neighbor.");
  assert(eastSegments[1]?.startIndex === 8 && eastSegments[1]?.endIndex === 16, "Second east seam segment should cover the south half.");
  assert(eastSegments[1]?.mode === "none", "South half should remain at the matching neighbor sample step.");
}

function testQuadtreePatchSeamRefinementMatchesSharedEdgeVertices(): void {
  const field = createSlopedHeightField(16, 16, 17, 17);
  const root = new TerrainQuadtreeLodBuilder().buildRoot(field, 1);
  const coarseNode = root.children[0]!;
  const fineNode = root.children[1]!;
  const descriptor = createFlatTerrainDescriptor(16, 16, 17, 17);
  const resolver = new TerrainQuadtreeLodSeamResolver();
  const [coarseLeaf, fineLeaf] = resolver.applySeamCompatibility([
    createTestLeaf(coarseNode, 4),
    createTestLeaf(fineNode, 1)
  ]);
  const builder = new TerrainQuadtreePatchMeshBuilder();
  const coarseGeometry = builder.buildVertexData(field, coarseNode, descriptor, 4, coarseLeaf?.seamInfo);
  const fineGeometry = builder.buildVertexData(field, fineNode, descriptor, 1, fineLeaf?.seamInfo);
  const sharedX = heightFieldIndexToLocalX(field, coarseNode.ix1);
  const coarseEdge = collectVerticesAtX(coarseGeometry.positions, sharedX);
  const fineEdge = collectVerticesAtX(fineGeometry.positions, sharedX);

  assert(coarseEdge.size === 9, `Coarse stitched edge should include every fine edge vertex, received ${coarseEdge.size}.`);
  assert(fineEdge.size === 9, `Fine edge should include every source vertex on the shared border, received ${fineEdge.size}.`);
  assert(
    JSON.stringify(Array.from(coarseEdge.entries())) === JSON.stringify(Array.from(fineEdge.entries())),
    "Stitched coarse and fine patch edges should expose matching vertex coordinates on the shared border."
  );

  const chainField = createSlopedHeightField(24, 8, 25, 9);
  const chainDescriptor = createFlatTerrainDescriptor(24, 8, 25, 9);
  const fineWestNode = createTestNode("fine-west", 0, 0, 8, 8);
  const middleNode = createTestNode("middle", 8, 0, 16, 8);
  const coarseEastNode = createTestNode("coarse-east", 16, 0, 24, 8);
  const [fineWestLeaf, middleLeaf, coarseEastLeaf] = resolver.applySeamCompatibility([
    createTestLeaf(fineWestNode, 1),
    createTestLeaf(middleNode, 4),
    createTestLeaf(coarseEastNode, 8)
  ]);
  const fineWestGeometry = builder.buildVertexData(chainField, fineWestNode, chainDescriptor, 1, fineWestLeaf?.seamInfo);
  const middleGeometry = builder.buildVertexData(chainField, middleNode, chainDescriptor, 4, middleLeaf?.seamInfo);
  const coarseEastGeometry = builder.buildVertexData(chainField, coarseEastNode, chainDescriptor, 8, coarseEastLeaf?.seamInfo);
  const westSharedX = heightFieldIndexToLocalX(chainField, 8);
  const eastSharedX = heightFieldIndexToLocalX(chainField, 16);
  const fineWestEastEdge = collectVerticesAtX(fineWestGeometry.positions, westSharedX);
  const middleWestEdge = collectVerticesAtX(middleGeometry.positions, westSharedX);
  const middleEastEdge = collectVerticesAtX(middleGeometry.positions, eastSharedX);
  const coarseEastWestEdge = collectVerticesAtX(coarseEastGeometry.positions, eastSharedX);

  assert(
    JSON.stringify(Array.from(fineWestEastEdge.entries())) === JSON.stringify(Array.from(middleWestEdge.entries())),
    "Middle patch west edge should be stitched to the finer west neighbor."
  );
  assert(
    JSON.stringify(Array.from(middleEastEdge.entries())) === JSON.stringify(Array.from(coarseEastWestEdge.entries())),
    "Middle patch east edge should remain compatible with the coarser east neighbor instead of leaking west-edge refinement across the whole patch."
  );

  const mixedSegmentField = createSlopedHeightField(32, 16, 33, 17);
  const mixedSegmentDescriptor = createFlatTerrainDescriptor(32, 16, 33, 17);
  const mixedCoarseNode = createTestNode("mixed-coarse", 0, 0, 16, 16);
  const mixedFineNeighbor = createTestNode("mixed-fine-neighbor", 16, 0, 32, 8);
  const mixedMediumNeighbor = createTestNode("mixed-medium-neighbor", 16, 8, 32, 16);
  const [mixedCoarseLeaf, mixedFineLeaf, mixedMediumLeaf] = resolver.applySeamCompatibility([
    createTestLeaf(mixedCoarseNode, 16),
    createTestLeaf(mixedFineNeighbor, 4),
    createTestLeaf(mixedMediumNeighbor, 8)
  ]);
  const mixedCoarseGeometry = builder.buildVertexData(
    mixedSegmentField,
    mixedCoarseNode,
    mixedSegmentDescriptor,
    16,
    mixedCoarseLeaf?.seamInfo
  );
  const mixedFineGeometry = builder.buildVertexData(
    mixedSegmentField,
    mixedFineNeighbor,
    mixedSegmentDescriptor,
    4,
    mixedFineLeaf?.seamInfo
  );
  const mixedMediumGeometry = builder.buildVertexData(
    mixedSegmentField,
    mixedMediumNeighbor,
    mixedSegmentDescriptor,
    8,
    mixedMediumLeaf?.seamInfo
  );
  const mixedSharedX = heightFieldIndexToLocalX(mixedSegmentField, 16);
  const mixedCoarseEdge = collectVerticesAtX(mixedCoarseGeometry.positions, mixedSharedX);
  const mixedNeighborEdge = mergeVertexMaps(
    collectVerticesAtX(mixedFineGeometry.positions, mixedSharedX),
    collectVerticesAtX(mixedMediumGeometry.positions, mixedSharedX)
  );

  assert(
    JSON.stringify(Array.from(mixedCoarseEdge.entries())) === JSON.stringify(Array.from(mixedNeighborEdge.entries())),
    "A coarse edge touching multiple finer segments should inject exactly the union of neighbor edge vertices, with no extra T-junction points."
  );

  const offsetField = createSlopedHeightField(20, 16, 21, 17);
  const offsetDescriptor = createFlatTerrainDescriptor(20, 16, 21, 17);
  const offsetLeftNode = createTestNode("offset-left", 0, 0, 10, 16);
  const offsetRightNode = createTestNode("offset-right", 10, 2, 20, 16);
  const [offsetLeftLeaf, offsetRightLeaf] = resolver.applySeamCompatibility([
    createTestLeaf(offsetLeftNode, 4),
    createTestLeaf(offsetRightNode, 4)
  ]);
  const offsetLeftGeometry = builder.buildVertexData(offsetField, offsetLeftNode, offsetDescriptor, 4, offsetLeftLeaf?.seamInfo);
  const offsetRightGeometry = builder.buildVertexData(offsetField, offsetRightNode, offsetDescriptor, 4, offsetRightLeaf?.seamInfo);
  const offsetSharedX = heightFieldIndexToLocalX(offsetField, 10);
  const offsetMinZ = heightFieldIndexToLocalZ(offsetField, 16);
  const offsetMaxZ = heightFieldIndexToLocalZ(offsetField, 2);
  const offsetLeftEdge = collectVerticesAtX(offsetLeftGeometry.positions, offsetSharedX, offsetMinZ, offsetMaxZ);
  const offsetRightEdge = collectVerticesAtX(offsetRightGeometry.positions, offsetSharedX, offsetMinZ, offsetMaxZ);

  assert(
    JSON.stringify(Array.from(offsetLeftEdge.entries())) === JSON.stringify(Array.from(offsetRightEdge.entries())),
    "Equal-step neighboring edges with different axis offsets should still use an identical stitched vertex set."
  );

  const offsetNorthNode = createTestNode("offset-north", 0, 0, 16, 10);
  const offsetSouthNode = createTestNode("offset-south", 2, 10, 16, 20);
  const [offsetNorthLeaf, offsetSouthLeaf] = resolver.applySeamCompatibility([
    createTestLeaf(offsetNorthNode, 4),
    createTestLeaf(offsetSouthNode, 4)
  ]);
  const offsetNorthGeometry = builder.buildVertexData(offsetField, offsetNorthNode, offsetDescriptor, 4, offsetNorthLeaf?.seamInfo);
  const offsetSouthGeometry = builder.buildVertexData(offsetField, offsetSouthNode, offsetDescriptor, 4, offsetSouthLeaf?.seamInfo);
  const offsetSharedZ = heightFieldIndexToLocalZ(offsetField, 10);
  const offsetMinX = heightFieldIndexToLocalX(offsetField, 2);
  const offsetMaxX = heightFieldIndexToLocalX(offsetField, 16);
  const offsetNorthEdge = collectVerticesAtZ(offsetNorthGeometry.positions, offsetSharedZ, offsetMinX, offsetMaxX);
  const offsetSouthEdge = collectVerticesAtZ(offsetSouthGeometry.positions, offsetSharedZ, offsetMinX, offsetMaxX);

  assert(
    JSON.stringify(Array.from(offsetNorthEdge.entries())) === JSON.stringify(Array.from(offsetSouthEdge.entries())),
    "North/south equal-step neighboring edges with different axis offsets should use an identical stitched vertex set."
  );
}

function testQuadtreePatchEdgeFansBridgeMixedLodWithoutSkirts(): void {
  const field = TerrainHeightField.createFilled(16, 16, 17, 17, 0);
  const root = new TerrainQuadtreeLodBuilder().buildRoot(field, 1);
  const coarseNode = root.children[0]!;
  const fineNode = root.children[1]!;
  const descriptor = createFlatTerrainDescriptor(16, 16, 17, 17);
  const resolver = new TerrainQuadtreeLodSeamResolver();
  const [coarseLeaf, fineLeaf] = resolver.applySeamCompatibility([
    createTestLeaf(coarseNode, 4),
    createTestLeaf(fineNode, 1)
  ]);
  const builder = new TerrainQuadtreePatchMeshBuilder();
  const coarseBaseGeometry = builder.buildVertexData(field, coarseNode, descriptor, 4);
  const coarseEdgeFanGeometry = builder.buildVertexData(field, coarseNode, descriptor, 4, coarseLeaf?.seamInfo);
  const fineGeometry = builder.buildVertexData(field, fineNode, descriptor, 1, fineLeaf?.seamInfo);
  const sharedX = heightFieldIndexToLocalX(field, coarseNode.ix1);
  const coarseEdge = collectVerticesAtX(coarseEdgeFanGeometry.positions, sharedX);
  const fineEdge = collectVerticesAtX(fineGeometry.positions, sharedX);
  const edgeFanYValues = coarseEdgeFanGeometry.positions.filter((_value, index) => index % 3 === 1);

  assert(coarseLeaf?.seamInfo?.east?.mode === "stitch-to-finer", "Test setup should produce a coarse edge stitched to a finer neighbor.");
  assert(
    JSON.stringify(Array.from(coarseEdge.entries())) === JSON.stringify(Array.from(fineEdge.entries())),
    "Edge-fan coarse patch edge should expose the same top-surface vertices as the finer neighbor."
  );
  assert(
    coarseEdgeFanGeometry.positions.length > coarseBaseGeometry.positions.length,
    "Edge fans should add top-surface seam vertices on mixed-LOD edges."
  );
  assert(
    coarseEdgeFanGeometry.indices.length > coarseBaseGeometry.indices.length,
    "Edge fans should add transition triangles instead of relying on side-wall skirts."
  );
  assert(Math.min(...edgeFanYValues) === 0 && Math.max(...edgeFanYValues) === 0, "Edge-fan seam geometry should stay on the terrain surface without skirt drop vertices.");
}

function testQuadtreePatchMorphsCoarseInteriorHeightTowardFinerEdge(): void {
  const heights = new Float32Array(17 * 17);
  for (let iz = 0; iz < 17; iz += 1) {
    heights[(iz * 17) + 8] = 100;
  }
  const field = new TerrainHeightField(16, 16, 17, 17, heights);
  const root = new TerrainQuadtreeLodBuilder().buildRoot(field, 1);
  const coarseNode = root.children[0]!;
  const fineNode = root.children[1]!;
  const descriptor = createFlatTerrainDescriptor(16, 16, 17, 17);
  const [coarseLeaf, fineLeaf] = new TerrainQuadtreeLodSeamResolver().applySeamCompatibility([
    createTestLeaf(coarseNode, 4),
    createTestLeaf(fineNode, 1)
  ]);
  const builder = new TerrainQuadtreePatchMeshBuilder();
  const coarseGeometry = builder.buildVertexData(field, coarseNode, descriptor, 4, coarseLeaf?.seamInfo);
  const fineGeometry = builder.buildVertexData(field, fineNode, descriptor, 1, fineLeaf?.seamInfo);
  const sharedX = heightFieldIndexToLocalX(field, 8);
  const interiorX = heightFieldIndexToLocalX(field, 4);
  const sampleZ = heightFieldIndexToLocalZ(field, 4);
  const coarseBoundaryHeight = findVertexYAt(coarseGeometry.positions, sharedX, sampleZ);
  const fineBoundaryHeight = findVertexYAt(fineGeometry.positions, sharedX, sampleZ);
  const morphedInteriorHeight = findVertexYAt(coarseGeometry.positions, interiorX, sampleZ);

  assert(coarseBoundaryHeight === 100 && fineBoundaryHeight === 100, "Shared seam boundary should keep exact height on both LODs.");
  assert(
    morphedInteriorHeight !== null && morphedInteriorHeight > 0 && morphedInteriorHeight < 100,
    `Coarse interior vertex near a finer seam should morph toward the seam height, received ${morphedInteriorHeight}.`
  );
}

function findVertexYAt(positions: readonly number[], expectedX: number, expectedZ: number): number | null {
  for (let offset = 0; offset < positions.length; offset += 3) {
    const x = positions[offset] ?? 0;
    const z = positions[offset + 2] ?? 0;
    if (Math.abs(x - expectedX) <= 1e-6 && Math.abs(z - expectedZ) <= 1e-6) {
      return positions[offset + 1] ?? 0;
    }
  }
  return null;
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

function testQuadtreeLodHasNoSkirtDepth(): void {
  const field = TerrainHeightField.createFilled(128, 128, 129, 129, 0);
  const descriptor = quadtreeLodDescriptorResolver.resolve(undefined, field);

  assert(!("skirtDepth" in descriptor), "Runtime quadtree LOD descriptor should not expose skirtDepth.");
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

function testQuadtreeSampleStepPolicyTreatsRingStepAsMinimumDecimation(): void {
  const field = TerrainHeightField.createFilled(64, 64, 65, 65, 0);
  const node = new TerrainQuadtreeLodBuilder().buildRoot(field, 0);
  const policy = new TerrainQuadtreeSampleStepPolicy();

  assert(policy.computeNaturalSampleStep(node, 32) === 2, "Test setup should produce natural sampleStep=2.");
  assert(
    policy.computePatchSampleStep(node, 32, 16) === 16,
    "Far ring desired sampleStep=16 should not be reduced to the natural sampleStep=2."
  );
}

function testQuadtreeSampleStepPolicyKeepsNaturalBudgetFloor(): void {
  const field = TerrainHeightField.createFilled(128, 128, 129, 129, 0);
  const node = new TerrainQuadtreeLodBuilder().buildRoot(field, 0);
  const policy = new TerrainQuadtreeSampleStepPolicy();

  assert(policy.computeNaturalSampleStep(node, 32) === 4, "Test setup should produce natural sampleStep=4.");
  assert(
    policy.computePatchSampleStep(node, 32, 1) === 4,
    "Near desired sampleStep=1 should still be raised when the patch exceeds the mesh quad budget."
  );
}

function testQuadtreeSelectionKeepsFarTerrainCoarse(): void {
  const field = TerrainHeightField.createFilled(512, 512, 513, 513, 0);
  const builder = new TerrainQuadtreeLodBuilder();
  const descriptor = quadtreeLodDescriptorResolver.resolve(undefined, field);
  const root = builder.buildRoot(field, descriptor.maxDepth);
  const leaves = builder.selectVisibleLeaves(root, Vector3.Zero(), descriptor, field);
  const seamCompatibleLeaves = new TerrainQuadtreeLodSeamResolver().applySeamCompatibility(leaves);
  const depths = new Set(leaves.map((leaf) => leaf.node.depth));
  const sampleSteps = new Set(leaves.map((leaf) => leaf.sampleStep));
  const buildSampleSteps = new Set(seamCompatibleLeaves.map((leaf) => leaf.buildSampleStep ?? leaf.sampleStep));
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
    Array.from(buildSampleSteps).some((sampleStep) => sampleStep > 1),
    "Seam compatibility should not force every terrain patch to build at sampleStep=1."
  );
  assert(
    Array.from(depths).some((depth) => depth < descriptor.maxDepth),
    "Large terrain LOD should keep coarser patches away from the anchor."
  );
  assert(maxDepthLeaves.length < leaves.length, "Large terrain LOD should not make every selected leaf a max-depth leaf.");
}

function testQuadtreeStitchedSelectionHasMatchingSharedEdges(): void {
  const field = createSlopedHeightField(128, 128, 129, 129);
  const builder = new TerrainQuadtreeLodBuilder();
  const descriptor = quadtreeLodDescriptorResolver.resolve(undefined, field);
  const root = builder.buildRoot(field, descriptor.maxDepth);
  const leaves = new TerrainQuadtreeLodSeamResolver().applySeamCompatibility(
    builder.selectVisibleLeaves(root, Vector3.Zero(), descriptor, field)
  );
  const meshBuilder = new TerrainQuadtreePatchMeshBuilder();
  const terrainDescriptor = createFlatTerrainDescriptor(128, 128, 129, 129);
  const geometryByLeaf = new Map<TerrainQuadtreeLeafSelection, ReturnType<TerrainQuadtreePatchMeshBuilder["buildVertexData"]>>();

  for (const leaf of leaves) {
    geometryByLeaf.set(
      leaf,
      meshBuilder.buildVertexData(field, leaf.node, terrainDescriptor, leaf.sampleStep, leaf.seamInfo)
    );
  }

  let checkedEdges = 0;
  for (const leaf of leaves) {
    for (const other of leaves) {
      if (leaf === other) {
        continue;
      }

      if (leaf.node.ix1 === other.node.ix0 && rangesOverlap(leaf.node.iz0, leaf.node.iz1, other.node.iz0, other.node.iz1)) {
        assertSharedVerticalEdgeMatches(field, geometryByLeaf, leaf, other, leaf.node.ix1);
        checkedEdges += 1;
      }
      if (leaf.node.iz1 === other.node.iz0 && rangesOverlap(leaf.node.ix0, leaf.node.ix1, other.node.ix0, other.node.ix1)) {
        assertSharedHorizontalEdgeMatches(field, geometryByLeaf, leaf, other, leaf.node.iz1);
        checkedEdges += 1;
      }
    }
  }

  assert(checkedEdges > 0, "Stitched quadtree selection test should compare at least one shared patch edge.");
}

function assertSharedVerticalEdgeMatches(
  field: TerrainHeightField,
  geometryByLeaf: ReadonlyMap<TerrainQuadtreeLeafSelection, ReturnType<TerrainQuadtreePatchMeshBuilder["buildVertexData"]>>,
  left: TerrainQuadtreeLeafSelection,
  right: TerrainQuadtreeLeafSelection,
  sharedIx: number
): void {
  const leftGeometry = geometryByLeaf.get(left);
  const rightGeometry = geometryByLeaf.get(right);
  assert(leftGeometry !== undefined && rightGeometry !== undefined, "Shared vertical edge test setup should have both geometries.");
  const sharedX = heightFieldIndexToLocalX(field, sharedIx);
  const startIz = Math.max(left.node.iz0, right.node.iz0);
  const endIz = Math.min(left.node.iz1, right.node.iz1);
  const minZ = heightFieldIndexToLocalZ(field, endIz);
  const maxZ = heightFieldIndexToLocalZ(field, startIz);
  const leftEdge = collectVerticesAtX(leftGeometry.positions, sharedX, minZ, maxZ);
  const rightEdge = collectVerticesAtX(rightGeometry.positions, sharedX, minZ, maxZ);

  assert(
    JSON.stringify(Array.from(leftEdge.entries())) === JSON.stringify(Array.from(rightEdge.entries())),
    `Shared vertical edge should match for ${left.node.id} and ${right.node.id}.`
  );
}

function assertSharedHorizontalEdgeMatches(
  field: TerrainHeightField,
  geometryByLeaf: ReadonlyMap<TerrainQuadtreeLeafSelection, ReturnType<TerrainQuadtreePatchMeshBuilder["buildVertexData"]>>,
  north: TerrainQuadtreeLeafSelection,
  south: TerrainQuadtreeLeafSelection,
  sharedIz: number
): void {
  const northGeometry = geometryByLeaf.get(north);
  const southGeometry = geometryByLeaf.get(south);
  assert(northGeometry !== undefined && southGeometry !== undefined, "Shared horizontal edge test setup should have both geometries.");
  const sharedZ = heightFieldIndexToLocalZ(field, sharedIz);
  const startIx = Math.max(north.node.ix0, south.node.ix0);
  const endIx = Math.min(north.node.ix1, south.node.ix1);
  const minX = heightFieldIndexToLocalX(field, startIx);
  const maxX = heightFieldIndexToLocalX(field, endIx);
  const northEdge = collectVerticesAtZ(northGeometry.positions, sharedZ, minX, maxX);
  const southEdge = collectVerticesAtZ(southGeometry.positions, sharedZ, minX, maxX);

  assert(
    JSON.stringify(Array.from(northEdge.entries())) === JSON.stringify(Array.from(southEdge.entries())),
    `Shared horizontal edge should match for ${north.node.id} and ${south.node.id}.`
  );
}

function rangesOverlap(leftStart: number, leftEnd: number, rightStart: number, rightEnd: number): boolean {
  return Math.max(leftStart, rightStart) < Math.min(leftEnd, rightEnd);
}

function testQuadtreeDefaultRingsSelectHighFarSampleSteps(): void {
  const field = TerrainHeightField.createFilled(512, 512, 513, 513, 0);
  const builder = new TerrainQuadtreeLodBuilder();
  const descriptor = quadtreeLodDescriptorResolver.resolve(undefined, field);
  const root = builder.buildRoot(field, descriptor.maxDepth);
  const leaves = builder.selectVisibleLeaves(root, Vector3.Zero(), descriptor, field);
  const farLeaves = leaves.filter((leaf) => leaf.distanceToAnchor > 160);
  const farSampleSteps = new Set(farLeaves.map((leaf) => leaf.sampleStep));

  assert(farLeaves.length > 0, "512m terrain should produce visible leaves beyond 160m.");
  assert(
    Array.from(farSampleSteps).some((sampleStep) => sampleStep >= 8),
    `Default LOD rings should produce sampleStep>=8 for far nodes, received [${Array.from(farSampleSteps).join(",")}].`
  );
}

function testQuadtreeFarSampleStepsReduceApproximateTriangleCount(): void {
  const field = TerrainHeightField.createFilled(512, 512, 513, 513, 0);
  const builder = new TerrainQuadtreeLodBuilder();
  const highDecimationDescriptor = quadtreeLodDescriptorResolver.resolve(undefined, field);
  const lowDecimationDescriptor = quadtreeLodDescriptorResolver.resolve({
    lodRings: [
      { distance: 40, maxSampleStep: 1 },
      { distance: 80, maxSampleStep: 1 },
      { distance: 160, maxSampleStep: 1 },
      { distance: 320, maxSampleStep: 1 },
      { distance: 640, maxSampleStep: 1 },
      { distance: 1280, maxSampleStep: 1 }
    ]
  }, field);
  const root = builder.buildRoot(field, highDecimationDescriptor.maxDepth);
  const highDecimationLeaves = builder.selectVisibleLeaves(root, Vector3.Zero(), highDecimationDescriptor, field);
  const lowDecimationLeaves = builder.selectVisibleLeaves(root, Vector3.Zero(), lowDecimationDescriptor, field);
  const highDecimationTriangleCount = estimateLodTriangleCount(highDecimationLeaves);
  const lowDecimationTriangleCount = estimateLodTriangleCount(lowDecimationLeaves);

  assert(
    highDecimationTriangleCount < lowDecimationTriangleCount * 0.75,
    `Far LOD rings should substantially reduce visible triangles: high=${highDecimationTriangleCount}, low=${lowDecimationTriangleCount}.`
  );
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

function testTerrainFrustumPolicyRejectsOutsideNodes(): void {
  const engine = new NullEngine();
  const scene = new Scene(engine);
  const camera = new FreeCamera("frustum-camera", new Vector3(0, 12, -40), scene);
  camera.setTarget(Vector3.Zero());
  camera.minZ = 0.1;
  camera.maxZ = 120;
  scene.activeCamera = camera;
  const terrainRoot = new TransformNode("terrain-root", scene);
  const field = TerrainHeightField.createFilled(32, 32, 33, 33, 0);
  const policy = new TerrainFrustumCullingPolicy({
    terrainRoot,
    heightField: field,
    camera,
    anchorLocal: Vector3.Zero(),
    horizontalWorldScale: 1,
    options: {
      enabled: true,
      guardWorldPadding: 0,
      keepNearAnchorRadius: 0,
      maxHeightPadding: 1
    }
  });

  const outsideNode = {
    ...createTestNode("outside", 0, 0, 8, 8),
    centerLocalX: 1000,
    centerLocalZ: 0,
    sizeWorldX: 8,
    sizeWorldZ: 8
  };
  const insideNode = {
    ...createTestNode("inside", 0, 0, 8, 8),
    centerLocalX: 0,
    centerLocalZ: 0,
    sizeWorldX: 8,
    sizeWorldZ: 8
  };

  assert(policy.shouldKeepNode(insideNode), "Frustum policy should keep nodes inside the active camera frustum.");
  assert(!policy.shouldKeepNode(outsideNode), "Frustum policy should reject nodes far outside the active camera frustum.");
  const diagnostics = policy.getDiagnostics();
  assert(diagnostics.testedNodeCount === 2, "Frustum diagnostics should count tested nodes.");
  assert(diagnostics.rejectedNodeCount === 1, "Frustum diagnostics should count rejected nodes.");
  assert(diagnostics.acceptedNodeCount === 1, "Frustum diagnostics should count accepted nodes.");

  scene.dispose();
  engine.dispose();
}

function testTerrainFrustumPolicyKeepsNearAnchorNodes(): void {
  const engine = new NullEngine();
  const scene = new Scene(engine);
  const camera = new FreeCamera("frustum-camera", new Vector3(0, 12, -40), scene);
  camera.setTarget(Vector3.Zero());
  camera.minZ = 0.1;
  camera.maxZ = 120;
  scene.activeCamera = camera;
  const terrainRoot = new TransformNode("terrain-root", scene);
  const field = TerrainHeightField.createFilled(32, 32, 33, 33, 0);
  const nearAnchorNode = {
    ...createTestNode("near-anchor-outside-frustum", 0, 0, 8, 8),
    centerLocalX: 1000,
    centerLocalZ: 0,
    sizeWorldX: 8,
    sizeWorldZ: 8
  };
  const policy = new TerrainFrustumCullingPolicy({
    terrainRoot,
    heightField: field,
    camera,
    anchorLocal: new Vector3(1000, 0, 0),
    horizontalWorldScale: 1,
    options: {
      enabled: true,
      guardWorldPadding: 0,
      keepNearAnchorRadius: 10,
      maxHeightPadding: 1
    }
  });

  assert(policy.shouldKeepNode(nearAnchorNode), "Near-anchor guard should keep terrain around the player even outside the frustum.");
  const diagnostics = policy.getDiagnostics();
  assert(diagnostics.keptByNearAnchorCount === 1, "Frustum diagnostics should count nodes kept by near-anchor guard.");
  assert(diagnostics.rejectedNodeCount === 0, "Near-anchor nodes should not be counted as rejected.");

  scene.dispose();
  engine.dispose();
}

function testQuadtreeLodControllerKeepsNearAnchorTerrainWithFrustumCulling(): void {
  const engine = new NullEngine();
  const scene = new Scene(engine);
  const camera = new FreeCamera("lod-camera", new Vector3(0, 16, -40), scene);
  camera.setTarget(new Vector3(0, 16, -80));
  camera.minZ = 0.1;
  camera.maxZ = 120;
  scene.activeCamera = camera;
  const terrainRoot = new TransformNode("terrain-root", scene);
  const field = createSlopedHeightField(64, 64, 65, 65);
  const descriptor = createFlatTerrainDescriptor(64, 64, 65, 65);
  const controller = new TerrainQuadtreeLodController({
    scene,
    terrainRoot,
    descriptor,
    heightField: field,
    lod: {
      enabled: true,
      maxDepth: 4,
      targetPatchQuads: 8,
      nearPatchWorldSize: 8,
      nearFullResolutionRadius: 12,
      lodRings: [
        { distance: 12, maxSampleStep: 1 },
        { distance: 32, maxSampleStep: 2 },
        { distance: 128, maxSampleStep: 4 }
      ],
      frustumCulling: {
        enabled: true,
        guardWorldPadding: 0,
        keepNearAnchorRadius: 16,
        maxHeightPadding: 4
      },
      updateIntervalSeconds: 0,
      updateMovementThreshold: 0
    },
    material: null,
    canonicalPickMesh: null
  });

  controller.update(1, { position: Vector3.Zero(), source: "player" });
  const diagnostics = controller.getDiagnostics();

  assert(diagnostics.visibleLeafCount > 0, "Near-anchor guard should prevent a fully empty terrain selection.");
  assert(diagnostics.minDistanceToAnchor === 0, "Selected near-anchor terrain should cover the player position.");
  assert(diagnostics.frustumCulling.enabled, "Frustum diagnostics should report enabled culling when a camera is active.");
  assert(diagnostics.frustumCulling.keptByNearAnchorCount > 0, "Frustum diagnostics should expose near-anchor keeps.");

  controller.dispose();
  scene.dispose();
  engine.dispose();
}

function testQuadtreeLodControllerDisposesInactivePatchMeshes(): void {
  const engine = new NullEngine();
  const scene = new Scene(engine);
  const terrainRoot = new TransformNode("terrain-root", scene);
  const field = createSlopedHeightField(64, 64, 65, 65);
  const descriptor = createFlatTerrainDescriptor(64, 64, 65, 65);
  const controller = new TerrainQuadtreeLodController({
    scene,
    terrainRoot,
    descriptor,
    heightField: field,
    lod: {
      enabled: true,
      maxDepth: 4,
      targetPatchQuads: 8,
      nearPatchWorldSize: 8,
      nearFullResolutionRadius: 8,
      lodRings: [
        { distance: 8, maxSampleStep: 1 },
        { distance: 32, maxSampleStep: 2 },
        { distance: 128, maxSampleStep: 4 }
      ],
      updateIntervalSeconds: 0,
      updateMovementThreshold: 0
    },
    material: null,
    canonicalPickMesh: null
  });

  controller.update(1, { position: Vector3.Zero(), source: "player" });
  const firstDiagnostics = controller.getDiagnostics();
  controller.update(1, { position: new Vector3(24, 0, 24), source: "player" });
  const secondDiagnostics = controller.getDiagnostics();
  const scenePatchMeshCount = scene.meshes.filter((mesh) =>
    (mesh.metadata as { terrainKind?: unknown } | null | undefined)?.terrainKind === "generated-lod-visual"
  ).length;

  assert(firstDiagnostics.activePatchMeshCount > 0, "LOD controller should create active patch meshes on first update.");
  assert(firstDiagnostics.cachedPatchMeshCount === firstDiagnostics.activePatchMeshCount, "Initial patch cache should contain only active patches.");
  assert(secondDiagnostics.activePatchMeshCount > 0, "LOD controller should keep active patch meshes after anchor movement.");
  assert(secondDiagnostics.inactiveCachedPatchMeshCount === 0, "LOD controller should dispose inactive patch meshes instead of accumulating them.");
  assert(secondDiagnostics.cachedPatchMeshCount === secondDiagnostics.activePatchMeshCount, "Patch cache should be bounded to the current visible selection.");
  assert(secondDiagnostics.cachedPatchVertices === secondDiagnostics.activePatchVertices, "Cached patch geometry should not include inactive vertices.");
  assert(scenePatchMeshCount === secondDiagnostics.activePatchMeshCount, "Disposed inactive patch meshes should be removed from the scene.");

  controller.dispose();
  scene.dispose();
  engine.dispose();
}

function testQuadtreeLodControllerReusesPatchesAndReportsLifecycle(): void {
  const engine = new NullEngine();
  const scene = new Scene(engine);
  const terrainRoot = new TransformNode("terrain-root", scene);
  const field = createSlopedHeightField(64, 64, 65, 65);
  const descriptor = createFlatTerrainDescriptor(64, 64, 65, 65);
  const controller = new TerrainQuadtreeLodController({
    scene,
    terrainRoot,
    descriptor,
    heightField: field,
    lod: {
      enabled: true,
      maxDepth: 4,
      targetPatchQuads: 8,
      nearPatchWorldSize: 8,
      nearFullResolutionRadius: 8,
      lodRings: [
        { distance: 8, maxSampleStep: 1 },
        { distance: 32, maxSampleStep: 2 },
        { distance: 128, maxSampleStep: 4 }
      ],
      updateIntervalSeconds: 0,
      updateMovementThreshold: 0
    },
    material: null,
    canonicalPickMesh: null
  });

  controller.update(1, { position: Vector3.Zero(), source: "player" });
  const firstDiagnostics = controller.getDiagnostics();
  controller.update(1, { position: Vector3.Zero(), source: "player" });
  const secondDiagnostics = controller.getDiagnostics();

  assert(firstDiagnostics.patchesBuiltLastUpdate === firstDiagnostics.activePatchMeshCount, "First LOD update should report built patch meshes.");
  assert(firstDiagnostics.patchesReusedLastUpdate === 0, "First LOD update should not report reused patch meshes.");
  assert(secondDiagnostics.patchesBuiltLastUpdate === 0, "Stable LOD update should not rebuild existing patches.");
  assert(secondDiagnostics.patchesReusedLastUpdate === secondDiagnostics.activePatchMeshCount, "Stable LOD update should report reused patches.");
  assert(secondDiagnostics.patchesDisposedLastUpdate === 0, "Stable LOD update should not dispose patches.");

  controller.dispose();
  scene.dispose();
  engine.dispose();
}

function testQuadtreeLodControllerEvictsInactiveCacheByCountTrianglesAndTtl(): void {
  const countDiagnostics = runPatchCacheEvictionScenario({
    maxInactivePatches: 1,
    maxInactivePatchTriangles: 1_000_000,
    inactiveTtlSeconds: 100
  });
  assert(countDiagnostics.inactivePatchMeshCount <= 1, "Patch cache should respect max inactive patch count.");
  assert(countDiagnostics.patchesDisabledLastUpdate > 0, "Patch cache should report disabled non-selected patches.");
  assert(countDiagnostics.patchesDisposedLastUpdate > 0, "Patch cache should dispose LRU inactive patches beyond max count.");

  const triangleDiagnostics = runPatchCacheEvictionScenario({
    maxInactivePatches: 100,
    maxInactivePatchTriangles: 0,
    inactiveTtlSeconds: 100
  });
  assert(triangleDiagnostics.inactivePatchMeshCount === 0, "Patch cache should evict inactive patches beyond triangle budget.");
  assert(triangleDiagnostics.inactivePatchTriangles === 0, "Patch cache should report no inactive triangles after triangle-budget eviction.");

  const ttlDiagnostics = runPatchCacheEvictionScenario({
    maxInactivePatches: 100,
    maxInactivePatchTriangles: 1_000_000,
    inactiveTtlSeconds: 0
  });
  assert(ttlDiagnostics.inactivePatchMeshCount === 0, "Patch cache should evict inactive patches older than TTL.");
}

function runPatchCacheEvictionScenario(patchCache: {
  readonly maxInactivePatches: number;
  readonly maxInactivePatchTriangles: number;
  readonly inactiveTtlSeconds: number;
}) {
  const engine = new NullEngine();
  const scene = new Scene(engine);
  const terrainRoot = new TransformNode("terrain-root", scene);
  const field = createSlopedHeightField(64, 64, 65, 65);
  const descriptor = createFlatTerrainDescriptor(64, 64, 65, 65);
  const controller = new TerrainQuadtreeLodController({
    scene,
    terrainRoot,
    descriptor,
    heightField: field,
    lod: {
      enabled: true,
      maxDepth: 4,
      targetPatchQuads: 8,
      nearPatchWorldSize: 8,
      nearFullResolutionRadius: 8,
      lodRings: [
        { distance: 8, maxSampleStep: 1 },
        { distance: 32, maxSampleStep: 2 },
        { distance: 128, maxSampleStep: 4 }
      ],
      patchCache: {
        enabled: true,
        ...patchCache
      },
      updateIntervalSeconds: 0,
      updateMovementThreshold: 0
    },
    material: null,
    canonicalPickMesh: null
  });

  controller.update(1, { position: Vector3.Zero(), source: "player" });
  controller.update(1, { position: new Vector3(24, 0, 24), source: "player" });
  const diagnostics = controller.getDiagnostics();

  controller.dispose();
  scene.dispose();
  engine.dispose();
  return diagnostics;
}

function testQuadtreeLodControllerExpandsNearRadiusForDistantPlayerCamera(): void {
  const engine = new NullEngine();
  const scene = new Scene(engine);
  const camera = new FreeCamera("lod-camera", new Vector3(0, 16, -100), scene);
  scene.activeCamera = camera;
  const terrainRoot = new TransformNode("terrain-root", scene);
  const field = createSlopedHeightField(128, 128, 129, 129);
  const descriptor = createFlatTerrainDescriptor(128, 128, 129, 129);
  const controller = new TerrainQuadtreeLodController({
    scene,
    terrainRoot,
    descriptor,
    heightField: field,
    lod: {
      enabled: true,
      maxDepth: 5,
      targetPatchQuads: 8,
      nearPatchWorldSize: 8,
      nearFullResolutionRadius: 16,
      lodRings: [
        { distance: 16, maxSampleStep: 1 },
        { distance: 32, maxSampleStep: 2 },
        { distance: 64, maxSampleStep: 4 },
        { distance: 128, maxSampleStep: 8 }
      ],
      updateIntervalSeconds: 0,
      updateMovementThreshold: 0
    },
    material: null,
    canonicalPickMesh: null
  });

  controller.update(1, { position: Vector3.Zero(), source: "player" });
  const diagnostics = controller.getDiagnostics();

  assert(
    diagnostics.effectiveNearFullResolutionRadius > 16,
    `Distant player camera should expand near full-resolution terrain radius, received ${diagnostics.effectiveNearFullResolutionRadius}.`
  );
  assert(
    diagnostics.effectiveNearFullResolutionRadius <= 48,
    `Camera guard radius should stay capped by 3x base near radius, received ${diagnostics.effectiveNearFullResolutionRadius}.`
  );

  controller.dispose();
  scene.dispose();
  engine.dispose();
}

function testQuadtreeLodControllerAppliesRuntimeDistanceTuning(): void {
  const engine = new NullEngine();
  const scene = new Scene(engine);
  const terrainRoot = new TransformNode("terrain-root", scene);
  const field = createSlopedHeightField(128, 128, 129, 129);
  const descriptor = createFlatTerrainDescriptor(128, 128, 129, 129);
  const controller = new TerrainQuadtreeLodController({
    scene,
    terrainRoot,
    descriptor,
    heightField: field,
    lod: {
      enabled: true,
      maxDepth: 5,
      targetPatchQuads: 8,
      nearPatchWorldSize: 8,
      nearFullResolutionRadius: 16,
      lodRings: [
        { distance: 16, maxSampleStep: 1 },
        { distance: 32, maxSampleStep: 2 },
        { distance: 64, maxSampleStep: 4 },
        { distance: 128, maxSampleStep: 8 }
      ],
      updateIntervalSeconds: 0,
      updateMovementThreshold: 0
    },
    material: null,
    canonicalPickMesh: null
  });

  controller.setRuntimeLodTuning({
    lod0Distance: 48,
    lod1Distance: 96
  });
  controller.update(1, { position: Vector3.Zero(), source: "player" });
  const diagnostics = controller.getDiagnostics();
  const tuning = controller.getRuntimeLodTuning();

  assert(tuning.lod0Distance === 48 && tuning.lod1Distance === 96, "Runtime LOD tuning should be retained by the controller.");
  assertClose(diagnostics.effectiveNearFullResolutionRadius, 48, "Runtime LOD0 tuning should override the near full-resolution radius.");

  controller.dispose();
  scene.dispose();
  engine.dispose();
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

function estimateLodTriangleCount(
  leaves: readonly { readonly node: { readonly ix0: number; readonly ix1: number; readonly iz0: number; readonly iz1: number }; readonly sampleStep: number }[]
): number {
  return leaves.reduce((sum, leaf) => {
    const xSegments = Math.max(1, Math.ceil((leaf.node.ix1 - leaf.node.ix0) / leaf.sampleStep));
    const zSegments = Math.max(1, Math.ceil((leaf.node.iz1 - leaf.node.iz0) / leaf.sampleStep));
    const topTriangles = xSegments * zSegments * 2;
    return sum + topTriangles;
  }, 0);
}
