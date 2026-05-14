import { parseSceneDescriptor } from "../../../src/core/world/scene/SceneDescriptor";
import { TerrainHeightFieldSerializer } from "../../../src/core/world/terrain/editing/TerrainHeightSerialization";
import { TerrainHeightField } from "../../../src/core/world/terrain/TerrainHeightField";

const heightFieldSerializer = new TerrainHeightFieldSerializer();

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

function testSerializationRoundTrip(): void {
  const field = TerrainHeightField.createFilled(8, 8, 5, 5, 2);
  const serialized = heightFieldSerializer.serialize(field);
  const descriptor = parseSceneDescriptor(
    {
      schemaVersion: 2,
      id: "terrain-serialization",
      terrain: {
        id: "terrain-0",
        kind: "generated",
        size: [8, 8],
        resolution: [5, 5],
        generator: {
          preset: "flat-gray",
          seed: 1,
          height: {
            base: 0,
            amplitude: 1,
            frequency: 0.1,
            octaves: 1,
            persistence: 0.5,
            lacunarity: 2
          }
        },
        editedHeightMap: serialized
      },
      objects: []
    },
    "TerrainHeightSerialization test"
  );

  assert(descriptor.terrain?.kind === "generated", "Expected generated terrain descriptor.");
  if (descriptor.terrain?.kind !== "generated") {
    throw new Error("Expected generated terrain descriptor.");
  }
  const rehydrated = heightFieldSerializer.deserialize(descriptor.terrain);
  assert(rehydrated !== null, "Expected edited heightmap to deserialize.");
  assert((rehydrated?.heights[0] ?? 0) === 2, "Expected serialized height data to survive roundtrip.");
}

function run(): void {
  testSerializationRoundTrip();
}

run();
console.log("TerrainHeightSerialization tests passed");
