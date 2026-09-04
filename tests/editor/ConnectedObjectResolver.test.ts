import type { SceneObjectDescriptor } from "../../src/core/world/scene/SceneDescriptor";
import {
  getConnectedConnectionMask,
  resolveConnectedObjectVariant,
  rotateConnectionMask,
  topologyForMask,
  type ConnectedObjectDefinition
} from "../../src/edison/connected/ConnectedObjectResolver";

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

const definition: ConnectedObjectDefinition = {
  id: "road",
  label: "Road",
  groupId: "road",
  tileSize: 1,
  fallbackTopology: "straight",
  variants: [
    { topology: "straight", canonicalMask: 10, asset: "straight.glb" },
    { topology: "corner", canonicalMask: 3, asset: "corner.glb" },
    { topology: "t-junction", canonicalMask: 11, asset: "t.glb" },
    { topology: "cross", canonicalMask: 15, asset: "cross.glb" }
  ]
};

function object(id: string, x: number, z: number): SceneObjectDescriptor {
  return {
    id,
    type: "connected-object",
    asset: "straight.glb",
    position: [x, 0, z],
    rotation: [0, 0, 0],
    scale: [1, 1, 1],
    connected: { groupId: "road", presetId: "road" }
  };
}

function testTopologyMasks(): void {
  const cases = [
    { mask: 0, topology: "isolated" },
    { mask: 1, topology: "end" },
    { mask: 5, topology: "straight" },
    { mask: 3, topology: "corner" },
    { mask: 14, topology: "t-junction" },
    { mask: 15, topology: "cross" }
  ] as const;

  for (const testCase of cases) {
    assert(topologyForMask(testCase.mask) === testCase.topology, `Expected mask ${testCase.mask} to be ${testCase.topology}.`);
  }
}

function testConnectionMaskIgnoresOtherGroups(): void {
  const center = object("center", 0, 0);
  const north = object("north", 0, 1);
  const otherGroup = {
    ...object("other", 1, 0),
    connected: { groupId: "pipe", presetId: "pipe" }
  };
  assert(getConnectedConnectionMask(center, [center, north, otherGroup], definition) === 1, "Expected only the matching north neighbor to connect.");

  const otherPresetInSameGroup = {
    ...object("same-group", 1, 0),
    connected: { groupId: "road", presetId: "stone-road" }
  };
  assert(
    getConnectedConnectionMask(center, [center, north, otherPresetInSameGroup], definition) === 3,
    "Expected presets in the same compatibility group to connect."
  );
}

function testResolverUsesCanonicalOrientations(): void {
  const center = object("center", 0, 0);
  const neighbors = [object("north", 0, 1), object("south", 0, -1)];
  const straightMask = getConnectedConnectionMask(center, [center, ...neighbors], definition);
  const straight = resolveConnectedObjectVariant(definition, straightMask);
  assert(straight.asset === "straight.glb" && straight.quarterTurns === 1 && straight.exact, "Expected north/south straight to rotate from the west/east asset.");

  const eastEnd = resolveConnectedObjectVariant(definition, 2);
  assert(eastEnd.asset === "straight.glb" && eastEnd.quarterTurns === 0 && !eastEnd.exact, "Expected an east end to keep the west/east straight orientation.");

  const northEnd = resolveConnectedObjectVariant(definition, 1);
  assert(northEnd.asset === "straight.glb" && northEnd.quarterTurns === 1 && !northEnd.exact, "Expected a north end to rotate the straight asset once.");

  const corner = resolveConnectedObjectVariant(definition, 6);
  assert(corner.asset === "corner.glb" && corner.quarterTurns === 1 && corner.exact, "Expected the -Z/+X corner to rotate once.");

  const tJunction = resolveConnectedObjectVariant(definition, 13);
  assert(tJunction.asset === "t.glb" && tJunction.quarterTurns === 3 && tJunction.exact, "Expected south/west/north T-junction to rotate three times.");

  const cross = resolveConnectedObjectVariant(definition, 15);
  assert(cross.asset === "cross.glb" && cross.quarterTurns === 0 && cross.exact, "Expected cross to use the canonical asset.");
}

function testResolverCoversAllCornerAndTJunctionOrientations(): void {
  const cornerCases = [
    { mask: 3, quarterTurns: 0 },
    { mask: 6, quarterTurns: 1 },
    { mask: 12, quarterTurns: 2 },
    { mask: 9, quarterTurns: 3 }
  ] as const;
  for (const testCase of cornerCases) {
    const resolved = resolveConnectedObjectVariant(definition, testCase.mask);
    assert(
      resolved.topology === "corner" && resolved.quarterTurns === testCase.quarterTurns && resolved.exact,
      `Expected corner mask ${testCase.mask} to rotate ${testCase.quarterTurns} times.`
    );
  }

  const tJunctionCases = [
    { mask: 11, quarterTurns: 0 },
    { mask: 7, quarterTurns: 1 },
    { mask: 14, quarterTurns: 2 },
    { mask: 13, quarterTurns: 3 }
  ] as const;
  for (const testCase of tJunctionCases) {
    const resolved = resolveConnectedObjectVariant(definition, testCase.mask);
    assert(
      resolved.topology === "t-junction" && resolved.quarterTurns === testCase.quarterTurns && resolved.exact,
      `Expected T-junction mask ${testCase.mask} to rotate ${testCase.quarterTurns} times.`
    );
  }
}

function testMaskRotation(): void {
  assert(rotateConnectionMask(10, 1) === 5, "Expected east/west to rotate to north/south.");
  assert(rotateConnectionMask(3, 2) === 12, "Expected north/east to rotate to south/west.");
}

function run(): void {
  testTopologyMasks();
  testConnectionMaskIgnoresOtherGroups();
  testResolverUsesCanonicalOrientations();
  testResolverCoversAllCornerAndTJunctionOrientations();
  testMaskRotation();
}

run();
console.log("ConnectedObjectResolver tests passed");
