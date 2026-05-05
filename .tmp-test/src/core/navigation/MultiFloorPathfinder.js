"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MultiFloorPathfinder = void 0;
exports.makeMovementTargetKey = makeMovementTargetKey;
const NavigationGraph_1 = require("./NavigationGraph");
class MultiFloorPathfinder {
    constructor(graph, debugEnabled = false) {
        this.graph = graph;
        this.debugEnabled = debugEnabled;
    }
    findPath(input) {
        const start = this.graph.getNodeForCell(input.fromStoryIndex, input.fromCell);
        const goal = this.graph.getNodeForCell(input.toStoryIndex, input.toCell);
        if (!start || !goal) {
            return null;
        }
        const blocked = (node) => {
            if (node.id === start.id) {
                return false;
            }
            return Boolean(input.blocked?.(node) || input.occupied?.(node));
        };
        const pathEdges = this.findEdgePath(start, goal, blocked);
        if (!pathEdges) {
            return null;
        }
        const segments = this.toMovementSegments(pathEdges);
        if (this.debugEnabled && start.storyIndex !== goal.storyIndex) {
            this.logPath(start, goal, segments);
        }
        return segments;
    }
    findEdgePath(start, goal, blocked) {
        const openIds = new Set([start.id]);
        const gScore = new Map([[start.id, 0]]);
        const fScore = new Map([[start.id, this.heuristic(start, goal)]]);
        const cameFrom = new Map();
        while (openIds.size > 0) {
            const currentId = this.lowestScoreNodeId(openIds, fScore);
            if (!currentId) {
                break;
            }
            if (currentId === goal.id) {
                return this.reconstructEdges(start.id, goal.id, cameFrom);
            }
            openIds.delete(currentId);
            const current = this.graph.getNode(currentId);
            if (!current) {
                continue;
            }
            for (const edge of this.graph.getNeighbors(current, blocked)) {
                const neighbor = this.graph.getNode(edge.toNodeId);
                if (!neighbor) {
                    continue;
                }
                const tentativeGScore = (gScore.get(current.id) ?? Number.POSITIVE_INFINITY) + edge.cost;
                if (tentativeGScore >= (gScore.get(neighbor.id) ?? Number.POSITIVE_INFINITY)) {
                    continue;
                }
                cameFrom.set(neighbor.id, edge);
                gScore.set(neighbor.id, tentativeGScore);
                fScore.set(neighbor.id, tentativeGScore + this.heuristic(neighbor, goal));
                openIds.add(neighbor.id);
            }
        }
        return null;
    }
    toMovementSegments(edges) {
        const segments = [];
        for (const edge of edges) {
            const targetNode = this.graph.getNode(edge.toNodeId);
            const sourceNode = this.graph.getNode(edge.fromNodeId);
            if (!targetNode || !sourceNode) {
                continue;
            }
            if (edge.kind === "walk") {
                segments.push({
                    kind: "walk",
                    cell: targetNode.cell,
                    storyIndex: targetNode.storyIndex,
                    worldPosition: targetNode.worldPosition.clone(),
                    cost: edge.cost
                });
                continue;
            }
            if (!edge.traversalPath || !edge.stairId) {
                continue;
            }
            segments.push({
                kind: "stair",
                stairId: edge.stairId,
                fromStoryIndex: sourceNode.storyIndex,
                toStoryIndex: targetNode.storyIndex,
                toCell: targetNode.cell,
                traversalPath: edge.traversalPath.map((point) => point.clone()),
                cost: edge.cost
            });
        }
        return segments;
    }
    reconstructEdges(startNodeId, goalNodeId, cameFrom) {
        const edges = [];
        let currentNodeId = goalNodeId;
        while (currentNodeId !== startNodeId) {
            const edge = cameFrom.get(currentNodeId);
            if (!edge) {
                return [];
            }
            edges.push(edge);
            currentNodeId = edge.fromNodeId;
        }
        edges.reverse();
        return edges;
    }
    lowestScoreNodeId(openIds, fScore) {
        let bestId = null;
        let bestScore = Number.POSITIVE_INFINITY;
        for (const nodeId of openIds) {
            const score = fScore.get(nodeId) ?? Number.POSITIVE_INFINITY;
            if (score < bestScore) {
                bestId = nodeId;
                bestScore = score;
            }
        }
        return bestId;
    }
    heuristic(node, goal) {
        void node;
        void goal;
        return 0;
    }
    logPath(start, goal, segments) {
        console.debug([
            "MultiFloorPathfinder:",
            `from story ${start.storyIndex} cell ${start.cell.x}:${start.cell.z}`,
            `to story ${goal.storyIndex} cell ${goal.cell.x}:${goal.cell.z}`,
            "path:",
            ...segments.map((segment) => {
                if (segment.kind === "walk") {
                    return `walk ${segment.storyIndex}:${segment.cell.x}:${segment.cell.z}`;
                }
                return `stair ${segment.stairId} ${segment.fromStoryIndex} -> ${segment.toStoryIndex} checkpoints=${segment.traversalPath.length}`;
            })
        ].join("\n"));
    }
}
exports.MultiFloorPathfinder = MultiFloorPathfinder;
function makeMovementTargetKey(cell, storyIndex) {
    return (0, NavigationGraph_1.makeNavigationNodeId)(storyIndex, cell);
}
