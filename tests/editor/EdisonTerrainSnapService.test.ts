import type { Matrix } from "@babylonjs/core";
import { TerrainHeightField } from "../../src/core/world/terrain/TerrainHeightField";
import { TerrainHeightFieldSerializer } from "../../src/core/world/terrain/TerrainHeightFieldSerializer";
import type { SceneDescriptor, SceneGeneratedTerrainDescriptor, SceneObjectDescriptor } from "../../src/core/world/scene/SceneDescriptor";
import { EdisonEventBus } from "../../src/edison/core/EdisonEventBus";
import {
  EdisonTerrainSnapService,
  isTerrainSnapObject,
  type EdisonTerrainSnapObjectRecord,
  type EdisonTerrainSnapObjectRegistry,
  type EdisonTerrainSnapScene,
  type EdisonTerrainSnapTerrain,
  type EdisonTerrainSnapViewport
} from "../../src/edison/core/EdisonTerrainSnapService";

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

const terrainDescriptor = {
  id: "terrain",
  kind: "generated",
  size: [20, 20],
  resolution: [5, 5],
  generator: {
    preset: "flat",
    seed: 1,
    height: {
      base: 0,
      amplitude: 0,
      frequency: 1,
      octaves: 1,
      persistence: 0.5,
      lacunarity: 2
    }
  }
} as const satisfies SceneGeneratedTerrainDescriptor;

const building: SceneObjectDescriptor = {
  id: "building-001",
  type: "building",
  asset: "assets/models/buildings/building.glb",
  position: [0, 4, 0],
  rotation: [0, 0, 0],
  scale: [1, 1, 1]
};

const prop: SceneObjectDescriptor = {
  id: "prop-001",
  type: "model",
  asset: "assets/models/props/prop.glb",
  position: [0, 0, 0],
  rotation: [0, 0, 0],
  scale: [1, 1, 1]
};

function createHarness(): {
  readonly service: EdisonTerrainSnapService;
  readonly fieldAt: (index: number) => number;
  readonly setObjectMinX: (value: number) => void;
  readonly setObjectMinY: (value: number) => void;
  readonly getLastMarkDirty: () => boolean | null;
  readonly getLastEnabled: () => boolean | null;
} {
  let objectMinX = 0;
  let objectMinY = 4;
  let currentField = TerrainHeightField.createFilled(20, 20, 5, 5, 0);
  let currentDescriptor: SceneDescriptor = {
    schemaVersion: 2,
    id: "scene",
    terrain: terrainDescriptor,
    objects: [building, prop]
  };
  let lastMarkDirty: boolean | null = null;
  let lastEnabled: boolean | null = null;
  const identityMatrix = {
    m: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1],
    clone: () => identityMatrix,
    invert: () => identityMatrix
  } as unknown as Matrix;
  const root = { computeWorldMatrix: () => identityMatrix };
  const mesh = {
    isDisposed: () => false,
    isEnabled: () => true,
    computeWorldMatrix: () => identityMatrix,
    getBoundingInfo: () => ({
      boundingBox: {
        minimumWorld: { x: objectMinX - 2, y: objectMinY, z: -2 },
        maximumWorld: { x: objectMinX + 2, y: objectMinY + 5, z: 2 }
      }
    })
  };
  const record = {
    renderableMeshes: [mesh]
  } satisfies EdisonTerrainSnapObjectRecord;
  const terrainContent: EdisonTerrainSnapTerrain = {
    root,
    descriptor: terrainDescriptor,
    heightField: currentField
  };
  const content = {};
  const scene = {
    getDescriptor: () => currentDescriptor,
    setTerrain: (nextTerrain: SceneGeneratedTerrainDescriptor, _message: string, markDirty = true) => {
      lastMarkDirty = markDirty;
      currentDescriptor = { ...currentDescriptor, terrain: nextTerrain };
      return currentDescriptor;
    }
  } satisfies EdisonTerrainSnapScene;
  const objects = {
    getContent: () => content,
    getTerrain: () => ({ ...terrainContent, heightField: currentField }),
    getObject: (objectId: string) => objectId === building.id ? record : null
  } satisfies EdisonTerrainSnapObjectRegistry;
  const viewport = {
    replaceTerrain: async (descriptor: SceneDescriptor) => {
      const nextField = new TerrainHeightFieldSerializer().deserialize(descriptor.terrain as SceneGeneratedTerrainDescriptor);
      if (nextField) {
        currentField = nextField;
      }
    }
  } satisfies EdisonTerrainSnapViewport;

  const events = new EdisonEventBus();
  events.on<{ enabled: boolean }>("edison.terrainSnap.changed", ({ enabled }) => {
    lastEnabled = enabled;
  });

  return {
    service: new EdisonTerrainSnapService(scene, objects, viewport, events),
    fieldAt: (index) => currentField.heights[index] ?? 0,
    setObjectMinX: (value) => {
      objectMinX = value;
    },
    setObjectMinY: (value) => {
      objectMinY = value;
    },
    getLastMarkDirty: () => lastMarkDirty,
    getLastEnabled: () => lastEnabled
  };
}

async function testBuildingHeightFollowsTerrain(): Promise<void> {
  const harness = createHarness();
  await harness.service.refreshAll({ markDirty: false });
  assert(harness.fieldAt(12) === 4, "Expected the building footprint to use its world-space base height.");
  assert(harness.getLastMarkDirty() === false, "Expected an explicitly non-dirty terrain refresh to preserve document state.");

  harness.setObjectMinY(7);
  await harness.service.refreshAll();
  assert(harness.fieldAt(12) === 7, "Expected terrain to follow a building moved upward on Y.");

  harness.setObjectMinX(8);
  await harness.service.refreshAll();
  assert(harness.fieldAt(11) === 0, "Expected terrain to restore the old footprint after the building moved.");
  assert(harness.fieldAt(13) === 7, "Expected terrain to follow the building at its new footprint.");
}

async function testDisabledSnapDoesNotChangeTerrain(): Promise<void> {
  const harness = createHarness();
  harness.service.setEnabled(false);
  await harness.service.refreshAll();
  assert(harness.fieldAt(12) === 0, "Expected disabled terrain snap to leave terrain unchanged.");
  assert(harness.getLastEnabled() === false, "Expected disabling terrain snap to emit its state.");
}

function testEligibleObjectTypes(): void {
  assert(isTerrainSnapObject(building), "Expected buildings to participate in terrain snap.");
  assert(isTerrainSnapObject({ type: "connected-object", connected: { groupId: "road", presetId: "road" } }), "Expected connected roads to participate in terrain snap.");
  assert(!isTerrainSnapObject(prop), "Expected unrelated model props to remain outside terrain snap.");
}

async function run(): Promise<void> {
  await testBuildingHeightFollowsTerrain();
  await testDisabledSnapDoesNotChangeTerrain();
  testEligibleObjectTypes();
  console.log("EdisonTerrainSnapService tests passed");
}

void run();
