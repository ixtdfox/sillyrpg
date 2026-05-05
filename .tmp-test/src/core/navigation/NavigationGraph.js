"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.NavigationGraph = void 0;
exports.makeNavigationNodeId = makeNavigationNodeId;
const GridCell_1 = require("../grid/GridCell");
function makeNavigationNodeId(storyIndex, cell) {
    return `node:${storyIndex}:${cell.x}:${cell.z}`;
}
class NavigationGraph {
    constructor(grid, stairConnectors = [], storyYByStory = new Map(), isWalkableCell, isEdgeBlocked, getMovementCost) {
        this.grid = grid;
        this.storyIndices = new Set([0]);
        this.storyYByStory = new Map(storyYByStory);
        this.stairEdgesByNodeId = new Map();
        this.isWalkableCell = isWalkableCell ?? ((cell) => this.grid.contains(cell));
        this.isEdgeBlocked = isEdgeBlocked ?? (() => false);
        this.getMovementCost = getMovementCost ?? (() => 1);
        for (const connector of stairConnectors) {
            this.storyIndices.add(connector.fromStoryIndex);
            this.storyIndices.add(connector.toStoryIndex);
            this.registerStairEdge(connector, false);
            if (connector.bidirectional) {
                this.registerStairEdge(connector, true);
            }
        }
    }
    getNode(nodeId) {
        const parsed = parseNavigationNodeId(nodeId);
        if (!parsed) {
            return null;
        }
        if (!this.isWalkableCell(parsed.cell, parsed.storyIndex)) {
            return null;
        }
        return this.createNode(parsed.storyIndex, parsed.cell);
    }
    getNodeForCell(storyIndex, cell) {
        if (!this.grid.contains(cell)) {
            return null;
        }
        if (!this.isWalkableCell(cell, storyIndex)) {
            return null;
        }
        this.storyIndices.add(storyIndex);
        return this.createNode(storyIndex, cell);
    }
    getNeighbors(node, blocked) {
        const edges = [];
        for (const neighborCell of this.grid.getNeighbors(node.cell)) {
            if (!this.grid.contains(neighborCell) || !this.isWalkableCell(neighborCell, node.storyIndex)) {
                continue;
            }
            const neighborNode = this.createNode(node.storyIndex, neighborCell);
            if (blocked(neighborNode)) {
                continue;
            }
            if (this.isEdgeBlocked(node.cell, neighborCell, node.storyIndex)) {
                continue;
            }
            const movementCost = this.getMovementCost(neighborCell, node.storyIndex);
            if (!Number.isFinite(movementCost) || movementCost <= 0) {
                continue;
            }
            edges.push({
                id: `walk:${node.id}->${neighborNode.id}`,
                fromNodeId: node.id,
                toNodeId: neighborNode.id,
                kind: "walk",
                cost: movementCost
            });
        }
        for (const stairEdge of this.stairEdgesByNodeId.get(node.id) ?? []) {
            const targetNode = this.getNode(stairEdge.toNodeId);
            if (!targetNode || blocked(targetNode)) {
                continue;
            }
            edges.push(stairEdge);
        }
        return edges;
    }
    getStoryY(storyIndex) {
        return this.storyYByStory.get(storyIndex) ?? this.grid.getOrigin().y;
    }
    registerStairEdge(connector, reverse) {
        const fromStoryIndex = reverse ? connector.toStoryIndex : connector.fromStoryIndex;
        const toStoryIndex = reverse ? connector.fromStoryIndex : connector.toStoryIndex;
        const fromCell = reverse ? connector.toCell : connector.fromCell;
        const toCell = reverse ? connector.fromCell : connector.toCell;
        const fromNodeId = makeNavigationNodeId(fromStoryIndex, fromCell);
        const toNodeId = makeNavigationNodeId(toStoryIndex, toCell);
        const traversalPath = reverse
            ? [...connector.traversalPathWorld].reverse().map((point) => point.clone())
            : connector.traversalPathWorld.map((point) => point.clone());
        const edge = {
            id: `${connector.kind === "external" ? "external_stair" : "stair"}:${connector.stairId}:${fromStoryIndex}->${toStoryIndex}`,
            fromNodeId,
            toNodeId,
            kind: connector.kind === "external" ? "external_stair" : "stair",
            cost: connector.cost,
            traversalPath,
            stairId: connector.stairId
        };
        const edges = this.stairEdgesByNodeId.get(fromNodeId) ?? [];
        edges.push(edge);
        this.stairEdgesByNodeId.set(fromNodeId, edges);
    }
    createNode(storyIndex, cell) {
        return {
            id: makeNavigationNodeId(storyIndex, cell),
            cell,
            storyIndex,
            worldPosition: this.grid.cellToWorld(cell, this.getStoryY(storyIndex))
        };
    }
}
exports.NavigationGraph = NavigationGraph;
function parseNavigationNodeId(nodeId) {
    const match = /^node:(-?\d+):(-?\d+):(-?\d+)$/.exec(nodeId);
    if (!match) {
        return null;
    }
    return {
        storyIndex: Number.parseInt(match[1], 10),
        cell: new GridCell_1.GridCell(Number.parseInt(match[2], 10), Number.parseInt(match[3], 10))
    };
}
