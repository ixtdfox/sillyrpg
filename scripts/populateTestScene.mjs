import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SCENE_PATH = path.join(PROJECT_ROOT, "assets/data/scenes/port-main/0_0.json");
const GENERATED_ID_PREFIXES = ["interior-furnished-", "street-livedin-"];
const GLB_JSON_CHUNK_TYPE = 0x4e4f534a;
const PI = Math.PI;
const HALF_PI = PI / 2;
const navigationContractByAsset = new Map();
const LARGE_FURNITURE_ROLES = new Set([
  "bathtub",
  "bed",
  "bunk-bed",
  "couch",
  "dining-table",
  "drawer",
  "fridge",
  "meeting-table",
  "shelf",
  "sink",
  "table",
  "washing-machine"
]);
const DECOR_FURNITURE_ROLES = new Set(["ceiling-light", "rug", "table-light"]);

const variantLayouts = {
  "Showcase_01_Villa.glb": {
    ceilingY: 3,
    floors: [
      { y: 0, anchors: [[2, -6], [7, -1.5], [11.5, -6]] },
      { y: 3.1, anchors: [[2, -6], [7, -1.5], [11.5, -6]] }
    ]
  },
  "Showcase_02_L_Courtyard.glb": {
    ceilingY: 3.25,
    floors: [
      { y: 0, anchors: [[14, -5.5], [2.5, -5], [13.5, -1]] },
      { y: 3.35, anchors: [[14, -4.5], [4, -8], [4.5, -3]] },
      { y: 6.7, anchors: [[14.5, -4.5], [10, -5], [3.5, -7]] }
    ]
  },
  "Showcase_03_U_Courtyard.glb": {
    ceilingY: 3.5,
    floors: [
      { y: 0, anchors: [[14.5, -7.5], [2, -1.5], [6, -7.5]] },
      { y: 3.6, anchors: [[13, -7], [0, -1.5], [4, -7.5]] }
    ]
  },
  "Showcase_04_H_Office.glb": {
    ceilingY: 3,
    floors: [
      { y: 0, anchors: [[2, -2], [2, -8.5], [15, -8.5]] },
      { y: 3.1, anchors: [[15, -8.5], [2, -1], [15, -1]] },
      { y: 6.2, anchors: [[2, -8.5], [10.5, -4.5], [2, -1]] },
      { y: 9.3, anchors: [[2, -1.5], [6, -4.5], [15, -8.5]] }
    ]
  },
  "Showcase_05_T_Townhouse.glb": {
    ceilingY: 3,
    floors: [
      { y: 0, anchors: [[8, -2], [2, -7.5], [7.5, -7]] },
      { y: 3.1, anchors: [[1, -7.5], [12, -7.5], [5, -4.5]] },
      { y: 6.2, anchors: [[6, -8], [12, -8.5], [6.5, -3]] }
    ]
  },
  "Showcase_06_Courdoner_Estate.glb": {
    ceilingY: 3.25,
    floors: [
      { y: 0, anchors: [[16.5, -2], [11, -6], [16, -10]] },
      { y: 3.35, anchors: [[16, -7.5], [1.5, -3.5], [11, -8]] }
    ]
  }
};

const assets = {
  beds: [
    "Bed King/Bed_King.glb",
    "Bed Single/Bed_Single.glb",
    "Bunk Bed/Bed_Bunk.glb"
  ],
  chairs: ["Chair/Chair_1.glb", "Chair/Chair_4.glb"],
  couches: [
    "Couch Small/Couch_Small1.glb",
    "Couch Small/Couch_Small2.glb",
    "Couch Medium/Couch_Medium1.glb",
    "Couch Medium/Couch_Medium2.glb",
    "Couch Large/Couch_Large1.glb",
    "L Couch/Couch_L.glb"
  ],
  drawers: [
    "Drawer/Drawer_1.glb",
    "Drawer/Drawer_2.glb",
    "Drawer/Drawer_3.glb",
    "Drawer/Drawer_4.glb",
    "Drawer/Drawer_5.glb"
  ],
  nightStands: [
    "Night Stand/NightStand_1.glb",
    "Night Stand/NightStand_2.glb",
    "Night Stand-7cobkfclNv/NightStand_3.glb"
  ],
  plants: [
    "Cactus/Houseplant_3.glb",
    "Dead Houseplant/Houseplant_8.glb",
    "Houseplant/Houseplant_4.glb",
    "Houseplant/Houseplant_7.glb",
    "Houseplant-IBLX2Jz90O/Houseplant_5.glb",
    "Houseplant-Kr4kr7OCCQ/Houseplant_2.glb",
    "Houseplant-dveIJ0xNpX/Houseplant_6.glb",
    "Houseplant-f6GPjbEgg0/Houseplant_1.glb"
  ],
  rugs: ["Round Rug/Carpet_Round.glb", "Rug/Carpet_1.glb"],
  smallTables: [
    "Table Round Small/Table_RoundSmall.glb",
    "Table Round Small/Table_RoundSmall2.glb"
  ],
  shelves: [
    "Shelf Large/Shelf_Large.glb",
    "Shelf Small/Shelf_Small1.glb",
    "Shelf Small/Shelf_Small2.glb"
  ],
  bins: [
    "Trashcan/Trashcan_Cylindric.glb",
    "Trashcan Large/Trashcan_Large.glb",
    "Trashcan Small/Trashcan_Small1.glb",
    "Trashcan Small/Trashcan_Small2.glb",
    "Trashcan-XSwahu252t/Trashcan_Green.glb"
  ],
  ceilingLights: [
    "Ceiling Light/Light_Ceiling2.glb",
    "Light Ceiling/Light_Ceiling1.glb",
    "Light Ceiling Single/Light_CeilingSingle.glb",
    "Light Ceiling-NNlnaiDJIh/Light_Ceiling4.glb",
    "Light Ceiling-ToOLJDO5FI/Light_Ceiling3.glb",
    "Light Chandelier/Light_Chandelier.glb"
  ],
  tableLights: [
    "Lamp/Light_Floor2.glb",
    "Light Desk/Light_Desk.glb",
    "Table Lamp/Light_Floor4.glb"
  ]
};

function pick(items, seed) {
  return items[((seed % items.length) + items.length) % items.length];
}

function item(role, asset, anchor, dx = 0, dz = 0, yaw = 0, yOffset = 0, scale = 0.5) {
  return { role, asset, anchor, dx, dz, yaw, yOffset, scale };
}

const themes = [
  (seed, ceilingY) => [
    item("couch", pick(assets.couches, seed), 0, 0, 0, seed % 2 ? HALF_PI : 0),
    item("rug", pick(assets.rugs, seed), 0, 0.35, 0.55, 0, 0.025),
    item("table", pick(assets.smallTables, seed), 0, 1.1, 0.65),
    item("chair", pick(assets.chairs, seed), 1, 0, 0, PI),
    item("plant", pick(assets.plants, seed), 2),
    item("ceiling-light", pick(assets.ceilingLights, seed), 0, 0, 0, 0, ceilingY)
  ],
  (seed, ceilingY) => [
    item("bed", pick(assets.beds, seed), 0, 0, 0, seed % 2 ? HALF_PI : 0),
    item("night-stand", pick(assets.nightStands, seed), 0, 1.15, 0.65),
    item("drawer", pick(assets.drawers, seed), 1, 0, 0, PI),
    item("rug", pick(assets.rugs, seed + 1), 0, 0.3, 0.3, 0, 0.025),
    item("table-light", pick(assets.tableLights, seed), 0, 1.15, 0.65, 0, 0.48),
    item("ceiling-light", pick(assets.ceilingLights, seed + 1), 2, 0, 0, 0, ceilingY)
  ],
  (seed, ceilingY) => [
    item("dining-table", "Table Round Large/Table_RoundLarge.glb", 0, 0, 0, seed % 2 ? HALF_PI : 0),
    item("chair-a", pick(assets.chairs, seed), 0, -1.15, 0, HALF_PI),
    item("chair-b", pick(assets.chairs, seed + 1), 0, 1.15, 0, -HALF_PI),
    item("fridge", "Kitchen Fridge/Kitchen_Fridge.glb", 1, 0, 0, PI),
    item("sink", "Kitchen Sink/Kitchen_Sink.glb", 2, 0, 0, PI),
    item("ceiling-light", pick(assets.ceilingLights, seed + 2), 0, 0, 0, 0, ceilingY)
  ],
  (seed, ceilingY) => [
    item("meeting-table", "Table Round Large/Table_RoundLarge.glb", 0, 0, 0, seed % 2 ? HALF_PI : 0),
    item("chair-a", pick(assets.chairs, seed), 0, -1.15, 0, HALF_PI),
    item("chair-b", pick(assets.chairs, seed + 1), 0, 1.15, 0, -HALF_PI),
    item("shelf", pick(assets.shelves, seed), 1, 0, 0, PI),
    item("plant", pick(assets.plants, seed + 2), 2),
    item("ceiling-light", pick(assets.ceilingLights, seed + 3), 0, 0, 0, 0, ceilingY)
  ],
  (seed, ceilingY) => [
    item("bathtub", "Bathtub/Bathroom_Bathtub.glb", 0, 0, 0, seed % 2 ? HALF_PI : 0),
    item("toilet", "Toilet/Bathroom_Toilet.glb", 1, -0.55, 0, PI),
    item("sink", "Bathroom Sink/Bathroom_Sink.glb", 1, 0.75, 0, PI),
    item("washing-machine", "Washing Machine/Bathroom_WashingMachine.glb", 2, -0.55, 0, PI),
    item("trashcan", pick(assets.bins, seed), 2, 0.75, 0),
    item("ceiling-light", pick(assets.ceilingLights, seed + 4), 0, 0, 0, 0, ceilingY)
  ],
  (seed, ceilingY) => [
    item("bunk-bed", "Bunk Bed/Bed_Bunk.glb", 0, 0, 0, seed % 2 ? HALF_PI : 0),
    item("stool", "Stool/Stool.glb", 1, -0.55, 0),
    item("shelf", pick(assets.shelves, seed + 1), 1, 0.75, 0, PI),
    item("rug", pick(assets.rugs, seed), 0, 0.3, 0.35, 0, 0.025),
    item("drawer", pick(assets.drawers, seed + 1), 2, 0, 0, PI),
    item("ceiling-light", pick(assets.ceilingLights, seed + 5), 0, 0, 0, 0, ceilingY)
  ]
];

function transformLocalToWorld(building, localX, localY, localZ) {
  const yaw = building.rotation?.[1] ?? 0;
  const cos = Math.cos(yaw);
  const sin = Math.sin(yaw);
  return [
    round(building.position[0] + cos * localX + sin * localZ),
    round(building.position[1] + localY),
    round(building.position[2] - sin * localX + cos * localZ)
  ];
}

function transformNavigationPointToWorld(building, contract, localX, localY, localZ) {
  const transformed = transformNodePoint(contract.sourceNode, localX, localY, localZ);
  return transformLocalToWorld(building, -transformed[0], transformed[1], transformed[2]);
}

function transformNodePoint(node, x, y, z) {
  if (Array.isArray(node.matrix) && node.matrix.length === 16) {
    const matrix = node.matrix;
    return [
      matrix[0] * x + matrix[4] * y + matrix[8] * z + matrix[12],
      matrix[1] * x + matrix[5] * y + matrix[9] * z + matrix[13],
      matrix[2] * x + matrix[6] * y + matrix[10] * z + matrix[14]
    ];
  }

  const scale = Array.isArray(node.scale) ? node.scale : [1, 1, 1];
  const rotation = Array.isArray(node.rotation) ? node.rotation : [0, 0, 0, 1];
  const translation = Array.isArray(node.translation) ? node.translation : [0, 0, 0];
  const rotated = rotateByQuaternion(x * scale[0], y * scale[1], z * scale[2], rotation);
  return [
    rotated[0] + translation[0],
    rotated[1] + translation[1],
    rotated[2] + translation[2]
  ];
}

function rotateByQuaternion(x, y, z, quaternion) {
  const qx = quaternion[0];
  const qy = quaternion[1];
  const qz = quaternion[2];
  const qw = quaternion[3];
  const ix = qw * x + qy * z - qz * y;
  const iy = qw * y + qz * x - qx * z;
  const iz = qw * z + qx * y - qy * x;
  const iw = -qx * x - qy * y - qz * z;
  return [
    ix * qw + iw * -qx + iy * -qz - iz * -qy,
    iy * qw + iw * -qy + iz * -qx - ix * -qz,
    iz * qw + iw * -qz + ix * -qy - iy * -qx
  ];
}

function round(value) {
  return Math.round(value * 1000) / 1000;
}

function slug(value) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function createInteriorObjects(buildings) {
  const objects = [];
  let globalFloorIndex = 0;
  validateNavigationTransformProbes(buildings);

  buildings.forEach((building, buildingIndex) => {
    const assetName = path.posix.basename(building.asset);
    const layout = variantLayouts[assetName];
    if (!layout) {
      throw new Error(`Missing furnishing layout for ${building.asset}`);
    }
    const contract = readNavigationContract(building.asset);

    layout.floors.forEach((floor, floorIndex) => {
      const story = contract?.stories.find((candidate) => candidate.story_index === floorIndex) ?? null;
      const anchors = story ? resolveFloorAnchors(contract, story, 3) : floor.anchors;
      const occupiedCells = new Set();
      const themeIndex = (buildingIndex * 2 + floorIndex) % themes.length;
      const seed = buildingIndex * 7 + floorIndex * 3;
      const floorItems = themes[themeIndex](seed, layout.ceilingY);
      floorItems.forEach((floorItem, itemIndex) => {
        const anchor = anchors[floorItem.anchor];
        if (!anchor) {
          throw new Error(`Missing anchor ${floorItem.anchor} for ${building.id} floor ${floorIndex + 1}`);
        }
        const snappedLocal = story
          ? snapLocalPointToWalkableCellCenter(contract, story, anchor[0] + floorItem.dx, anchor[1] + floorItem.dz, occupiedCells, floorItem.role)
          : { x: anchor[0] + floorItem.dx, z: anchor[1] + floorItem.dz };
        if (story && snappedLocal.cell) {
          occupiedCells.add(cellKey(snappedLocal.cell));
        }
        const objectYaw = round(((building.rotation?.[1] ?? 0) + floorItem.yaw) % (PI * 2));
        objects.push({
          id: `interior-furnished-${slug(building.id)}-f${floorIndex + 1}-${slug(floorItem.role)}-${itemIndex + 1}`,
          type: "interior",
          asset: `assets/models/interior/${floorItem.asset}`,
          interiorBuildingId: building.id,
          interiorStoryIndex: floorIndex,
          position: story
            ? transformNavigationPointToWorld(building, contract, snappedLocal.x, story.story_y_m + floorItem.yOffset, snappedLocal.z)
            : transformLocalToWorld(building, snappedLocal.x, floor.y + floorItem.yOffset, snappedLocal.z),
          rotation: [0, objectYaw, 0],
          scale: [floorItem.scale, floorItem.scale, floorItem.scale]
        });
      });
      globalFloorIndex += 1;
    });
  });

  if (globalFloorIndex !== 39 || objects.length !== 234) {
    throw new Error(`Expected 39 furnished floors and 234 objects, got ${globalFloorIndex} and ${objects.length}.`);
  }
  validateGeneratedInteriorObjects(buildings, objects);
  return objects;
}

function validateNavigationTransformProbes(buildings) {
  const probes = [
    { buildingId: "building-silent-1-001", expected: [-17.5, 0, -20.5] },
    { buildingId: "building-silent-2-001", expected: [-5.5, 0, 28.5] },
    { buildingId: "building-silent-3-003", expected: [75.5, 0, 37.5] }
  ];

  for (const probe of probes) {
    const building = buildings.find((candidate) => candidate.id === probe.buildingId);
    const contract = building ? readNavigationContract(building.asset) : null;
    const story = contract?.stories[0];
    const cell = story?.walkable_cells[0];
    if (!building || !contract || !story || !cell) {
      throw new Error(`Missing navigation transform probe source for ${probe.buildingId}.`);
    }

    const center = cellCenter(contract, cell);
    const actual = transformNavigationPointToWorld(building, contract, center[0], story.story_y_m, center[1]);
    const distance = Math.hypot(actual[0] - probe.expected[0], actual[1] - probe.expected[1], actual[2] - probe.expected[2]);
    if (distance > 0.001) {
      throw new Error(`Navigation transform mismatch for ${probe.buildingId}: expected ${probe.expected.join(",")}, got ${actual.join(",")}.`);
    }
  }
}

function validateGeneratedInteriorObjects(buildings, objects) {
  const buildingsById = new Map(buildings.map((building) => [building.id, building]));
  for (const object of objects) {
    const building = buildingsById.get(object.interiorBuildingId);
    const contract = building ? readNavigationContract(building.asset) : null;
    const floorNumber = Number(object.id.match(/-f(\d+)-/)?.[1]);
    const story = Number.isFinite(floorNumber)
      ? contract?.stories.find((candidate) => candidate.story_index === floorNumber - 1)
      : null;
    if (!building || !contract || !story) {
      throw new Error(`Unable to validate generated interior object ${object.id}.`);
    }
    if (object.interiorStoryIndex !== story.story_index) {
      throw new Error(`Generated interior object ${object.id} has stale interiorStoryIndex ${object.interiorStoryIndex}; expected ${story.story_index}.`);
    }

    const nearest = findNearestStoryCellCenter(building, contract, story, object.position);
    const distance = nearest?.distance ?? Number.POSITIVE_INFINITY;
    if (distance > 0.01) {
      throw new Error(`Generated interior object ${object.id} is not on a walkable cell center: distance=${distance.toFixed(3)}.`);
    }
    if (nearest && isDoorReservedCell(story, nearest.cell)) {
      throw new Error(`Generated interior object ${object.id} blocks a door cell ${cellKey(nearest.cell)}.`);
    }
  }
}

function findNearestStoryCellCenter(building, contract, story, position) {
  let bestMatch = null;
  for (const cell of story.walkable_cells ?? []) {
    const center = cellCenter(contract, cell);
    const world = transformNavigationPointToWorld(building, contract, center[0], story.story_y_m, center[1]);
    const distance = Math.hypot(world[0] - position[0], world[2] - position[2]);
    if (!bestMatch || distance < bestMatch.distance) {
      bestMatch = { cell, distance };
    }
  }

  return bestMatch;
}

function readNavigationContract(asset) {
  if (navigationContractByAsset.has(asset)) {
    return navigationContractByAsset.get(asset);
  }

  const json = readGlbJson(path.join(PROJECT_ROOT, asset));
  let contract = null;
  for (const node of json.nodes ?? []) {
    const rawJson = node.extras?.game_navigation_json;
    if (typeof rawJson !== "string") {
      continue;
    }

    const parsed = JSON.parse(rawJson);
    contract = {
      sourceNode: node,
      tile_size_m: typeof parsed.tile_size_m === "number" ? parsed.tile_size_m : 1,
      origin: parsed.origin ?? { x: 0, z: 0 },
      stories: Array.isArray(parsed.stories) ? parsed.stories : []
    };
    break;
  }

  navigationContractByAsset.set(asset, contract);
  return contract;
}

function readGlbJson(assetPath) {
  const buffer = readFileSync(assetPath);
  if (buffer.toString("utf8", 0, 4) !== "glTF") {
    throw new Error(`Expected GLB asset: ${assetPath}`);
  }

  let offset = 12;
  while (offset < buffer.length) {
    const chunkLength = buffer.readUInt32LE(offset);
    const chunkType = buffer.readUInt32LE(offset + 4);
    offset += 8;
    if (chunkType === GLB_JSON_CHUNK_TYPE) {
      return JSON.parse(buffer.toString("utf8", offset, offset + chunkLength));
    }
    offset += chunkLength;
  }

  throw new Error(`Missing JSON chunk in GLB asset: ${assetPath}`);
}

function resolveFloorAnchors(contract, story, count) {
  const components = resolveWalkableComponents(story);
  const selectedCells = [];
  const primaryCells = [...components].sort((left, right) => right.length - left.length)[0] ?? story.walkable_cells;

  selectedCells.push(selectBestAnchorCell(story, primaryCells, selectedCells));

  while (selectedCells.length < count) {
    selectedCells.push(selectNextAnchorCell(story, primaryCells, selectedCells));
  }

  return selectedCells.map((cell) => cellCenter(contract, cell));
}

function resolveWalkableComponents(story) {
  const cells = Array.isArray(story.walkable_cells) ? story.walkable_cells : [];
  const cellByKey = new Map(cells.map((cell) => [cellKey(cell), cell]));
  const blockedEdges = resolveBlockedEdges(story);
  const visited = new Set();
  const components = [];

  for (const cell of cells) {
    const key = cellKey(cell);
    if (visited.has(key)) {
      continue;
    }

    const component = [];
    const queue = [cell];
    visited.add(key);
    while (queue.length > 0) {
      const current = queue.shift();
      component.push(current);
      for (const neighbor of cardinalNeighbors(current)) {
        const neighborKey = cellKey(neighbor);
        if (visited.has(neighborKey) || !cellByKey.has(neighborKey) || blockedEdges.has(edgeKey(current, neighbor))) {
          continue;
        }
        visited.add(neighborKey);
        queue.push(cellByKey.get(neighborKey));
      }
    }
    components.push(component);
  }

  return components;
}

function resolveBlockedEdges(story) {
  const doorEdges = new Set((story.door_edges ?? []).map((edge) => edgeKey(edge.a, edge.b)));
  return new Set((story.blocked_edges ?? [])
    .map((edge) => edgeKey(edge.a, edge.b))
    .filter((key) => !doorEdges.has(key)));
}

function selectBestAnchorCell(story, cells, selectedCells) {
  const blockedEdges = resolveBlockedEdges(story);
  const cellSet = new Set((story.walkable_cells ?? []).map(cellKey));
  const centroid = cells.reduce((sum, cell) => ({ x: sum.x + cell.x, z: sum.z + cell.z }), { x: 0, z: 0 });
  centroid.x /= Math.max(1, cells.length);
  centroid.z /= Math.max(1, cells.length);

  return [...cells].sort((left, right) => {
    return scoreAnchorCell(right, centroid, selectedCells, cellSet, blockedEdges) -
      scoreAnchorCell(left, centroid, selectedCells, cellSet, blockedEdges);
  })[0];
}

function selectNextAnchorCell(story, cells, selectedCells) {
  const blockedEdges = resolveBlockedEdges(story);
  const cellSet = new Set((story.walkable_cells ?? []).map(cellKey));
  return [...cells].sort((left, right) => {
    return scoreSeparatedAnchorCell(right, selectedCells, cellSet, blockedEdges) -
      scoreSeparatedAnchorCell(left, selectedCells, cellSet, blockedEdges);
  })[0];
}

function scoreAnchorCell(cell, centroid, selectedCells, cellSet, blockedEdges) {
  const openNeighborCount = cardinalNeighbors(cell).filter((neighbor) => {
    return cellSet.has(cellKey(neighbor)) && !blockedEdges.has(edgeKey(cell, neighbor));
  }).length;
  const centroidPenalty = Math.hypot(cell.x - centroid.x, cell.z - centroid.z);
  const separation = selectedCells.length === 0 ? 0 : Math.min(6, distanceToNearestSelectedCell(cell, selectedCells));
  return openNeighborCount * 100 + separation * 5 - centroidPenalty;
}

function scoreSeparatedAnchorCell(cell, selectedCells, cellSet, blockedEdges) {
  const openNeighborCount = cardinalNeighbors(cell).filter((neighbor) => {
    return cellSet.has(cellKey(neighbor)) && !blockedEdges.has(edgeKey(cell, neighbor));
  }).length;
  return openNeighborCount * 100 + Math.min(8, distanceToNearestSelectedCell(cell, selectedCells)) * 8;
}

function distanceToNearestSelectedCell(cell, selectedCells) {
  if (selectedCells.length === 0) {
    return Number.POSITIVE_INFINITY;
  }
  return Math.min(...selectedCells.map((selected) => Math.hypot(cell.x - selected.x, cell.z - selected.z)));
}

function snapLocalPointToWalkableCellCenter(contract, story, x, z, occupiedCells = new Set(), role = "") {
  const footprint = getFurnitureFootprint(role);
  const candidates = (story.walkable_cells ?? []).map((cell) => {
    const center = cellCenter(contract, cell);
    return {
      cell,
      center,
      distanceSq: (center[0] - x) ** 2 + (center[1] - z) ** 2,
      safetyScore: scoreFurnishingCell(story, cell, footprint)
    };
  });

  const best = selectFurnishingCandidate(candidates, (candidate) => {
    return !occupiedCells.has(cellKey(candidate.cell)) && isPreferredFurnishingCell(story, candidate.cell, footprint);
  }) ?? selectFurnishingCandidate(candidates, (candidate) => {
    return !occupiedCells.has(cellKey(candidate.cell)) && !isDoorReservedCell(story, candidate.cell);
  }) ?? selectFurnishingCandidate(candidates, (candidate) => !isDoorReservedCell(story, candidate.cell));

  if (!best) {
    throw new Error(`Story ${story.story_index} has no non-door walkable cells.`);
  }

  return { x: best.center[0], z: best.center[1], cell: best.cell };
}

function selectFurnishingCandidate(candidates, predicate) {
  return candidates
    .filter(predicate)
    .sort((left, right) => left.distanceSq - right.distanceSq || right.safetyScore - left.safetyScore || cellKey(left.cell).localeCompare(cellKey(right.cell)))[0] ?? null;
}

function getFurnitureFootprint(role) {
  if (DECOR_FURNITURE_ROLES.has(role)) {
    return "decor";
  }

  return LARGE_FURNITURE_ROLES.has(role) ? "large" : "small";
}

function isPreferredFurnishingCell(story, cell, footprint) {
  if (isDoorReservedCell(story, cell)) {
    return false;
  }

  const openNeighborCount = countOpenNeighbors(story, cell);
  const doorDistance = distanceToNearestDoorCell(story, cell);
  if (footprint === "large") {
    return openNeighborCount >= 3 && doorDistance >= 2;
  }

  if (footprint === "small") {
    return openNeighborCount >= 2 && doorDistance >= 1;
  }

  return doorDistance >= 1;
}

function scoreFurnishingCell(story, cell, footprint) {
  return countOpenNeighbors(story, cell) * 100 + Math.min(4, distanceToNearestDoorCell(story, cell)) * (footprint === "large" ? 20 : 8);
}

function countOpenNeighbors(story, cell) {
  const cellSet = new Set((story.walkable_cells ?? []).map(cellKey));
  const barrierEdges = resolveBarrierEdges(story);
  return cardinalNeighbors(cell).filter((neighbor) => {
    return cellSet.has(cellKey(neighbor)) && !barrierEdges.has(edgeKey(cell, neighbor));
  }).length;
}

function resolveBarrierEdges(story) {
  return new Set([
    ...(story.blocked_edges ?? []),
    ...(story.door_edges ?? [])
  ].map((edge) => edgeKey(edge.a, edge.b)));
}

function isDoorReservedCell(story, cell) {
  const key = cellKey(cell);
  return (story.door_edges ?? []).some((edge) => cellKey(edge.a) === key || cellKey(edge.b) === key);
}

function distanceToNearestDoorCell(story, cell) {
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const edge of story.door_edges ?? []) {
    bestDistance = Math.min(bestDistance, Math.hypot(edge.a.x - cell.x, edge.a.z - cell.z));
    bestDistance = Math.min(bestDistance, Math.hypot(edge.b.x - cell.x, edge.b.z - cell.z));
  }

  return Number.isFinite(bestDistance) ? bestDistance : 99;
}

function cellCenter(contract, cell) {
  const tileSize = contract.tile_size_m;
  const origin = contract.origin ?? { x: 0, z: 0 };
  return [origin.x + (cell.x + 0.5) * tileSize, origin.z + (cell.z + 0.5) * tileSize];
}

function cardinalNeighbors(cell) {
  return [
    { x: cell.x + 1, z: cell.z },
    { x: cell.x - 1, z: cell.z },
    { x: cell.x, z: cell.z + 1 },
    { x: cell.x, z: cell.z - 1 }
  ];
}

function cellKey(cell) {
  return `${cell.x}:${cell.z}`;
}

function edgeKey(left, right) {
  const leftKey = cellKey(left);
  const rightKey = cellKey(right);
  return leftKey < rightKey ? `${leftKey}|${rightKey}` : `${rightKey}|${leftKey}`;
}

const streetPlan = [];
function street(cluster, asset, x, y, z, yaw, scale) {
  streetPlan.push({ cluster, asset, position: [x, y, z], yaw, scale });
}

street("west-avenue", "Car/NormalCar1.glb", -37.8, 0.115, -20, 0, 1);
street("west-avenue", "Car/NormalCar2.glb", -42.2, 0.149, -7, PI, 1);
street("west-avenue", "Van/1387 Van.glb", -37.8, 0.121, 5, 0, 0.05);
street("west-avenue", "SUV/SUV.glb", -42.2, 0.139, 20, PI, 1);
street("west-avenue", "Sports Car/SportsCar2.glb", -37.8, 0.137, 30, 0, 1);
street("west-avenue", "Tree/tree01.glb", -32.5, 0.321, -34.2, 0.35, 0.0115);
street("west-avenue", "Tree/tree01.glb", -35.6, 0.321, 11, 2.1, 0.0115);
street("west-avenue", "Tree/tree01.glb", -44.4, 0.321, 25, 4.2, 0.0115);
street("west-avenue", "Bench/model.glb", -35.7, 0.86, -11.3, HALF_PI, 0.62);
street("west-avenue", "Trash Can/TrashCan_02.glb", -35.7, 0.79, -14, 0, 0.25);
street("west-avenue", "Fire hydrant/Fire Hydrant.glb", -44.2, 0.321, 13, 0, 0.0045);
street("west-avenue", "Stop sign/1358 Stop Sign.glb", -44.2, 0.321, 33.5, HALF_PI, 0.013);
street("west-avenue", "Mailbox/Mailbox.glb", -35.8, 0.362, 21, PI, 2.8);
street("west-avenue", "Bicycle/Bike.glb", -44.2, 0.322, 3, HALF_PI, 0.5);
street("west-avenue", "Manhole Cover/ManholeCover.glb", -41.4, 0.121, 16.5, 0.2, 1.2);
street("south-service", "Pickup Truck/Vehicle_Pickup.glb", -27, 0.126, -27.8, HALF_PI, 0.9);
street("south-service", "Police Car/Cop.glb", -17, 0.137, -32.2, -HALF_PI, 1);
street("south-service", "Car/NormalCar2.glb", -7, 0.149, -27.8, HALF_PI, 1);
street("south-service", "Dumpster/TrashContainer.glb", -32.3, -0.068, -24, 0, 0.8);
street("south-service", "trah bag grey/model.glb", -33.8, 0.208, -23.6, 0.4, 1.5);
street("south-service", "Box/box_A.glb", -31, -0.1, -23.8, 0.2, 2.5);
street("south-service", "Debris Papers/Debris_Papers_2.glb", -32.5, -0.101, -22.2, -0.3, 0.6);
street("south-service", "Trash Can/TrashCan_02.glb", -29, 0.369, -24, 0, 0.25);
street("south-service", "Cone/Cone.glb", -30, 0.337, -25.8, 0.1, 0.7);
street("south-service", "Power Box/PowerBox.glb", -25, 0.322, -25.8, PI, 1.3);
street("south-roadworks", "Sports Car/SportsCar2.glb", 24, 0.137, -27.8, HALF_PI, 1);
street("south-roadworks", "Car/NormalCar1.glb", 31, 0.115, -32.2, -HALF_PI, 1);
street("south-roadworks", "SUV/SUV.glb", 43, 0.139, -32.2, -HALF_PI, 1);
street("south-roadworks", "Manhole Cover/ManholeCover.glb", 18, 0.121, -31, 0.4, 1.2);
street("south-roadworks", "Cone/Cone.glb", 16.5, 0.137, -31, 0.1, 0.7);
street("south-roadworks", "Cone/Cone.glb", 18, 0.137, -32.5, -0.2, 0.7);
street("south-roadworks", "Cone/Cone.glb", 19.5, 0.137, -31, 0.25, 0.7);
street("south-roadworks", "Tree/tree01.glb", 25, -0.1, -36, 1.4, 0.0115);
street("south-roadworks", "Mailbox/Mailbox.glb", 40, 0.362, -34.2, 0, 2.8);
street("south-roadworks", "Fire hydrant/Fire Hydrant.glb", 31, 0.321, -25.8, 0, 0.0045);
street("south-roadworks", "Stop sign/1358 Stop Sign.glb", 4, 0.321, -25.8, 0, 0.013);
street("south-roadworks", "Bicycle/Bike.glb", 52.5, 0.322, -25.8, 0, 0.5);
street("south-roadworks", "Trash Can/TrashCan_02.glb", 35, 0.79, -34.2, 0, 0.25);
street("east-boulevard", "Car/NormalCar1.glb", 21, 0.115, 7.8, HALF_PI, 1);
street("east-boulevard", "Sports Car-Gzj704DXdr/Vehicle_Sports.glb", 29, 0.13, 12.2, -HALF_PI, 0.8);
street("east-boulevard", "Motorcycle/1388 Motorcycle.glb", 34.5, 0.121, 7.8, HALF_PI, 0.017);
street("transit-stop", "Bus/1376 Bus.glb", 43, 0.121, 11.8, HALF_PI, 0.065);
street("transit-stop", "Bus Stop/BusStop.glb", 42, 1.882, 16.5, 0, 0.1);
street("transit-stop", "Bus stop sign/bussy.glb", 47, 0.353, 14.2, 0, 0.12);
street("transit-stop", "Bench/model.glb", 36, 0.589, 16, 0, 0.62);
street("transit-stop", "Trash Can/TrashCan_02.glb", 38.2, 0.519, 16, 0, 0.25);
street("transit-stop", "Bicycle/Bike.glb", 50, 0.051, 15.7, 0, 0.5);
street("transit-stop", "Animated Woman/Formal.glb", 45, 0.049, 16.4, PI, 0.98);
street("transit-stop", "Animated Woman/Casual.glb", 36.5, 0.058, 17.5, 2.8, 0.98);
street("transit-stop", "Tree/tree01.glb", 31.2, -0.064, 17.5, 0.7, 0.0115);
street("boulevard-commercial", "ATM/ATM.glb", 22, 0.322, 4.2, 0, 3.2);
street("boulevard-commercial", "Planter & Bushes/PlanterAndBushes.glb", 20.2, 0.399, 4.2, 0, 0.75);
street("boulevard-commercial", "Planter & Bushes/PlanterAndBushes.glb", 23.8, 0.399, 4.2, 0, 0.75);
street("boulevard-commercial", "Bench/model.glb", 28, 0.86, 4.2, 0, 0.62);
street("boulevard-commercial", "Trash Can/TrashCan_02.glb", 30.3, 0.79, 4.2, 0, 0.25);
street("boulevard-commercial", "Mailbox/Mailbox.glb", 33, 0.362, 4.2, 0, 2.8);
street("boulevard-commercial", "Tree/tree01.glb", 20, -0.1, 17.5, 2.8, 0.0115);
street("boulevard-commercial", "Fire hydrant/Fire Hydrant.glb", 25, 0.321, 14.2, 0, 0.0045);
street("boulevard-commercial", "Manhole Cover/ManholeCover.glb", 25, 0.121, 10.8, 0.1, 1.2);
street("boulevard-commercial", "Stop sign/1358 Stop Sign.glb", 16.2, 0.321, 14.2, 0, 0.013);
street("southeast-plaza", "Tree/tree01.glb", 32.5, -0.1, -10.5, 0.4, 0.0115);
street("southeast-plaza", "Tree/tree01.glb", 50, 0.05, -14, 2.2, 0.0115);
street("southeast-plaza", "Bench/model.glb", 46, 0.469, -12.25, 0, 0.62);
street("southeast-plaza", "Planter & Bushes/PlanterAndBushes.glb", 42, -0.022, -12, 0, 0.75);
street("southeast-plaza", "Planter & Bushes/PlanterAndBushes.glb", 47, 0.038, -11, 0, 0.75);
street("southeast-plaza", "Flower Pot/FlowerPot4.glb", 39.5, 0.366, -11.5, 0.2, 0.45);
street("southeast-plaza", "Flower Pot/FlowerPot7.glb", 48.75, 0.62, -11.5, -0.4, 0.45);
street("southeast-plaza", "Trash Can/TrashCan_02.glb", 44.5, 0.369, -11.5, 0, 0.25);
street("southeast-plaza", "Bicycle/Bike.glb", 45, -0.099, -8, 0, 0.5);
street("southeast-plaza", "Mailbox/Mailbox.glb", 52.5, 0.091, -8, HALF_PI, 2.8);
street("southeast-plaza", "Adventurer/Adventurer.glb", 40, -0.099, -8, 1.2, 0.97);
street("southeast-plaza", "Power Box/PowerBox.glb", 54, 0.051, -14, HALF_PI, 1.3);
street("northwest-park", "Tree/tree01.glb", -31, 0.05, 20, 0.4, 0.0115);
street("northwest-park", "Tree/tree01.glb", -22, 0.05, 30, 2.2, 0.0115);
street("northwest-park", "Tree/tree01.glb", -13, 0.05, 20, 4.1, 0.0115);
street("northwest-park", "Bench/model.glb", -26, 0.589, 25, 0, 0.62);
street("northwest-park", "Bench/model.glb", -14, 0.589, 29.75, 0, 0.62);
street("northwest-park", "Planter & Bushes/PlanterAndBushes.glb", -26, 0.128, 20, 0, 0.75);
street("northwest-park", "Planter & Bushes/PlanterAndBushes.glb", -17.5, 0.128, 20, 0, 0.75);
street("northwest-park", "Trash Can/TrashCan_02.glb", -26, 0.519, 29, 0, 0.25);
street("northwest-park", "Bicycle/Bike.glb", -16, 0.051, 31, 0, 0.5);
street("northwest-park", "Fire hydrant/Fire Hydrant.glb", -33, 0.05, 29, 0, 0.0045);
street("northwest-park", "Man/Male_Casual.glb", -26.25, 0.049, 23.25, 2.4, 0.37);
street("northwest-park", "Mailbox/Mailbox.glb", -12, 0.091, 29.5, HALF_PI, 2.8);

function createStreetObjects() {
  if (streetPlan.length !== 84) {
    throw new Error(`Expected 84 street objects, got ${streetPlan.length}.`);
  }
  return streetPlan.map((entry, index) => ({
    id: `street-livedin-${slug(entry.cluster)}-${String(index + 1).padStart(3, "0")}`,
    type: "street",
    asset: `assets/models/street/${entry.asset}`,
    position: entry.position,
    rotation: [0, round(entry.yaw), 0],
    scale: [entry.scale, entry.scale, entry.scale]
  }));
}

function validateObjects(objects) {
  const ids = new Set();
  for (const object of objects) {
    if (ids.has(object.id)) {
      throw new Error(`Duplicate scene object id: ${object.id}`);
    }
    ids.add(object.id);
    const assetPath = path.join(PROJECT_ROOT, object.asset);
    if (!existsSync(assetPath)) {
      throw new Error(`Missing scene object asset: ${object.asset}`);
    }
  }
}

const checkOnly = process.argv.includes("--check");
const scene = JSON.parse(readFileSync(SCENE_PATH, "utf8"));
const baseObjects = scene.objects.filter((object) => {
  return !GENERATED_ID_PREFIXES.some((prefix) => object.id.startsWith(prefix));
});
const buildings = baseObjects.filter((object) => object.type === "building");
if (buildings.length !== 15) {
  throw new Error(`Expected 15 test-scene buildings, got ${buildings.length}.`);
}

const generatedObjects = [...createInteriorObjects(buildings), ...createStreetObjects()];
const nextObjects = [...baseObjects, ...generatedObjects];
validateObjects(nextObjects);

if (checkOnly) {
  if (JSON.stringify(scene.objects) !== JSON.stringify(nextObjects)) {
    throw new Error("Test scene population is stale. Run npm run populate:test-scene.");
  }
} else {
  scene.objects = nextObjects;
  writeFileSync(SCENE_PATH, `${JSON.stringify(scene, null, 2)}\n`);
}

console.log(
  `${checkOnly ? "Validated" : "Populated"} test scene with ` +
  `${generatedObjects.filter((object) => object.type === "interior").length} interior and ` +
  `${generatedObjects.filter((object) => object.type === "street").length} street objects.`
);
