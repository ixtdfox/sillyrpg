"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.FloorNavigationSurfaceRegistry = void 0;
exports.makeStoryCellKey = makeStoryCellKey;
const core_1 = require("@babylonjs/core");
const GridCell_1 = require("../grid/GridCell");
const BuildingNavigationMetadata_1 = require("./BuildingNavigationMetadata");
const GridNavigationContract_1 = require("./GridNavigationContract");
function makeStoryCellKey(storyIndex, cell) {
    return `${storyIndex}:${cell.x}:${cell.z}`;
}
class FloorNavigationSurfaceRegistry {
    constructor() {
        this.surfaces = [];
        this.cellsByStory = new Map();
        this.storyYByStory = new Map();
        this.grid = null;
        this.hasExplicitSurfaces = false;
    }
    rebuild(scene, grid, options = {}) {
        this.surfaces.length = 0;
        this.cellsByStory.clear();
        this.storyYByStory.clear();
        this.grid = grid;
        this.hasExplicitSurfaces = false;
        const knownStoryY = this.collectKnownStoryY(scene);
        const gridContracts = (0, GridNavigationContract_1.mapGridNavigationContractsToRuntime)(scene, grid);
        let contractCellCount = 0;
        let contractSkippedOutOfBounds = 0;
        for (const contract of gridContracts) {
            for (const story of contract.stories) {
                this.hasExplicitSurfaces = true;
                this.recordStoryY(story.storyIndex, story.storyY);
                contractCellCount += story.walkableCells.length;
                for (const cell of story.walkableCells) {
                    if (grid.contains(cell)) {
                        this.addWalkableCell(cell, story.storyIndex);
                        continue;
                    }
                    contractSkippedOutOfBounds += 1;
                }
            }
        }
        if (gridContracts.length > 0 && contractSkippedOutOfBounds > 0) {
            console.warn(`[FloorNavigationSurfaceRegistry] skipped ${contractSkippedOutOfBounds}/${contractCellCount} contract walkable cells because they are outside RectGrid bounds.`);
        }
        if (options.forcedGroundMesh && !options.forcedGroundMesh.isDisposed() && options.forcedGroundMesh.getTotalVertices() > 0) {
            this.addWalkableSurface(grid, options.forcedGroundMesh, 0, getWorldBounds(options.forcedGroundMesh));
        }
        for (const mesh of scene.meshes) {
            if (mesh.isDisposed() || mesh.getTotalVertices() <= 0) {
                continue;
            }
            if (!this.isWalkableFloorSurface(mesh)) {
                continue;
            }
            const bounds = getWorldBounds(mesh);
            const storyIndex = this.resolveSurfaceStoryIndex(mesh, bounds, knownStoryY);
            if (storyIndex === null) {
                console.warn(`[FloorNavigationSurfaceRegistry] skipped walkable-looking mesh '${mesh.name}': story metadata missing and story could not be inferred.`);
                continue;
            }
            this.addWalkableSurface(grid, mesh, storyIndex, bounds);
        }
        if (!this.hasExplicitSurfaces) {
            for (const cell of grid.getCellsWithinBounds()) {
                this.addWalkableCell(cell, 0);
            }
            this.recordStoryY(0, grid.getOrigin().y);
        }
        this.logStats();
    }
    isWalkableCell(cell, storyIndex) {
        if (!this.hasExplicitSurfaces && storyIndex === 0) {
            return true;
        }
        return this.cellsByStory.get(storyIndex)?.has(makeStoryCellKey(storyIndex, cell)) ?? false;
    }
    getWalkableCells(storyIndex) {
        return [...(this.cellsByStory.get(storyIndex)?.values() ?? [])];
    }
    getWalkableCellEntries() {
        const entries = [];
        for (const [storyIndex, cells] of this.cellsByStory) {
            for (const cell of cells.values()) {
                entries.push({ cell, storyIndex });
            }
        }
        return entries;
    }
    getStoryIndices() {
        return [...this.cellsByStory.keys()].sort((a, b) => a - b);
    }
    getStoryY(storyIndex) {
        return this.storyYByStory.get(storyIndex) ?? null;
    }
    getStoryYByStory() {
        return this.storyYByStory;
    }
    findClosestWalkableCell(input) {
        const maxDistance = input.maxDistance ?? 2;
        const cells = this.getWalkableCells(input.storyIndex);
        const storyY = this.getStoryY(input.storyIndex) ?? input.point.y;
        let bestCell = null;
        let bestDistanceSquared = maxDistance * maxDistance;
        for (const cell of cells) {
            const world = this.grid?.cellToWorld(cell, storyY) ?? new core_1.Vector3(input.point.x, storyY, input.point.z);
            const distanceSquared = core_1.Vector3.DistanceSquared(input.point, world);
            if (distanceSquared <= bestDistanceSquared) {
                bestDistanceSquared = distanceSquared;
                bestCell = cell;
            }
        }
        return bestCell;
    }
    addForcedWalkableCell(cell, storyIndex) {
        this.addWalkableCell(cell, storyIndex);
    }
    addWalkableSurface(grid, mesh, storyIndex, bounds) {
        this.hasExplicitSurfaces = true;
        this.surfaces.push({
            mesh,
            storyIndex,
            boundsMin: bounds.min.clone(),
            boundsMax: bounds.max.clone()
        });
        this.recordStoryY(storyIndex, bounds.max.y);
        this.addCellsForBounds(grid, storyIndex, bounds.min, bounds.max);
    }
    addCellsForBounds(grid, storyIndex, min, max) {
        const tileSize = grid.getTileSize();
        const padX = Math.min(tileSize * 0.25, Math.max(0, (max.x - min.x) * 0.12));
        const padZ = Math.min(tileSize * 0.25, Math.max(0, (max.z - min.z) * 0.12));
        const storyY = this.storyYByStory.get(storyIndex) ?? (min.y + max.y) / 2;
        for (const cell of grid.getCellsWithinBounds()) {
            const center = grid.cellToWorld(cell, storyY);
            if (center.x < min.x + padX ||
                center.x > max.x - padX ||
                center.z < min.z + padZ ||
                center.z > max.z - padZ) {
                continue;
            }
            this.addWalkableCell(cell, storyIndex);
        }
    }
    addWalkableCell(cell, storyIndex) {
        const cells = this.cellsByStory.get(storyIndex) ?? new Map();
        cells.set(makeStoryCellKey(storyIndex, cell), new GridCell_1.GridCell(cell.x, cell.z));
        this.cellsByStory.set(storyIndex, cells);
    }
    collectKnownStoryY(scene) {
        const result = new Map();
        for (const mesh of scene.meshes) {
            const checkpoint = (0, BuildingNavigationMetadata_1.parseStairCheckpointMetadata)(mesh);
            if (!checkpoint) {
                continue;
            }
            const position = mesh.getAbsolutePosition();
            if (!result.has(checkpoint.from_story)) {
                result.set(checkpoint.from_story, position.y);
            }
            if (!result.has(checkpoint.to_story)) {
                result.set(checkpoint.to_story, position.y);
            }
        }
        return result;
    }
    resolveSurfaceStoryIndex(mesh, bounds, knownStoryY) {
        const metadata = resolveMetadata(mesh);
        const explicitStory = normalizeInteger(metadata?.game_nav_story_index) ??
            normalizeInteger(metadata?.storyIndex) ??
            normalizeInteger(metadata?.story_index) ??
            normalizeInteger(metadata?.floorIndex) ??
            normalizeInteger(metadata?.game_story_index);
        if (explicitStory !== null) {
            return explicitStory;
        }
        if (this.isGroundLike(mesh)) {
            return 0;
        }
        let bestStory = null;
        let bestDistance = Number.POSITIVE_INFINITY;
        for (const [storyIndex, storyY] of knownStoryY) {
            const distance = Math.abs(bounds.center.y - storyY);
            if (distance < bestDistance) {
                bestDistance = distance;
                bestStory = storyIndex;
            }
        }
        return bestDistance <= 1.25 ? bestStory : null;
    }
    isWalkableFloorSurface(mesh) {
        const gameNavigationMetadata = (0, BuildingNavigationMetadata_1.parseGameNavigationMetadata)(mesh);
        if (gameNavigationMetadata?.kind === "floor") {
            return true;
        }
        if (gameNavigationMetadata) {
            return false;
        }
        const metadata = resolveMetadata(mesh);
        const navKind = normalizeString(metadata?.nav_kind);
        if (navKind === "stair_checkpoint" || navKind === "stair_pick_proxy") {
            return false;
        }
        const part = normalizeString(metadata?.part) ?? normalizeString(metadata?.building_part) ?? normalizeString(metadata?.role);
        const name = mesh.name;
        if (isBlockedSurfaceName(part ?? name) || isBlockedSurfaceName(name)) {
            return false;
        }
        if (part && isWalkableSurfaceName(part)) {
            return true;
        }
        return isWalkableSurfaceName(name) || this.isGroundLike(mesh);
    }
    isGroundLike(mesh) {
        const metadata = mesh.metadata;
        if (metadata?.isGround === true) {
            return true;
        }
        return /^(ground|grid-ground|terrain|floor)$/i.test(mesh.name.replace(/\.[0-9]+$/u, ""));
    }
    recordStoryY(storyIndex, y) {
        if (!Number.isFinite(y) || this.storyYByStory.has(storyIndex)) {
            return;
        }
        this.storyYByStory.set(storyIndex, y);
    }
    logStats() {
        const stories = this.getStoryIndices();
        console.info(`FloorNavigationSurfaceRegistry: loaded walkable surfaces=${this.surfaces.length} stories=${stories.join(",") || "none"}`);
        for (const storyIndex of stories) {
            console.info(`- story ${storyIndex} cells=${this.getWalkableCells(storyIndex).length} y=${(this.getStoryY(storyIndex) ?? 0).toFixed(2)}`);
        }
    }
}
exports.FloorNavigationSurfaceRegistry = FloorNavigationSurfaceRegistry;
function getWorldBounds(mesh) {
    mesh.computeWorldMatrix(true);
    const boundingBox = mesh.getBoundingInfo().boundingBox;
    return {
        min: boundingBox.minimumWorld.clone(),
        max: boundingBox.maximumWorld.clone(),
        center: boundingBox.centerWorld.clone()
    };
}
function resolveMetadata(mesh) {
    let currentNode = mesh;
    while (currentNode) {
        const metadata = currentNode.metadata;
        if (metadata && typeof metadata === "object") {
            const record = resolveExtrasRecord(metadata);
            if (Object.keys(record).length > 0) {
                return record;
            }
        }
        currentNode = currentNode.parent;
    }
    return null;
}
function resolveExtrasRecord(metadata) {
    const gltfPayload = metadata.gltf;
    if (gltfPayload && typeof gltfPayload === "object") {
        const extrasPayload = gltfPayload.extras;
        if (extrasPayload && typeof extrasPayload === "object") {
            return extrasPayload;
        }
    }
    return metadata;
}
function normalizeString(value) {
    if (typeof value !== "string") {
        return null;
    }
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
}
function normalizeInteger(value) {
    if (typeof value === "number" && Number.isFinite(value)) {
        return Math.trunc(value);
    }
    if (typeof value === "string") {
        const parsed = Number.parseInt(value, 10);
        return Number.isFinite(parsed) ? parsed : null;
    }
    return null;
}
function isWalkableSurfaceName(name) {
    return /(story[_ -]?floor|room[_ -]?floor|roof[_ -]?floor|floor|platform|landing|balcony|walkway|roof[_ -]?platform|stair[_ -]?landing|terrace|external[_ -]?stair[_ -]?landing)/i.test(name);
}
function isBlockedSurfaceName(name) {
    return /(wall|railing|rail|window|door|glass|frame|sill|reveal|border|fence|stair[_ -]?(tread|run)|checkpoint|pick[_ -]?proxy)/i.test(name);
}
