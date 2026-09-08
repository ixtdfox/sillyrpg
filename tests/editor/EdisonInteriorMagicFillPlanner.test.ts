import {
  planInteriorMagicFill,
  resolveInteriorMagicFillRooms,
  type EdisonInteriorMagicFillCell,
  type EdisonInteriorMagicFillStory
} from "../../src/edison/core/EdisonInteriorMagicFillPlanner";

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

function createCell(x: number, z: number): EdisonInteriorMagicFillCell {
  return { x, z, worldCenter: [x + 0.5, 0, z + 0.5] };
}

function createFourRoomStory(): EdisonInteriorMagicFillStory {
  const cells: EdisonInteriorMagicFillCell[] = [];
  for (let x = 0; x < 6; x += 1) {
    for (let z = 0; z < 4; z += 1) {
      cells.push(createCell(x, z));
    }
  }

  return {
    storyIndex: 0,
    worldY: 0,
    tileSize: 1,
    cells,
    blockedEdges: [],
    doorEdges: [
      ...[0, 1, 2, 3].map((z) => ({ a: { x: 2, z }, b: { x: 3, z } })),
      ...[0, 1, 2, 3, 4, 5].map((x) => ({ a: { x, z: 1 }, b: { x, z: 2 } }))
    ]
  };
}

function createOneRoomStory(): EdisonInteriorMagicFillStory {
  const cells: EdisonInteriorMagicFillCell[] = [];
  for (let x = 0; x < 3; x += 1) {
    for (let z = 0; z < 3; z += 1) {
      cells.push(createCell(x, z));
    }
  }

  return {
    storyIndex: 0,
    worldY: 0,
    tileSize: 1,
    cells,
    blockedEdges: [],
    doorEdges: []
  };
}

function testDoorsPartitionRooms(): void {
  const rooms = resolveInteriorMagicFillRooms([createFourRoomStory()]);
  assert(rooms.length === 4, `Expected four rooms, got ${rooms.length}.`);
  assert(rooms.every((room) => room.cells.length === 6), "Expected each partitioned room to contain six cells.");
}

function testZoningKeepsBathroomFixturesOutOfDiningRoom(): void {
  const rooms = resolveInteriorMagicFillRooms([createFourRoomStory()]);
  const planned = planInteriorMagicFill({ buildingId: "building-a", rooms, existingObjects: [] });
  const diningObjects = planned.filter((object) => object.zone === "dining");
  const bathroomObjects = planned.filter((object) => object.zone === "bathroom");

  assert(diningObjects.some((object) => object.role === "dining-table"), "Expected dining room to receive a dining table.");
  assert(bathroomObjects.some((object) => object.role === "toilet"), "Expected bathroom to receive a toilet.");
  assert(diningObjects.every((object) => object.role !== "toilet" && !object.asset.includes("Toilet")), "Expected dining room to stay free of bathroom fixtures.");
}

function testExistingObjectsOccupyCells(): void {
  const rooms = resolveInteriorMagicFillRooms([createFourRoomStory()]);
  const planned = planInteriorMagicFill({
    buildingId: "building-a",
    rooms,
    existingObjects: [{ type: "interior", interiorBuildingId: "building-a", position: [0.5, 0, 0.5] }]
  });

  assert(planned.every((object) => object.position[0] !== 0.5 || object.position[2] !== 0.5), "Expected existing furniture cell to stay free.");
}

function testDoorEndpointCellsAreReserved(): void {
  const story = createFourRoomStory();
  const rooms = resolveInteriorMagicFillRooms([story]);
  const planned = planInteriorMagicFill({ buildingId: "building-a", rooms, existingObjects: [] });
  const doorCellPositions = new Set(story.doorEdges.flatMap((edge) => [edge.a, edge.b]).map((cell) => `${cell.x + 0.5}:${cell.z + 0.5}`));

  assert(
    planned.every((object) => !doorCellPositions.has(`${object.position[0]}:${object.position[2]}`)),
    "Expected Magic fill to keep generated furniture out of door endpoint cells."
  );
}

function testWallFurnitureIsInsetTowardRoomInterior(): void {
  const rooms = resolveInteriorMagicFillRooms([createOneRoomStory()]);
  const planned = planInteriorMagicFill({ buildingId: "building-a", rooms, existingObjects: [] });
  const couch = planned.find((object) => object.role === "couch");

  assert(couch !== undefined, "Expected a living room couch to be planned.");
  assert(
    !Number.isInteger((couch?.position[0] ?? 0) - 0.5) || !Number.isInteger((couch?.position[2] ?? 0) - 0.5),
    "Expected wall furniture to be moved inward instead of staying exactly on the wall cell center."
  );
}

testDoorsPartitionRooms();
testZoningKeepsBathroomFixturesOutOfDiningRoom();
testExistingObjectsOccupyCells();
testDoorEndpointCellsAreReserved();
testWallFurnitureIsInsetTowardRoomInterior();
console.log("EdisonInteriorMagicFillPlanner tests passed");
