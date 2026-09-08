export type EdisonInteriorMagicFillZone = "bathroom" | "bedroom" | "dining" | "kitchen" | "living" | "office" | "utility";

export interface EdisonInteriorMagicFillCell {
  readonly x: number;
  readonly z: number;
  readonly worldCenter: readonly [number, number, number];
}

export interface EdisonInteriorMagicFillEdge {
  readonly a: { readonly x: number; readonly z: number };
  readonly b: { readonly x: number; readonly z: number };
}

export interface EdisonInteriorMagicFillStory {
  readonly storyIndex: number;
  readonly worldY: number;
  readonly tileSize: number;
  readonly cells: readonly EdisonInteriorMagicFillCell[];
  readonly blockedEdges: readonly EdisonInteriorMagicFillEdge[];
  readonly doorEdges: readonly EdisonInteriorMagicFillEdge[];
}

export interface EdisonInteriorMagicFillRoom {
  readonly storyIndex: number;
  readonly roomIndex: number;
  readonly worldY: number;
  readonly tileSize: number;
  readonly zone: EdisonInteriorMagicFillZone;
  readonly cells: readonly EdisonInteriorMagicFillCell[];
  readonly doorEdges: readonly EdisonInteriorMagicFillEdge[];
}

export interface EdisonInteriorMagicFillExistingObject {
  readonly type: string;
  readonly interiorBuildingId?: string;
  readonly position: readonly [number, number, number];
}

export interface EdisonInteriorMagicFillPlannedObject {
  readonly role: string;
  readonly zone: EdisonInteriorMagicFillZone;
  readonly storyIndex: number;
  readonly roomIndex: number;
  readonly asset: string;
  readonly position: readonly [number, number, number];
  readonly rotation: readonly [number, number, number];
  readonly scale: readonly [number, number, number];
}

export interface EdisonInteriorMagicFillPlanOptions {
  readonly buildingId: string;
  readonly rooms: readonly EdisonInteriorMagicFillRoom[];
  readonly existingObjects: readonly EdisonInteriorMagicFillExistingObject[];
}

interface RawInteriorRoom {
  readonly storyIndex: number;
  readonly roomIndex: number;
  readonly worldY: number;
  readonly tileSize: number;
  readonly cells: readonly EdisonInteriorMagicFillCell[];
  readonly doorEdges: readonly EdisonInteriorMagicFillEdge[];
}

interface FurnitureRule {
  readonly role: string;
  readonly asset: string;
  readonly placement: "center" | "corner" | "wall";
  readonly minCells?: number;
  readonly yOffset?: number;
  readonly yawOffset?: number;
  readonly scale?: number;
}

const HALF_PI = Math.PI / 2;
const TWO_PI = Math.PI * 2;
const DEFAULT_SCALE = 0.5;
const OCCUPANCY_RADIUS_TILES = 0.72;
const SMALL_WALL_INSET_TILES = 0.18;
const LARGE_WALL_INSET_TILES = 0.28;

const FURNITURE_RULES: Record<EdisonInteriorMagicFillZone, readonly FurnitureRule[]> = {
  bathroom: [
    furniture("bathtub", "Bathtub/Bathroom_Bathtub.glb", "wall", 5),
    furniture("toilet", "Toilet/Bathroom_Toilet.glb", "wall", 2),
    furniture("sink", "Bathroom Sink/Bathroom_Sink.glb", "wall", 3),
    furniture("washing-machine", "Washing Machine/Bathroom_WashingMachine.glb", "wall", 7),
    furniture("trashcan", "Trashcan Small/Trashcan_Small1.glb", "corner", 4),
    furniture("ceiling-light", "Ceiling Light/Light_Ceiling2.glb", "center", 2, 2.7)
  ],
  bedroom: [
    furniture("bed", "Bed Single/Bed_Single.glb", "wall", 3),
    furniture("night-stand", "Night Stand/NightStand_1.glb", "wall", 5),
    furniture("drawer", "Drawer/Drawer_3.glb", "wall", 6),
    furniture("rug", "Rug/Carpet_1.glb", "center", 6, 0.025),
    furniture("table-light", "Light Desk/Light_Desk.glb", "wall", 8, 0.48),
    furniture("ceiling-light", "Light Ceiling/Light_Ceiling1.glb", "center", 3, 2.7)
  ],
  dining: [
    furniture("dining-table", "Table Round Large/Table_RoundLarge.glb", "center", 5),
    furniture("chair-a", "Chair/Chair_1.glb", "wall", 7, 0, HALF_PI),
    furniture("chair-b", "Chair/Chair_4.glb", "wall", 9, 0, -HALF_PI),
    furniture("rug", "Round Rug/Carpet_Round.glb", "center", 8, 0.025),
    furniture("ceiling-light", "Light Chandelier/Light_Chandelier.glb", "center", 5, 2.7)
  ],
  kitchen: [
    furniture("fridge", "Kitchen Fridge/Kitchen_Fridge.glb", "wall", 3),
    furniture("sink", "Kitchen Sink/Kitchen_Sink.glb", "wall", 4),
    furniture("oven", "Oven/Kitchen_Oven_Large.glb", "wall", 8),
    furniture("small-table", "Table Round Small/Table_RoundSmall.glb", "center", 7),
    furniture("ceiling-light", "Light Ceiling Single/Light_CeilingSingle.glb", "center", 3, 2.7)
  ],
  living: [
    furniture("couch", "Couch Medium/Couch_Medium1.glb", "wall", 4),
    furniture("rug", "Rug/Carpet_1.glb", "center", 5, 0.025),
    furniture("coffee-table", "Table Round Small/Table_RoundSmall2.glb", "center", 6),
    furniture("chair", "Chair/Chair_4.glb", "wall", 8, 0, Math.PI),
    furniture("plant", "Houseplant/Houseplant_4.glb", "corner", 4),
    furniture("ceiling-light", "Light Ceiling/Light_Ceiling1.glb", "center", 4, 2.7)
  ],
  office: [
    furniture("work-table", "Table Round Small/Table_RoundSmall.glb", "center", 4),
    furniture("chair", "Chair/Chair_1.glb", "wall", 5, 0, Math.PI),
    furniture("shelf", "Shelf Large/Shelf_Large.glb", "wall", 6),
    furniture("plant", "Houseplant-Kr4kr7OCCQ/Houseplant_2.glb", "corner", 5),
    furniture("ceiling-light", "Ceiling Light/Light_Ceiling2.glb", "center", 3, 2.7)
  ],
  utility: [
    furniture("shelf", "Shelf Small/Shelf_Small1.glb", "wall", 2),
    furniture("trashcan", "Trashcan/Trashcan_Cylindric.glb", "corner", 3),
    furniture("plant", "Cactus/Houseplant_3.glb", "corner", 5),
    furniture("ceiling-light", "Light Ceiling Single/Light_CeilingSingle.glb", "center", 2, 2.7)
  ]
};

export function resolveInteriorMagicFillRooms(
  stories: readonly EdisonInteriorMagicFillStory[]
): readonly EdisonInteriorMagicFillRoom[] {
  const rawRooms = stories.flatMap((story) => partitionStoryRooms(story));
  return assignRoomZones(rawRooms);
}

export function planInteriorMagicFill(
  options: EdisonInteriorMagicFillPlanOptions
): readonly EdisonInteriorMagicFillPlannedObject[] {
  const occupiedCells = resolveOccupiedCells(options.rooms, options.existingObjects, options.buildingId);
  const plannedObjects: EdisonInteriorMagicFillPlannedObject[] = [];

  for (const room of options.rooms) {
    const availableRoomCells = room.cells.filter((cell) => !occupiedCells.has(roomCellKey(room, cell)));
    if (availableRoomCells.length === 0) {
      continue;
    }

    for (const rule of FURNITURE_RULES[room.zone]) {
      if (room.cells.length < (rule.minCells ?? 1)) {
        continue;
      }

      const cell = selectCellForRule(room, availableRoomCells, rule, occupiedCells);
      if (!cell) {
        continue;
      }

      occupiedCells.add(roomCellKey(room, cell));
      const yOffset = rule.yOffset ?? 0;
      const yaw = normalizeYaw(resolveFurnitureYaw(room, cell, rule));
      const scale = rule.scale ?? DEFAULT_SCALE;
      const position = resolveFurniturePosition(room, cell, rule, yOffset);
      plannedObjects.push({
        role: rule.role,
        zone: room.zone,
        storyIndex: room.storyIndex,
        roomIndex: room.roomIndex,
        asset: `assets/models/interior/${rule.asset}`,
        position,
        rotation: [0, yaw, 0],
        scale: [scale, scale, scale]
      });
    }
  }

  return plannedObjects;
}

function furniture(
  role: string,
  asset: string,
  placement: FurnitureRule["placement"],
  minCells = 1,
  yOffset = 0,
  yawOffset = 0,
  scale = DEFAULT_SCALE
): FurnitureRule {
  return { role, asset, placement, minCells, yOffset, yawOffset, scale };
}

function partitionStoryRooms(story: EdisonInteriorMagicFillStory): RawInteriorRoom[] {
  const cellByKey = new Map(story.cells.map((cell) => [cellKey(cell), cell]));
  const barrierEdges = new Set([...story.blockedEdges, ...story.doorEdges].map((edge) => edgeKey(edge.a, edge.b)));
  const visited = new Set<string>();
  const rooms: RawInteriorRoom[] = [];

  for (const cell of story.cells) {
    const startKey = cellKey(cell);
    if (visited.has(startKey)) {
      continue;
    }

    const queue: EdisonInteriorMagicFillCell[] = [cell];
    const component: EdisonInteriorMagicFillCell[] = [];
    visited.add(startKey);

    while (queue.length > 0) {
      const current = queue.shift()!;
      component.push(current);

      for (const neighbor of cardinalNeighbors(current)) {
        const neighborKey = cellKey(neighbor);
        if (visited.has(neighborKey) || !cellByKey.has(neighborKey) || barrierEdges.has(edgeKey(current, neighbor))) {
          continue;
        }
        visited.add(neighborKey);
        queue.push(cellByKey.get(neighborKey)!);
      }
    }

    const componentCellKeys = new Set(component.map((componentCell) => cellKey(componentCell)));
    rooms.push({
      storyIndex: story.storyIndex,
      roomIndex: rooms.length,
      worldY: story.worldY,
      tileSize: story.tileSize,
      cells: component,
      doorEdges: story.doorEdges.filter((edge) => componentCellKeys.has(cellKey(edge.a)) || componentCellKeys.has(cellKey(edge.b)))
    });
  }

  return rooms;
}

function assignRoomZones(rooms: readonly RawInteriorRoom[]): EdisonInteriorMagicFillRoom[] {
  const roomsByStory = new Map<number, RawInteriorRoom[]>();
  for (const room of rooms) {
    roomsByStory.set(room.storyIndex, [...roomsByStory.get(room.storyIndex) ?? [], room]);
  }

  const zonedRooms: EdisonInteriorMagicFillRoom[] = [];
  for (const storyRooms of roomsByStory.values()) {
    const assignments = new Map<number, EdisonInteriorMagicFillZone>();
    const sortedBySize = [...storyRooms].sort((left, right) => right.cells.length - left.cells.length || left.roomIndex - right.roomIndex);
    const sortedSmallFirst = [...storyRooms].sort((left, right) => left.cells.length - right.cells.length || left.roomIndex - right.roomIndex);
    const bathroom = sortedSmallFirst.find((room) => room.cells.length <= 8) ?? (storyRooms.length >= 3 ? sortedSmallFirst[0] : null);
    if (bathroom) {
      assignments.set(bathroom.roomIndex, "bathroom");
    }

    const remaining = sortedBySize.filter((room) => !assignments.has(room.roomIndex));
    const primaryZones = storyRooms[0]?.storyIndex === 0
      ? ["living", "kitchen", "dining", "office", "utility"] as const
      : ["bedroom", "bedroom", "office", "living", "utility"] as const;

    remaining.forEach((room, index) => {
      assignments.set(room.roomIndex, primaryZones[Math.min(index, primaryZones.length - 1)]);
    });

    for (const room of storyRooms) {
      zonedRooms.push({
        ...room,
        zone: assignments.get(room.roomIndex) ?? "utility"
      });
    }
  }

  return zonedRooms.sort((left, right) => left.storyIndex - right.storyIndex || left.roomIndex - right.roomIndex);
}

function resolveOccupiedCells(
  rooms: readonly EdisonInteriorMagicFillRoom[],
  existingObjects: readonly EdisonInteriorMagicFillExistingObject[],
  buildingId: string
): Set<string> {
  const occupiedCells = new Set<string>();
  for (const room of rooms) {
    for (const cell of room.cells) {
      if (isDoorReservedCell(room, cell)) {
        occupiedCells.add(roomCellKey(room, cell));
      }
    }
  }

  for (const object of existingObjects) {
    if (object.type !== "interior" || object.interiorBuildingId !== buildingId) {
      continue;
    }

    const match = findNearestRoomCell(rooms, object.position);
    if (match) {
      occupiedCells.add(roomCellKey(match.room, match.cell));
    }
  }
  return occupiedCells;
}

function findNearestRoomCell(
  rooms: readonly EdisonInteriorMagicFillRoom[],
  position: readonly [number, number, number]
): { readonly room: EdisonInteriorMagicFillRoom; readonly cell: EdisonInteriorMagicFillCell } | null {
  let bestMatch: { readonly room: EdisonInteriorMagicFillRoom; readonly cell: EdisonInteriorMagicFillCell } | null = null;
  let bestDistanceSq = Number.POSITIVE_INFINITY;

  for (const room of rooms) {
    for (const cell of room.cells) {
      if (Math.abs(position[1] - cell.worldCenter[1]) > Math.max(1.1, room.tileSize * 1.1)) {
        continue;
      }

      const distanceSq = (position[0] - cell.worldCenter[0]) ** 2 + (position[2] - cell.worldCenter[2]) ** 2;
      if (distanceSq < bestDistanceSq) {
        bestDistanceSq = distanceSq;
        bestMatch = { room, cell };
      }
    }
  }

  const tileSize = bestMatch?.room.tileSize ?? 1;
  return bestMatch && bestDistanceSq <= (tileSize * OCCUPANCY_RADIUS_TILES) ** 2 ? bestMatch : null;
}

function selectCellForRule(
  room: EdisonInteriorMagicFillRoom,
  availableRoomCells: readonly EdisonInteriorMagicFillCell[],
  rule: FurnitureRule,
  occupiedCells: Set<string>
): EdisonInteriorMagicFillCell | null {
  const availableCells = availableRoomCells.filter((cell) => {
    return !occupiedCells.has(roomCellKey(room, cell)) && satisfiesRuleClearance(room, cell, rule);
  });
  if (availableCells.length === 0) {
    return null;
  }

  const centroid = resolveCentroid(room.cells);
  const scored = availableCells.map((cell) => ({
    cell,
    score: scoreCell(room, cell, centroid, rule.placement)
  }));
  scored.sort((left, right) => right.score - left.score || cellKey(left.cell).localeCompare(cellKey(right.cell)));
  return scored[0]?.cell ?? null;
}

function scoreCell(
  room: EdisonInteriorMagicFillRoom,
  cell: EdisonInteriorMagicFillCell,
  centroid: { readonly x: number; readonly z: number },
  placement: FurnitureRule["placement"]
): number {
  const wallCount = getWallDirections(room, cell).length;
  const distanceToCentroid = Math.hypot(cell.x - centroid.x, cell.z - centroid.z);
  switch (placement) {
    case "center":
      return 100 - distanceToCentroid * 5 - wallCount * 8;
    case "corner":
      return wallCount * 50 + distanceToCentroid + distanceToNearestDoorCell(room, cell) * 4;
    case "wall":
      return (wallCount === 1 ? 120 : wallCount * 20) - distanceToCentroid * 0.5 + distanceToNearestDoorCell(room, cell) * 6;
  }
}

function satisfiesRuleClearance(
  room: EdisonInteriorMagicFillRoom,
  cell: EdisonInteriorMagicFillCell,
  rule: FurnitureRule
): boolean {
  if (isDoorReservedCell(room, cell)) {
    return false;
  }

  const footprint = getFurnitureFootprint(rule);
  const wallCount = getWallDirections(room, cell).length;
  const doorDistance = distanceToNearestDoorCell(room, cell);
  if (footprint === "large" && doorDistance < (room.cells.length >= 9 ? 2 : 1)) {
    return false;
  }

  if (rule.placement === "center") {
    return footprint !== "large" || room.cells.length < 9 || wallCount <= 2;
  }

  if (rule.placement === "corner") {
    return wallCount >= 2 && doorDistance >= 1;
  }

  if (rule.placement === "wall") {
    return wallCount > 0 && hasInteriorNeighborAwayFromWall(room, cell) && (footprint !== "large" || wallCount === 1);
  }

  return true;
}

function resolveFurniturePosition(
  room: EdisonInteriorMagicFillRoom,
  cell: EdisonInteriorMagicFillCell,
  rule: FurnitureRule,
  yOffset: number
): readonly [number, number, number] {
  const wallInset = rule.placement === "wall" ? resolveWallInset(room, cell, rule) : null;
  return [
    round(cell.worldCenter[0] + (wallInset?.x ?? 0)),
    round(cell.worldCenter[1] + yOffset),
    round(cell.worldCenter[2] + (wallInset?.z ?? 0))
  ];
}

function resolveWallInset(
  room: EdisonInteriorMagicFillRoom,
  cell: EdisonInteriorMagicFillCell,
  rule: FurnitureRule
): { readonly x: number; readonly z: number } | null {
  const wallDirection = getWallDirections(room, cell).find((direction) => {
    const neighbor = getInteriorNeighbor(cell, oppositeDirection(direction));
    return room.cells.some((candidate) => candidate.x === neighbor.x && candidate.z === neighbor.z);
  });
  if (!wallDirection) {
    return null;
  }

  const neighbor = getInteriorNeighbor(cell, oppositeDirection(wallDirection));
  const neighborCell = room.cells.find((candidate) => candidate.x === neighbor.x && candidate.z === neighbor.z);
  if (!neighborCell) {
    return null;
  }

  const dx = neighborCell.worldCenter[0] - cell.worldCenter[0];
  const dz = neighborCell.worldCenter[2] - cell.worldCenter[2];
  const length = Math.hypot(dx, dz);
  if (length <= 0) {
    return null;
  }

  const inset = room.tileSize * (getFurnitureFootprint(rule) === "large" ? LARGE_WALL_INSET_TILES : SMALL_WALL_INSET_TILES);
  return { x: (dx / length) * inset, z: (dz / length) * inset };
}

function hasInteriorNeighborAwayFromWall(room: EdisonInteriorMagicFillRoom, cell: EdisonInteriorMagicFillCell): boolean {
  return getWallDirections(room, cell).some((direction) => {
    const neighbor = getInteriorNeighbor(cell, oppositeDirection(direction));
    return room.cells.some((candidate) => candidate.x === neighbor.x && candidate.z === neighbor.z);
  });
}

function getFurnitureFootprint(rule: FurnitureRule): "decor" | "small" | "large" {
  if (rule.role.includes("light") || rule.role === "rug") {
    return "decor";
  }

  if (
    rule.role.includes("chair") ||
    rule.role.includes("stand") ||
    rule.role === "toilet" ||
    rule.role === "sink" ||
    rule.role === "plant" ||
    rule.role === "trashcan"
  ) {
    return "small";
  }

  return "large";
}

function isDoorReservedCell(room: EdisonInteriorMagicFillRoom, cell: EdisonInteriorMagicFillCell): boolean {
  const key = cellKey(cell);
  return room.doorEdges.some((edge) => cellKey(edge.a) === key || cellKey(edge.b) === key);
}

function distanceToNearestDoorCell(room: EdisonInteriorMagicFillRoom, cell: EdisonInteriorMagicFillCell): number {
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const edge of room.doorEdges) {
    bestDistance = Math.min(bestDistance, Math.hypot(edge.a.x - cell.x, edge.a.z - cell.z));
    bestDistance = Math.min(bestDistance, Math.hypot(edge.b.x - cell.x, edge.b.z - cell.z));
  }

  return Number.isFinite(bestDistance) ? bestDistance : room.cells.length;
}

function resolveFurnitureYaw(room: EdisonInteriorMagicFillRoom, cell: EdisonInteriorMagicFillCell, rule: FurnitureRule): number {
  if (rule.placement === "center") {
    return ((room.roomIndex + room.storyIndex) % 2 === 0 ? 0 : HALF_PI) + (rule.yawOffset ?? 0);
  }

  const wallDirection = getWallDirections(room, cell)[0];
  if (!wallDirection) {
    return rule.yawOffset ?? 0;
  }

  const neighbor = getInteriorNeighbor(cell, oppositeDirection(wallDirection));
  const neighborCell = room.cells.find((candidate) => candidate.x === neighbor.x && candidate.z === neighbor.z);
  if (!neighborCell) {
    return rule.yawOffset ?? 0;
  }

  const dx = neighborCell.worldCenter[0] - cell.worldCenter[0];
  const dz = neighborCell.worldCenter[2] - cell.worldCenter[2];
  return Math.atan2(dx, dz) + (rule.yawOffset ?? 0);
}

function getWallDirections(room: EdisonInteriorMagicFillRoom, cell: EdisonInteriorMagicFillCell): readonly string[] {
  const roomCells = new Set(room.cells.map((candidate) => cellKey(candidate)));
  return ["east", "west", "south", "north"].filter((direction) => {
    return !roomCells.has(cellKey(getInteriorNeighbor(cell, direction)));
  });
}

function getInteriorNeighbor(cell: { readonly x: number; readonly z: number }, direction: string): { readonly x: number; readonly z: number } {
  switch (direction) {
    case "east":
      return { x: cell.x + 1, z: cell.z };
    case "west":
      return { x: cell.x - 1, z: cell.z };
    case "south":
      return { x: cell.x, z: cell.z + 1 };
    case "north":
    default:
      return { x: cell.x, z: cell.z - 1 };
  }
}

function oppositeDirection(direction: string): string {
  switch (direction) {
    case "east":
      return "west";
    case "west":
      return "east";
    case "south":
      return "north";
    case "north":
    default:
      return "south";
  }
}

function resolveCentroid(cells: readonly EdisonInteriorMagicFillCell[]): { readonly x: number; readonly z: number } {
  const sum = cells.reduce((accumulator, cell) => ({
    x: accumulator.x + cell.x,
    z: accumulator.z + cell.z
  }), { x: 0, z: 0 });
  return {
    x: sum.x / Math.max(1, cells.length),
    z: sum.z / Math.max(1, cells.length)
  };
}

function cardinalNeighbors(cell: { readonly x: number; readonly z: number }): readonly { readonly x: number; readonly z: number }[] {
  return [
    { x: cell.x + 1, z: cell.z },
    { x: cell.x - 1, z: cell.z },
    { x: cell.x, z: cell.z + 1 },
    { x: cell.x, z: cell.z - 1 }
  ];
}

function roomCellKey(room: EdisonInteriorMagicFillRoom, cell: { readonly x: number; readonly z: number }): string {
  return `${room.storyIndex}:${room.roomIndex}:${cellKey(cell)}`;
}

function cellKey(cell: { readonly x: number; readonly z: number }): string {
  return `${cell.x}:${cell.z}`;
}

function edgeKey(left: { readonly x: number; readonly z: number }, right: { readonly x: number; readonly z: number }): string {
  const leftKey = cellKey(left);
  const rightKey = cellKey(right);
  return leftKey < rightKey ? `${leftKey}|${rightKey}` : `${rightKey}|${leftKey}`;
}

function normalizeYaw(value: number): number {
  return round(((value % TWO_PI) + TWO_PI) % TWO_PI);
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}
