import { TerrainSplatMap } from "../../src/editor/terrain/editing/TerrainSplatMap";
import { TerrainTexturePainter } from "../../src/editor/terrain/editing/TerrainTexturePainter";
import type { TerrainBrushSettings } from "../../src/editor/terrain/editing/TerrainBrushTypes";

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

function assertClose(actual: number, expected: number, message: string): void {
  const epsilon = 1e-5;
  assert(Math.abs(actual - expected) <= epsilon, `${message}: expected ${expected}, received ${actual}`);
}

const CIRCLE_BRUSH: TerrainBrushSettings = {
  shape: "circle",
  radius: 2,
  strength: 8,
  falloff: 0
};

const SQUARE_BRUSH: TerrainBrushSettings = {
  ...CIRCLE_BRUSH,
  shape: "square"
};

function testInitializesFirstLayer(): void {
  const splatMap = new TerrainSplatMap(4, 3, 3);
  for (let iz = 0; iz < splatMap.resolutionZ; iz += 1) {
    for (let ix = 0; ix < splatMap.resolutionX; ix += 1) {
      assertClose(splatMap.getWeight(ix, iz, 0), 1, "Layer 0 should initialize to 1.");
      assertClose(splatMap.getWeight(ix, iz, 1), 0, "Layer 1 should initialize to 0.");
      assertClose(splatMap.getWeight(ix, iz, 2), 0, "Layer 2 should initialize to 0.");
    }
  }
}

function testPaintingIncreasesSelectedLayer(): void {
  const splatMap = new TerrainSplatMap(9, 9, 3);
  const painter = new TerrainTexturePainter();
  painter.paint(splatMap, {
    center: { x: 0, z: 0 },
    terrainWidth: 8,
    terrainDepth: 8,
    brush: CIRCLE_BRUSH,
    layerIndex: 1,
    deltaTime: 0.2
  });

  assert(splatMap.getWeight(4, 4, 1) > 0, "Painting should increase selected layer weight inside brush area.");
  assert(splatMap.getWeight(0, 0, 1) === 0, "Painting should not affect texels outside the brush.");
}

function testChangedTexelsRemainNormalized(): void {
  const splatMap = new TerrainSplatMap(9, 9, 4);
  const painter = new TerrainTexturePainter();
  painter.paint(splatMap, {
    center: { x: 0, z: 0 },
    terrainWidth: 8,
    terrainDepth: 8,
    brush: CIRCLE_BRUSH,
    layerIndex: 2,
    deltaTime: 0.2
  });

  forEachTexel(splatMap, (ix, iz) => {
    if (splatMap.getWeight(ix, iz, 2) <= 0) {
      return;
    }
    assertClose(sumWeights(splatMap, ix, iz), 1, "Changed texel weights should stay normalized.");
  });
}

function testPaintingClampsWeights(): void {
  const splatMap = new TerrainSplatMap(5, 5, 2);
  const painter = new TerrainTexturePainter();
  painter.paint(splatMap, {
    center: { x: 0, z: 0 },
    terrainWidth: 4,
    terrainDepth: 4,
    brush: {
      shape: "circle",
      radius: 10,
      strength: 1000,
      falloff: 0
    },
    layerIndex: 1,
    deltaTime: 10
  });

  forEachTexel(splatMap, (ix, iz) => {
    for (let layerIndex = 0; layerIndex < splatMap.layerCount; layerIndex += 1) {
      const weight = splatMap.getWeight(ix, iz, layerIndex);
      assert(weight >= 0 && weight <= 1, "Painted weights should be clamped to [0, 1].");
    }
    assertClose(sumWeights(splatMap, ix, iz), 1, "Clamped texel weights should stay normalized.");
  });
}

function testCircleAndSquareBrushShapesAffectExpectedTexels(): void {
  const circleMap = new TerrainSplatMap(5, 5, 2);
  const squareMap = new TerrainSplatMap(5, 5, 2);
  const painter = new TerrainTexturePainter();

  painter.paint(circleMap, {
    center: { x: 0, z: 0 },
    terrainWidth: 4,
    terrainDepth: 4,
    brush: CIRCLE_BRUSH,
    layerIndex: 1,
    deltaTime: 0.2
  });
  painter.paint(squareMap, {
    center: { x: 0, z: 0 },
    terrainWidth: 4,
    terrainDepth: 4,
    brush: SQUARE_BRUSH,
    layerIndex: 1,
    deltaTime: 0.2
  });

  assert(circleMap.getWeight(4, 4, 1) === 0, "Circle brush should not affect corner texels outside its radius.");
  assert(squareMap.getWeight(4, 4, 1) > 0, "Square brush should affect corner texels inside its square radius.");
}

function testSplatTextureChunkCounts(): void {
  const cases = [
    { layers: 1, chunks: 1 },
    { layers: 4, chunks: 1 },
    { layers: 5, chunks: 2 },
    { layers: 9, chunks: 3 }
  ];

  for (const testCase of cases) {
    const splatMap = new TerrainSplatMap(1, 1, testCase.layers);
    assert(
      splatMap.getSplatTextureCount() === testCase.chunks,
      `${testCase.layers} layers should export ${testCase.chunks} splat texture chunk(s).`
    );
  }
}

function testChunkExportMapsLayerFourToSecondTextureRedChannel(): void {
  const splatMap = new TerrainSplatMap(1, 1, 5);
  splatMap.setWeight(0, 0, 0, 0);
  splatMap.setWeight(0, 0, 4, 1);
  splatMap.normalizeTexel(0, 0);

  const chunk0 = splatMap.toRgba8ArrayForChunk(0);
  const chunk1 = splatMap.toRgba8ArrayForChunk(1);

  assert(chunk0[0] === 0, "Layer 0 should export to chunk 0 red channel.");
  assert(chunk1[0] === 255, "Layer 4 should export to chunk 1 red channel.");
  assert(chunk1[1] === 0 && chunk1[2] === 0 && chunk1[3] === 0, "Unused chunk 1 channels should export as zero.");
}

function testPaintingLayerAboveFirstChunkUpdatesCorrectChunk(): void {
  const splatMap = new TerrainSplatMap(9, 9, 5);
  const painter = new TerrainTexturePainter();
  painter.paint(splatMap, {
    center: { x: 0, z: 0 },
    terrainWidth: 8,
    terrainDepth: 8,
    brush: CIRCLE_BRUSH,
    layerIndex: 4,
    deltaTime: 0.2
  });

  const centerOffset = ((4 * splatMap.resolutionX) + 4) * 4;
  const chunk1 = splatMap.toRgba8ArrayForChunk(1);
  assert(chunk1[centerOffset] > 0, "Painting layer 4 should update chunk 1 red channel.");
  assertClose(sumWeights(splatMap, 4, 4), 1, "Painting layer 4 should keep the changed texel normalized.");
}

function testRgbaChunkRoundTripRestoresSplatWeights(): void {
  const splatMap = new TerrainSplatMap(3, 3, 5);
  splatMap.setWeight(1, 1, 0, 0.1);
  splatMap.setWeight(1, 1, 1, 0.2);
  splatMap.setWeight(1, 1, 2, 0.3);
  splatMap.setWeight(1, 1, 3, 0.15);
  splatMap.setWeight(1, 1, 4, 0.25);
  splatMap.normalizeTexel(1, 1);

  const restored = TerrainSplatMap.fromRgba8Chunks(
    splatMap.resolutionX,
    splatMap.resolutionZ,
    splatMap.layerCount,
    Array.from({ length: splatMap.getSplatTextureCount() }, (_unused, chunkIndex) => splatMap.toRgba8ArrayForChunk(chunkIndex, true)),
    true
  );

  for (let layerIndex = 0; layerIndex < splatMap.layerCount; layerIndex += 1) {
    const difference = Math.abs(restored.getWeight(1, 1, layerIndex) - splatMap.getWeight(1, 1, layerIndex));
    assert(difference <= 1 / 255, `Expected restored splat layer ${layerIndex} to stay within 8-bit quantization error.`);
  }
}

function testResampledMapUsesSmoothInterpolation(): void {
  const splatMap = new TerrainSplatMap(2, 2, 2);
  splatMap.weights.fill(0);
  splatMap.setWeight(0, 0, 0, 1);
  splatMap.setWeight(1, 0, 1, 1);
  splatMap.setWeight(0, 1, 1, 1);
  splatMap.setWeight(1, 1, 0, 1);

  const resampled = splatMap.resampled(3, 3);
  const centerLayer0 = resampled.getWeight(1, 1, 0);
  const centerLayer1 = resampled.getWeight(1, 1, 1);

  assert(centerLayer0 > 0.45 && centerLayer0 < 0.55, "Expected bilinear resampling to blend layer 0 at the center texel.");
  assert(centerLayer1 > 0.45 && centerLayer1 < 0.55, "Expected bilinear resampling to blend layer 1 at the center texel.");
  assertClose(sumWeights(resampled, 1, 1), 1, "Expected resampled texels to stay normalized.");
}

function testAsymmetricCornerPatternRoundTripsWithoutVerticalMirroring(): void {
  const splatMap = new TerrainSplatMap(4, 4, 3);
  splatMap.weights.fill(0);
  splatMap.setWeight(0, 0, 0, 1);
  splatMap.setWeight(3, 0, 1, 1);
  splatMap.setWeight(0, 3, 2, 1);
  splatMap.setWeight(3, 3, 1, 0.4);
  splatMap.setWeight(3, 3, 2, 0.6);
  splatMap.normalizeTexel(3, 3);

  const restored = TerrainSplatMap.fromRgba8Chunks(
    splatMap.resolutionX,
    splatMap.resolutionZ,
    splatMap.layerCount,
    Array.from({ length: splatMap.getSplatTextureCount() }, (_unused, chunkIndex) => splatMap.toRgba8ArrayForChunk(chunkIndex, true)),
    true
  );

  assert(restored.getWeight(0, 0, 0) > 0.99, "Expected top-left terrain texel to remain on layer 0 after round-trip.");
  assert(restored.getWeight(3, 0, 1) > 0.99, "Expected top-right terrain texel to remain on layer 1 after round-trip.");
  assert(restored.getWeight(0, 3, 2) > 0.99, "Expected bottom-left terrain texel to remain on layer 2 after round-trip.");
  assert(restored.getWeight(3, 3, 1) > 0.35, "Expected blended bottom-right terrain texel to preserve layer 1 weight after round-trip.");
  assert(restored.getWeight(3, 3, 2) > 0.55, "Expected blended bottom-right terrain texel to preserve layer 2 weight after round-trip.");
}

function forEachTexel(splatMap: TerrainSplatMap, callback: (ix: number, iz: number) => void): void {
  for (let iz = 0; iz < splatMap.resolutionZ; iz += 1) {
    for (let ix = 0; ix < splatMap.resolutionX; ix += 1) {
      callback(ix, iz);
    }
  }
}

function sumWeights(splatMap: TerrainSplatMap, ix: number, iz: number): number {
  let sum = 0;
  for (let layerIndex = 0; layerIndex < splatMap.layerCount; layerIndex += 1) {
    sum += splatMap.getWeight(ix, iz, layerIndex);
  }
  return sum;
}

function run(): void {
  testInitializesFirstLayer();
  testPaintingIncreasesSelectedLayer();
  testChangedTexelsRemainNormalized();
  testPaintingClampsWeights();
  testCircleAndSquareBrushShapesAffectExpectedTexels();
  testSplatTextureChunkCounts();
  testChunkExportMapsLayerFourToSecondTextureRedChannel();
  testPaintingLayerAboveFirstChunkUpdatesCorrectChunk();
  testRgbaChunkRoundTripRestoresSplatWeights();
  testResampledMapUsesSmoothInterpolation();
  testAsymmetricCornerPatternRoundTripsWithoutVerticalMirroring();
}

run();
console.log("TerrainSplatMap tests passed");
