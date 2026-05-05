"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RectGrid = void 0;
const core_1 = require("@babylonjs/core");
const GridCell_1 = require("./GridCell");
class RectGrid {
    constructor(origin, tileSize, bounds) {
        if (!Number.isFinite(tileSize) || tileSize <= 0) {
            throw new Error(`RectGrid tileSize must be positive, got ${tileSize}`);
        }
        this.origin = origin.clone();
        this.tileSize = tileSize;
        this.bounds = bounds;
    }
    static deriveBoundsFromWorldRect(origin, tileSize, minX, maxX, minZ, maxZ) {
        const minCell = new GridCell_1.GridCell(Math.floor((minX - origin.x) / tileSize), Math.floor((minZ - origin.z) / tileSize));
        const maxCell = new GridCell_1.GridCell(Math.floor((maxX - origin.x) / tileSize), Math.floor((maxZ - origin.z) / tileSize));
        return {
            minX: Math.min(minCell.x, maxCell.x) - 1,
            maxX: Math.max(minCell.x, maxCell.x) + 1,
            minZ: Math.min(minCell.z, maxCell.z) - 1,
            maxZ: Math.max(minCell.z, maxCell.z) + 1
        };
    }
    getBounds() {
        return this.bounds;
    }
    getOrigin() {
        return this.origin.clone();
    }
    getTileSize() {
        return this.tileSize;
    }
    worldToCell(worldPosition) {
        const localX = worldPosition.x - this.origin.x;
        const localZ = worldPosition.z - this.origin.z;
        return new GridCell_1.GridCell(Math.floor(localX / this.tileSize), Math.floor(localZ / this.tileSize));
    }
    cellToWorld(cell, y = this.origin.y) {
        return new core_1.Vector3(this.origin.x + (cell.x + 0.5) * this.tileSize, y, this.origin.z + (cell.z + 0.5) * this.tileSize);
    }
    cellBounds(cell) {
        return {
            minX: this.origin.x + cell.x * this.tileSize,
            maxX: this.origin.x + (cell.x + 1) * this.tileSize,
            minZ: this.origin.z + cell.z * this.tileSize,
            maxZ: this.origin.z + (cell.z + 1) * this.tileSize
        };
    }
    isWithinBounds(cell) {
        return cell.x >= this.bounds.minX
            && cell.x <= this.bounds.maxX
            && cell.z >= this.bounds.minZ
            && cell.z <= this.bounds.maxZ;
    }
    contains(cell) {
        return this.isWithinBounds(cell);
    }
    getCellsWithinBounds() {
        const result = [];
        for (let x = this.bounds.minX; x <= this.bounds.maxX; x += 1) {
            for (let z = this.bounds.minZ; z <= this.bounds.maxZ; z += 1) {
                result.push(new GridCell_1.GridCell(x, z));
            }
        }
        return result;
    }
    getNeighbors(cell) {
        return this.getNeighbors4(cell);
    }
    getNeighbors4(cell) {
        return [
            new GridCell_1.GridCell(cell.x + 1, cell.z),
            new GridCell_1.GridCell(cell.x - 1, cell.z),
            new GridCell_1.GridCell(cell.x, cell.z + 1),
            new GridCell_1.GridCell(cell.x, cell.z - 1)
        ];
    }
    getNeighbors8(cell) {
        return [
            ...this.getNeighbors4(cell),
            new GridCell_1.GridCell(cell.x + 1, cell.z + 1),
            new GridCell_1.GridCell(cell.x + 1, cell.z - 1),
            new GridCell_1.GridCell(cell.x - 1, cell.z + 1),
            new GridCell_1.GridCell(cell.x - 1, cell.z - 1)
        ];
    }
    getGridCellsInVisionSector(originCell, forward, rangeCells, fovDegrees) {
        const normalizedForward = new core_1.Vector3(forward.x, 0, forward.z).normalize();
        const minDot = Math.cos((fovDegrees * Math.PI) / 360);
        const originWorld = this.cellToWorld(originCell, 0);
        const result = [];
        for (let x = originCell.x - rangeCells; x <= originCell.x + rangeCells; x += 1) {
            for (let z = originCell.z - rangeCells; z <= originCell.z + rangeCells; z += 1) {
                const candidate = new GridCell_1.GridCell(x, z);
                if (!this.contains(candidate) || originCell.distance(candidate) > rangeCells) {
                    continue;
                }
                if (candidate.equals(originCell)) {
                    result.push(candidate);
                    continue;
                }
                const direction = this.cellToWorld(candidate, 0).subtract(originWorld);
                direction.y = 0;
                const lengthSquared = direction.lengthSquared();
                if (lengthSquared <= Number.EPSILON) {
                    result.push(candidate);
                    continue;
                }
                direction.scaleInPlace(1 / Math.sqrt(lengthSquared));
                if (core_1.Vector3.Dot(normalizedForward, direction) >= minDot) {
                    result.push(candidate);
                }
            }
        }
        return result;
    }
}
exports.RectGrid = RectGrid;
