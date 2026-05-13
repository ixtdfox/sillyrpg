import {
  assertSplatChunksContainPaintWeights,
  packRawSplatChunkForOpaquePng,
  unpackOpaquePngToRawSplatChunk
} from "../../src/editor/terrain/tools/EditorTerrainTextureMapPersistence";
import { resolveBakeUvColumn, resolveBakeUvRow } from "../../src/editor/terrain/tools/EditorTerrainTextureBakeService";

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

function testAllZeroPersistedChunksAreRejected(): void {
  let threw = false;
  try {
    assertSplatChunksContainPaintWeights([new Uint8Array(4 * 4 * 4)]);
  } catch (error) {
    threw = (error as Error).message.includes("contain no paint weights");
  }

  assert(threw, "Expected all-zero persisted splat chunks to be rejected.");
}

function testBakeOrientationUsesMeshTextureUvSpace(): void {
  const topRow = resolveBakeUvRow(0);
  const bottomRow = resolveBakeUvRow(1);
  const column = resolveBakeUvColumn(0.25);

  assert(topRow.layerUvV === 0, "Expected the top baked pixel row to map to texture V 0.");
  assert(topRow.terrainV === 1, "Expected the top baked pixel row to sample the positive-Z terrain edge.");
  assert(bottomRow.layerUvV === 1, "Expected the bottom baked pixel row to map to texture V 1.");
  assert(bottomRow.terrainV === 0, "Expected the bottom baked pixel row to sample the negative-Z terrain edge.");
  assert(column.layerUvU === 0.25 && column.terrainU === 0.25, "Expected baked columns to share the same U coordinate in terrain and texture space.");
}

function testOpaquePngPackingRoundTripsRawSplatBytes(): void {
  const raw = new Uint8Array([
    255, 10, 20, 30,
    40, 50, 60, 70,
    80, 90, 100, 110,
    120, 130, 140, 150
  ]);
  const packed = packRawSplatChunkForOpaquePng(raw, 2, 2);
  assert(packed.width === 4, "Expected packed splat PNG width to double so alpha can be stored opaquely.");
  assert(packed.height === 2, "Expected packed splat PNG height to match the original splat height.");
  for (let offset = 3; offset < packed.bytes.length; offset += 4) {
    assert(packed.bytes[offset] === 255, "Expected every packed splat PNG texel alpha to stay opaque.");
  }
  const unpacked = unpackOpaquePngToRawSplatChunk(packed.bytes, packed.width, packed.height, [2, 2]);

  assert(unpacked.length === raw.length, "Expected unpacked splat bytes to preserve rgba byte length.");
  for (let index = 0; index < raw.length; index += 1) {
    assert(unpacked[index] === raw[index], `Expected packed splat byte ${index} to round-trip exactly.`);
  }
}

function run(): void {
  testAllZeroPersistedChunksAreRejected();
  testBakeOrientationUsesMeshTextureUvSpace();
  testOpaquePngPackingRoundTripsRawSplatBytes();
}

run();
console.log("EditorTerrainTexturePersistence tests passed");
