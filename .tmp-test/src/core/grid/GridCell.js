"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.GridCell = void 0;
class GridCell {
    constructor(x, z) {
        this.x = x;
        this.z = z;
    }
    key() {
        return `${this.x}:${this.z}`;
    }
    equals(other) {
        return this.x === other.x && this.z === other.z;
    }
    distance(other) {
        return Math.abs(this.x - other.x) + Math.abs(this.z - other.z);
    }
}
exports.GridCell = GridCell;
