import type {
  TerrainPatchEdge,
  TerrainPatchEdgeStitchSegment,
  TerrainPatchEdgeStitchInfo,
  TerrainPatchSeamInfo,
  TerrainQuadtreeLeafSelection
} from "./TerrainQuadtreeLodTypes";

interface EdgeNeighbor {
  readonly edge: TerrainPatchEdge;
  readonly sampleStep: number;
  readonly startIndex: number;
  readonly endIndex: number;
  readonly stitchIndices: readonly number[];
}

/**
 * Resolves direct quadtree LOD neighbors from the final selected leaf set.
 */
export class TerrainQuadtreeLodSeamResolver {
  public makeLeafKey(leaf: TerrainQuadtreeLeafSelection): string {
    return `${leaf.node.id}:logical:${leaf.sampleStep}`;
  }

  public resolve(leaves: readonly TerrainQuadtreeLeafSelection[]): Map<string, TerrainPatchSeamInfo> {
    const seamInfoByLeafKey = new Map<string, TerrainPatchSeamInfo>();

    for (const leaf of leaves) {
      const edgeNeighbors = new Map<TerrainPatchEdge, EdgeNeighbor[]>();
      for (const other of leaves) {
        if (other === leaf || other.node.id === leaf.node.id) {
          continue;
        }

        const edge = this.resolveSharedEdge(leaf, other);
        if (!edge) {
          continue;
        }

        const neighbors = edgeNeighbors.get(edge) ?? [];
        const sharedRange = this.resolveSharedEdgeRange(edge, leaf, other);
        neighbors.push({
          edge,
          sampleStep: Math.max(1, Math.round(other.sampleStep)),
          ...sharedRange,
          stitchIndices: this.resolveSharedEdgeIndices(edge, leaf, other, sharedRange.startIndex, sharedRange.endIndex)
        });
        edgeNeighbors.set(edge, neighbors);
      }

      seamInfoByLeafKey.set(this.makeLeafKey(leaf), this.createSeamInfo(leaf, edgeNeighbors));
    }

    return seamInfoByLeafKey;
  }

  public applySeamCompatibility(
    leaves: readonly TerrainQuadtreeLeafSelection[]
  ): readonly TerrainQuadtreeLeafSelection[] {
    const seamInfoByLeafKey = this.resolve(leaves);
    return leaves.map((leaf) => {
      const seamInfo = seamInfoByLeafKey.get(this.makeLeafKey(leaf)) ?? {};
      return {
        ...leaf,
        seamInfo,
        buildSampleStep: this.resolveBuildSampleStep(leaf, seamInfo)
      };
    });
  }

  public resolveBuildSampleStep(leaf: TerrainQuadtreeLeafSelection, seamInfo: TerrainPatchSeamInfo): number {
    let buildSampleStep = Math.max(1, Math.round(leaf.sampleStep));
    for (const stitchInfo of Object.values(seamInfo)) {
      if (!stitchInfo) {
        continue;
      }
      buildSampleStep = Math.min(buildSampleStep, Math.max(1, Math.round(stitchInfo.neighborSampleStep)));
    }
    return buildSampleStep;
  }

  public createSignature(seamInfo: TerrainPatchSeamInfo | undefined): string {
    if (!seamInfo) {
      return "none";
    }

    return (["north", "south", "west", "east"] as const)
      .map((edge) => {
        const stitchInfo = seamInfo[edge];
        return stitchInfo
          ? `${edge}:${stitchInfo.mode}:${stitchInfo.ownSampleStep}>${stitchInfo.neighborSampleStep}:${this.createSegmentSignature(stitchInfo.segments)}`
          : `${edge}:open`;
      })
      .join("|");
  }

  private resolveSharedEdge(
    leaf: TerrainQuadtreeLeafSelection,
    other: TerrainQuadtreeLeafSelection
  ): TerrainPatchEdge | null {
    if (leaf.node.ix1 === other.node.ix0 && this.hasRangeOverlap(leaf.node.iz0, leaf.node.iz1, other.node.iz0, other.node.iz1)) {
      return "east";
    }
    if (leaf.node.ix0 === other.node.ix1 && this.hasRangeOverlap(leaf.node.iz0, leaf.node.iz1, other.node.iz0, other.node.iz1)) {
      return "west";
    }
    if (leaf.node.iz0 === other.node.iz1 && this.hasRangeOverlap(leaf.node.ix0, leaf.node.ix1, other.node.ix0, other.node.ix1)) {
      return "north";
    }
    if (leaf.node.iz1 === other.node.iz0 && this.hasRangeOverlap(leaf.node.ix0, leaf.node.ix1, other.node.ix0, other.node.ix1)) {
      return "south";
    }
    return null;
  }

  private hasRangeOverlap(leftStart: number, leftEnd: number, rightStart: number, rightEnd: number): boolean {
    return Math.max(leftStart, rightStart) < Math.min(leftEnd, rightEnd);
  }

  private resolveSharedEdgeRange(
    edge: TerrainPatchEdge,
    leaf: TerrainQuadtreeLeafSelection,
    other: TerrainQuadtreeLeafSelection
  ): Pick<EdgeNeighbor, "startIndex" | "endIndex"> {
    if (edge === "east" || edge === "west") {
      return {
        startIndex: Math.max(leaf.node.iz0, other.node.iz0),
        endIndex: Math.min(leaf.node.iz1, other.node.iz1)
      };
    }

    return {
      startIndex: Math.max(leaf.node.ix0, other.node.ix0),
      endIndex: Math.min(leaf.node.ix1, other.node.ix1)
    };
  }

  private resolveSharedEdgeIndices(
    edge: TerrainPatchEdge,
    leaf: TerrainQuadtreeLeafSelection,
    other: TerrainQuadtreeLeafSelection,
    sharedStart: number,
    sharedEnd: number
  ): readonly number[] {
    const ownRange = this.resolveEdgeAxisRange(edge, leaf);
    const otherRange = this.resolveEdgeAxisRange(this.resolveOppositeEdge(edge), other);
    return this.unionIndices(
      this.selectAxisIndices(this.buildAxisIndices(ownRange.start, ownRange.end, leaf.sampleStep), sharedStart, sharedEnd),
      this.selectAxisIndices(this.buildAxisIndices(otherRange.start, otherRange.end, other.sampleStep), sharedStart, sharedEnd)
    );
  }

  private resolveEdgeAxisRange(
    edge: TerrainPatchEdge,
    leaf: TerrainQuadtreeLeafSelection
  ): { readonly start: number; readonly end: number } {
    if (edge === "east" || edge === "west") {
      return {
        start: leaf.node.iz0,
        end: leaf.node.iz1
      };
    }

    return {
      start: leaf.node.ix0,
      end: leaf.node.ix1
    };
  }

  private resolveOppositeEdge(edge: TerrainPatchEdge): TerrainPatchEdge {
    switch (edge) {
      case "north":
        return "south";
      case "south":
        return "north";
      case "west":
        return "east";
      case "east":
        return "west";
    }
  }

  private buildAxisIndices(start: number, end: number, sampleStep: number): number[] {
    const step = Math.max(1, Math.round(sampleStep));
    const indices: number[] = [];
    for (let index = start; index < end; index += step) {
      indices.push(index);
    }
    if (indices[indices.length - 1] !== end) {
      indices.push(end);
    }
    return indices;
  }

  private selectAxisIndices(axisIndices: readonly number[], start: number, end: number): readonly number[] {
    const selected = new Set<number>([start, end]);
    for (const index of axisIndices) {
      if (index >= start && index <= end) {
        selected.add(index);
      }
    }
    return [...selected].sort((left, right) => left - right);
  }

  private unionIndices(...indexSets: readonly (readonly number[])[]): readonly number[] {
    const indices = new Set<number>();
    for (const indexSet of indexSets) {
      for (const index of indexSet) {
        indices.add(index);
      }
    }
    return [...indices].sort((left, right) => left - right);
  }

  private createSeamInfo(
    leaf: TerrainQuadtreeLeafSelection,
    edgeNeighbors: ReadonlyMap<TerrainPatchEdge, readonly EdgeNeighbor[]>
  ): TerrainPatchSeamInfo {
    const stitchInfos = new Map<TerrainPatchEdge, TerrainPatchEdgeStitchInfo>();
    const ownSampleStep = Math.max(1, Math.round(leaf.sampleStep));

    for (const [edge, neighbors] of edgeNeighbors) {
      const minSampleStep = Math.min(...neighbors.map((neighbor) => neighbor.sampleStep));
      const maxSampleStep = Math.max(...neighbors.map((neighbor) => neighbor.sampleStep));
      const segments = neighbors
        .map((neighbor): TerrainPatchEdgeStitchSegment => ({
          startIndex: neighbor.startIndex,
          endIndex: neighbor.endIndex,
          neighborSampleStep: neighbor.sampleStep,
          stitchIndices: neighbor.stitchIndices,
          mode: this.resolveSegmentMode(ownSampleStep, neighbor.sampleStep)
        }))
        .sort((left, right) => left.startIndex - right.startIndex);

      if (minSampleStep < ownSampleStep) {
        stitchInfos.set(edge, {
          edge,
          ownSampleStep,
          neighborSampleStep: minSampleStep,
          mode: "stitch-to-finer",
          segments
        });
        continue;
      }

      if (maxSampleStep > ownSampleStep) {
        stitchInfos.set(edge, {
          edge,
          ownSampleStep,
          neighborSampleStep: maxSampleStep,
          mode: "stitch-to-coarser",
          segments
        });
        continue;
      }

      stitchInfos.set(edge, {
        edge,
        ownSampleStep,
        neighborSampleStep: ownSampleStep,
        mode: "none",
        segments
      });
    }

    return {
      north: stitchInfos.get("north"),
      south: stitchInfos.get("south"),
      west: stitchInfos.get("west"),
      east: stitchInfos.get("east")
    };
  }

  private resolveSegmentMode(
    ownSampleStep: number,
    neighborSampleStep: number
  ): TerrainPatchEdgeStitchSegment["mode"] {
    if (neighborSampleStep < ownSampleStep) {
      return "stitch-to-finer";
    }
    if (neighborSampleStep > ownSampleStep) {
      return "stitch-to-coarser";
    }
    return "none";
  }

  private createSegmentSignature(segments: readonly TerrainPatchEdgeStitchSegment[] | undefined): string {
    if (!segments || segments.length === 0) {
      return "whole";
    }

    return segments
      .map((segment) => `${segment.startIndex}-${segment.endIndex}:${segment.mode}:${segment.neighborSampleStep}:${segment.stitchIndices?.join(".") ?? "step"}`)
      .join(",");
  }
}
