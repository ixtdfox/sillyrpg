"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.GRID_NAVIGATION_CONTRACT = void 0;
exports.parseGridNavigationContracts = parseGridNavigationContracts;
exports.parseGridNavigationContractEntries = parseGridNavigationContractEntries;
exports.mapGridNavigationContractsToRuntime = mapGridNavigationContractsToRuntime;
const core_1 = require("@babylonjs/core");
const GridCell_1 = require("../grid/GridCell");
exports.GRID_NAVIGATION_CONTRACT = "sillyrpg.grid_navigation.v3";
let hasWarnedMissingContract = false;
function parseGridNavigationContracts(scene) {
    return parseGridNavigationContractEntries(scene).map((entry) => entry.contract);
}
function parseGridNavigationContractEntries(scene) {
    const contracts = [];
    for (const node of collectSceneNodes(scene)) {
        for (const metadata of resolveMetadataCandidates(node)) {
            const rawJson = normalizeString(metadata.game_navigation_json);
            if (!rawJson) {
                continue;
            }
            try {
                const raw = JSON.parse(rawJson);
                const contract = parseContract(raw);
                if (contract) {
                    validateContract(contract, node.name);
                    logContractStats(contract, node.name);
                    contracts.push({ sourceNode: node, contract });
                }
            }
            catch (error) {
                console.warn(`[GridNavigationContract] invalid game_navigation_json on '${node.name}': ${error}`);
            }
        }
    }
    if (contracts.length === 0 && !hasWarnedMissingContract) {
        hasWarnedMissingContract = true;
        console.warn("[GridNavigation] No v3 contract found; using legacy mesh projection fallback. Rect navigation may be imprecise.");
    }
    return contracts;
}
function mapGridNavigationContractsToRuntime(scene, grid) {
    const entries = parseGridNavigationContractEntries(scene);
    const mapped = entries.map((entry) => mapContractEntryToRuntime(entry, grid));
    logMappingDiagnostics(scene, grid, entries, mapped);
    return mapped;
}
function mapContractEntryToRuntime(entry, grid) {
    entry.sourceNode.computeWorldMatrix(true);
    const worldMatrix = entry.sourceNode.getWorldMatrix();
    const sourceName = entry.sourceNode.name || "(unnamed)";
    const storyYByStory = new Map(entry.contract.stories.map((story) => [story.storyIndex, story.storyY]));
    const mappedStories = entry.contract.stories.map((story) => {
        const mappedStoryY = mapStoryY(entry.contract, story.storyY, worldMatrix);
        const mappedWalkableCells = story.walkableCells.map((cell) => mapCellToRuntime(entry.contract, cell, story.storyY, worldMatrix, grid));
        const mappedBlockedCells = story.blockedCells.map((item) => ({
            cell: mapCellToRuntime(entry.contract, item.cell, story.storyY, worldMatrix, grid),
            reason: item.reason
        }));
        const mappedBlockedEdges = story.blockedEdges.map((edge) => ({
            a: mapCellToRuntime(entry.contract, edge.a, story.storyY, worldMatrix, grid),
            b: mapCellToRuntime(entry.contract, edge.b, story.storyY, worldMatrix, grid),
            reason: edge.reason
        }));
        const mappedDoorEdges = story.doorEdges.map((edge) => ({
            a: mapCellToRuntime(entry.contract, edge.a, story.storyY, worldMatrix, grid),
            b: mapCellToRuntime(entry.contract, edge.b, story.storyY, worldMatrix, grid),
            doorId: edge.doorId,
            isOpen: edge.isOpen
        }));
        const mappedStairs = story.stairs.map((stair) => ({
            id: stair.id,
            from: {
                storyIndex: stair.from.storyIndex,
                cell: mapCellToRuntime(entry.contract, stair.from.cell, storyYByStory.get(stair.from.storyIndex) ?? story.storyY, worldMatrix, grid)
            },
            to: {
                storyIndex: stair.to.storyIndex,
                cell: mapCellToRuntime(entry.contract, stair.to.cell, storyYByStory.get(stair.to.storyIndex) ?? story.storyY, worldMatrix, grid)
            }
        }));
        for (let i = 0; i < mappedBlockedEdges.length; i += 1) {
            const mappedEdge = mappedBlockedEdges[i];
            const rawEdge = story.blockedEdges[i];
            validateMappedNeighborEdge(mappedEdge.a, mappedEdge.b, rawEdge?.a, rawEdge?.b, sourceName, story.storyIndex, "blocked_edges", worldMatrix);
        }
        for (let i = 0; i < mappedDoorEdges.length; i += 1) {
            const mappedEdge = mappedDoorEdges[i];
            const rawEdge = story.doorEdges[i];
            validateMappedNeighborEdge(mappedEdge.a, mappedEdge.b, rawEdge?.a, rawEdge?.b, sourceName, story.storyIndex, "door_edges", worldMatrix);
        }
        return {
            storyIndex: story.storyIndex,
            storyY: mappedStoryY,
            walkableCells: dedupeCells(mappedWalkableCells),
            blockedCells: dedupeBlockedCells(mappedBlockedCells),
            blockedEdges: dedupeEdges(mappedBlockedEdges),
            doorEdges: dedupeDoorEdges(mappedDoorEdges),
            stairs: dedupeStairs(mappedStairs)
        };
    });
    return {
        ...entry.contract,
        stories: mappedStories,
        mappingSourceNodeName: sourceName
    };
}
function mapCellToRuntime(contract, cell, storyY, worldMatrix, grid) {
    const rawCenter = new core_1.Vector3(contract.origin.x + (cell.x + 0.5) * contract.tileSizeM, storyY, contract.origin.z + (cell.z + 0.5) * contract.tileSizeM);
    const worldCenter = core_1.Vector3.TransformCoordinates(rawCenter, worldMatrix);
    return grid.worldToCell(worldCenter);
}
function mapStoryY(contract, rawStoryY, worldMatrix) {
    const rawPoint = new core_1.Vector3(contract.origin.x, rawStoryY, contract.origin.z);
    return core_1.Vector3.TransformCoordinates(rawPoint, worldMatrix).y;
}
function dedupeCells(cells) {
    const map = new Map();
    for (const cell of cells) {
        map.set(cell.key(), new GridCell_1.GridCell(cell.x, cell.z));
    }
    return [...map.values()];
}
function dedupeBlockedCells(cells) {
    const map = new Map();
    for (const entry of cells) {
        map.set(entry.cell.key(), { cell: new GridCell_1.GridCell(entry.cell.x, entry.cell.z), reason: entry.reason });
    }
    return [...map.values()];
}
function dedupeEdges(edges) {
    const map = new Map();
    for (const edge of edges) {
        const key = edgeKey(edge.a, edge.b);
        map.set(key, { a: new GridCell_1.GridCell(edge.a.x, edge.a.z), b: new GridCell_1.GridCell(edge.b.x, edge.b.z), reason: edge.reason });
    }
    return [...map.values()];
}
function dedupeDoorEdges(edges) {
    const map = new Map();
    for (const edge of edges) {
        const key = edgeKey(edge.a, edge.b);
        map.set(key, {
            a: new GridCell_1.GridCell(edge.a.x, edge.a.z),
            b: new GridCell_1.GridCell(edge.b.x, edge.b.z),
            doorId: edge.doorId,
            isOpen: edge.isOpen
        });
    }
    return [...map.values()];
}
function dedupeStairs(stairs) {
    const map = new Map();
    for (const stair of stairs) {
        const key = `${stair.id}:${stair.from.storyIndex}:${stair.from.cell.key()}->${stair.to.storyIndex}:${stair.to.cell.key()}`;
        map.set(key, {
            id: stair.id,
            from: { storyIndex: stair.from.storyIndex, cell: new GridCell_1.GridCell(stair.from.cell.x, stair.from.cell.z) },
            to: { storyIndex: stair.to.storyIndex, cell: new GridCell_1.GridCell(stair.to.cell.x, stair.to.cell.z) }
        });
    }
    return [...map.values()];
}
function edgeKey(a, b) {
    const first = a.key();
    const second = b.key();
    return first < second ? `${first}|${second}` : `${second}|${first}`;
}
function validateMappedNeighborEdge(a, b, rawA, rawB, sourceName, storyIndex, field, worldMatrix) {
    if (a.distance(b) === 1) {
        return;
    }
    console.warn(`[GridNavigationMapping] source=${sourceName} story=${storyIndex} field=${field} non-neighbor mapped edge raw=${rawA?.key() ?? "?"}<->${rawB?.key() ?? "?"} mapped=${a.key()}<->${b.key()} matrix=${formatMatrix(worldMatrix)}`);
}
function logMappingDiagnostics(scene, grid, rawEntries, mappedContracts) {
    if (!isMappingDebugEnabled()) {
        return;
    }
    const floorsBySource = collectFloorWorldBoundsBySource(scene);
    for (let index = 0; index < mappedContracts.length; index += 1) {
        const raw = rawEntries[index];
        const mapped = mappedContracts[index];
        for (const mappedStory of mapped.stories) {
            const rawStory = raw.contract.stories.find((story) => story.storyIndex === mappedStory.storyIndex);
            const rawWalkable = computeCellBounds(rawStory?.walkableCells ?? []);
            const mappedWalkable = computeCellBounds(mappedStory.walkableCells);
            const rawBlockedEdgeBounds = computeEdgeBounds((rawStory?.blockedEdges ?? []).map((edge) => [edge.a, edge.b]));
            const mappedBlockedEdgeBounds = computeEdgeBounds(mappedStory.blockedEdges.map((edge) => [edge.a, edge.b]));
            const floorBounds = floorsBySource.get(mapped.mappingSourceNodeName)?.get(mappedStory.storyIndex) ?? null;
            const delta = computeBoundsDelta(mappedWalkable, floorBounds, grid);
            console.info(`[GridNavigationMapping] source=${mapped.mappingSourceNodeName} story=${mappedStory.storyIndex} rawWalkable=${formatBounds(rawWalkable)} mappedWalkable=${formatBounds(mappedWalkable)} rawBlockedEdges=${formatBounds(rawBlockedEdgeBounds)} mappedBlockedEdges=${formatBounds(mappedBlockedEdgeBounds)} floorBoundsWorld=${formatWorldBounds(floorBounds)} delta=${delta}`);
        }
    }
}
function collectFloorWorldBoundsBySource(scene) {
    const result = new Map();
    for (const mesh of scene.meshes) {
        if (mesh.isDisposed() || mesh.getTotalVertices() <= 0) {
            continue;
        }
        const metadata = resolveMetadata(mesh);
        if (normalizeString(metadata?.game_nav_kind) !== "floor") {
            continue;
        }
        const sourceName = resolveTopParent(mesh).name || "(unnamed)";
        const storyIndex = normalizeInteger(metadata?.game_nav_story_index) ?? 0;
        mesh.computeWorldMatrix(true);
        const bounds = mesh.getBoundingInfo().boundingBox;
        const storyMap = result.get(sourceName) ?? new Map();
        const current = storyMap.get(storyIndex);
        const next = {
            minX: current ? Math.min(current.minX, bounds.minimumWorld.x) : bounds.minimumWorld.x,
            maxX: current ? Math.max(current.maxX, bounds.maximumWorld.x) : bounds.maximumWorld.x,
            minZ: current ? Math.min(current.minZ, bounds.minimumWorld.z) : bounds.minimumWorld.z,
            maxZ: current ? Math.max(current.maxZ, bounds.maximumWorld.z) : bounds.maximumWorld.z
        };
        storyMap.set(storyIndex, next);
        result.set(sourceName, storyMap);
    }
    return result;
}
function resolveTopParent(node) {
    let current = node;
    while (current.parent) {
        current = current.parent;
    }
    return current;
}
function computeBoundsDelta(mappedWalkable, floorBounds, grid) {
    if (!mappedWalkable || !floorBounds) {
        return "n/a";
    }
    const tile = grid.getTileSize();
    const minFloorCell = grid.worldToCell(new core_1.Vector3(floorBounds.minX + tile * 0.5, grid.getOrigin().y, floorBounds.minZ + tile * 0.5));
    const maxFloorCell = grid.worldToCell(new core_1.Vector3(floorBounds.maxX - tile * 0.5, grid.getOrigin().y, floorBounds.maxZ - tile * 0.5));
    return `x=[${mappedWalkable.minX - minFloorCell.x},${mappedWalkable.maxX - maxFloorCell.x}] z=[${mappedWalkable.minZ - minFloorCell.z},${mappedWalkable.maxZ - maxFloorCell.z}]`;
}
function formatWorldBounds(bounds) {
    if (!bounds) {
        return "n/a";
    }
    return `x=[${bounds.minX.toFixed(2)},${bounds.maxX.toFixed(2)}] z=[${bounds.minZ.toFixed(2)},${bounds.maxZ.toFixed(2)}]`;
}
function formatMatrix(matrix) {
    const values = matrix.asArray();
    return `[${values.map((value) => value.toFixed(3)).join(",")}]`;
}
function isMappingDebugEnabled() {
    const g = globalThis;
    const raw = typeof g.__RECT_NAV_DEBUG__ === "string" ? g.__RECT_NAV_DEBUG__.toLowerCase() : "";
    if (raw === "1" || raw === "true") {
        return true;
    }
    const query = g.location?.search ?? "";
    return query.includes("rectNavDebug=1") || query.includes("rectNavDebug=true");
}
function parseContract(raw) {
    if (raw.contract !== exports.GRID_NAVIGATION_CONTRACT || raw.grid_type !== "rect" || raw.tile_size_m !== 1) {
        return null;
    }
    if (raw.coordinate_mapping !== "blender_xy_to_game_xz" || !Array.isArray(raw.stories)) {
        return null;
    }
    const stories = raw.stories
        .map((story) => parseStory(story))
        .filter((story) => story !== null);
    if (stories.length === 0) {
        return null;
    }
    const origin = parseOrigin(raw.origin);
    return {
        contract: exports.GRID_NAVIGATION_CONTRACT,
        gridType: "rect",
        tileSizeM: 1,
        origin,
        coordinateMapping: "blender_xy_to_game_xz",
        stories
    };
}
function parseStory(raw) {
    const storyIndex = normalizeInteger(raw.story_index);
    if (storyIndex === null) {
        return null;
    }
    return {
        storyIndex,
        storyY: normalizeNumber(raw.story_y_m) ?? 0,
        walkableCells: parseCells(raw.walkable_cells),
        blockedCells: parseBlockedCells(raw.blocked_cells),
        blockedEdges: parseEdges(raw.blocked_edges),
        doorEdges: parseDoorEdges(raw.door_edges),
        stairs: parseStairs(raw.stairs)
    };
}
function parseCells(raw) {
    if (!Array.isArray(raw)) {
        return [];
    }
    return raw.map(parseCellObject).filter((cell) => cell !== null);
}
function parseBlockedCells(raw) {
    if (!Array.isArray(raw)) {
        return [];
    }
    return raw.flatMap((item) => {
        const record = item;
        const cell = parseCellObject(record);
        return cell ? [{ cell, reason: normalizeString(record.reason) ?? undefined }] : [];
    });
}
function parseEdges(raw) {
    if (!Array.isArray(raw)) {
        return [];
    }
    return raw.flatMap((item) => {
        const record = item;
        const a = parseCellObject(record.a);
        const b = parseCellObject(record.b);
        return a && b ? [{ a, b, reason: normalizeString(record.reason) ?? undefined }] : [];
    });
}
function parseDoorEdges(raw) {
    if (!Array.isArray(raw)) {
        return [];
    }
    return raw.flatMap((item) => {
        const record = item;
        const a = parseCellObject(record.a);
        const b = parseCellObject(record.b);
        return a && b ? [{
                a,
                b,
                doorId: normalizeString(record.door_id) ?? undefined,
                isOpen: record.is_open !== false
            }] : [];
    });
}
function parseStairs(raw) {
    if (!Array.isArray(raw)) {
        return [];
    }
    return raw.flatMap((item) => {
        const record = item;
        const from = parseStoryCell(record.from);
        const to = parseStoryCell(record.to);
        const id = normalizeString(record.id) ?? "stair";
        return from && to ? [{ id, from, to }] : [];
    });
}
function parseStoryCell(raw) {
    const record = raw;
    const storyIndex = normalizeInteger(record?.story_index);
    const cell = parseCellObject(record?.cell);
    return storyIndex === null || !cell ? null : { storyIndex, cell };
}
function parseCellObject(raw) {
    const record = raw;
    const x = normalizeInteger(record?.x);
    const z = normalizeInteger(record?.z);
    return x === null || z === null ? null : new GridCell_1.GridCell(x, z);
}
function parseOrigin(raw) {
    const record = raw;
    return {
        x: normalizeNumber(record?.x) ?? 0,
        z: normalizeNumber(record?.z) ?? 0
    };
}
function validateContract(contract, sourceName) {
    for (const story of contract.stories) {
        for (const edge of story.blockedEdges) {
            validateNeighborEdge(edge.a, edge.b, sourceName, "blocked_edges");
        }
        for (const edge of story.doorEdges) {
            validateNeighborEdge(edge.a, edge.b, sourceName, "door_edges");
        }
    }
}
function validateNeighborEdge(a, b, sourceName, field) {
    if (a.distance(b) !== 1) {
        console.warn(`[GridNavigationContract] ${sourceName} ${field} has non-neighbor edge ${a.key()} <-> ${b.key()}`);
    }
}
function logContractStats(contract, sourceNodeName) {
    const stats = contract.stories.reduce((total, story) => ({
        walkable: total.walkable + story.walkableCells.length,
        blockedEdges: total.blockedEdges + story.blockedEdges.length,
        doorEdges: total.doorEdges + story.doorEdges.length,
        stairs: total.stairs + story.stairs.length
    }), { walkable: 0, blockedEdges: 0, doorEdges: 0, stairs: 0 });
    console.info(`[GridNavigation] Loaded rect contract v3 from node='${sourceNodeName || "(unnamed)"}' stories=${contract.stories.length} walkable=${stats.walkable} blocked_edges=${stats.blockedEdges} door_edges=${stats.doorEdges} stairs=${stats.stairs} origin=(${contract.origin.x.toFixed(2)},${contract.origin.z.toFixed(2)}) tile=${contract.tileSizeM.toFixed(2)}`);
    for (const story of contract.stories) {
        const walkableBounds = computeCellBounds(story.walkableCells);
        const blockedBounds = computeEdgeBounds(story.blockedEdges.map((edge) => [edge.a, edge.b]));
        const doorBounds = computeEdgeBounds(story.doorEdges.map((edge) => [edge.a, edge.b]));
        console.info(`[GridNavigation] story=${story.storyIndex} y=${story.storyY.toFixed(2)} walkable=${story.walkableCells.length} bounds=${formatBounds(walkableBounds)} blocked_edges=${story.blockedEdges.length} blocked_bounds=${formatBounds(blockedBounds)} door_edges=${story.doorEdges.length} door_bounds=${formatBounds(doorBounds)}`);
    }
}
function computeCellBounds(cells) {
    if (cells.length === 0) {
        return null;
    }
    let minX = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY;
    let minZ = Number.POSITIVE_INFINITY;
    let maxZ = Number.NEGATIVE_INFINITY;
    for (const cell of cells) {
        minX = Math.min(minX, cell.x);
        maxX = Math.max(maxX, cell.x);
        minZ = Math.min(minZ, cell.z);
        maxZ = Math.max(maxZ, cell.z);
    }
    return { minX, maxX, minZ, maxZ };
}
function computeEdgeBounds(edges) {
    if (edges.length === 0) {
        return null;
    }
    const cells = [];
    for (const [a, b] of edges) {
        cells.push(a, b);
    }
    return computeCellBounds(cells);
}
function formatBounds(bounds) {
    if (!bounds) {
        return "n/a";
    }
    return `x=[${bounds.minX},${bounds.maxX}] z=[${bounds.minZ},${bounds.maxZ}]`;
}
function collectSceneNodes(scene) {
    const nodes = [];
    const seen = new Set();
    const add = (node) => {
        if (seen.has(node)) {
            return;
        }
        seen.add(node);
        nodes.push(node);
    };
    for (const root of scene.rootNodes) {
        visit(root, add);
    }
    for (const transform of scene.transformNodes) {
        visit(transform, add);
    }
    for (const mesh of scene.meshes) {
        visit(mesh, add);
    }
    return nodes;
}
function visit(node, add) {
    add(node);
    for (const child of node.getChildren()) {
        visit(child, add);
    }
}
function resolveMetadata(node) {
    const candidates = resolveMetadataCandidates(node);
    return candidates.find(hasNavigationMetadataKey) ?? candidates[0] ?? null;
}
function resolveMetadataCandidates(node) {
    const metadata = node.metadata;
    if (!metadata || typeof metadata !== "object") {
        return [];
    }
    const candidates = [];
    const record = metadata;
    candidates.push(record);
    const gltf = record.gltf;
    if (gltf && typeof gltf === "object") {
        const extras = gltf.extras;
        if (extras && typeof extras === "object") {
            candidates.push(extras);
        }
    }
    const extras = record.extras;
    if (extras && typeof extras === "object") {
        candidates.push(extras);
    }
    return candidates;
}
function hasNavigationMetadataKey(metadata) {
    return "game_navigation_json" in metadata ||
        "game_nav_kind" in metadata ||
        "building_part" in metadata ||
        "part" in metadata;
}
function normalizeString(value) {
    return typeof value === "string" && value.length > 0 ? value : null;
}
function normalizeInteger(value) {
    return typeof value === "number" && Number.isInteger(value) ? value : null;
}
function normalizeNumber(value) {
    return typeof value === "number" && Number.isFinite(value) ? value : null;
}
