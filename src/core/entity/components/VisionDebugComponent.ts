import type { Component } from "../Component";
import { GridCell } from "../../grid/GridCell";

export type VisionDebugRelation = "friendly" | "neutral" | "hostile";

export interface VisionDebugDetectedCell {
  readonly cell: GridCell;
  readonly relation: VisionDebugRelation;
}

/**
 * Stores debug-friendly perception results for overlay rendering systems.
 */
export class VisionDebugComponent implements Component {
  /** Broad-phase vision sector cells for current frame. */
  public visibleSectorCells: GridCell[];

  /** Cells containing currently visible entities, classified by relation. */
  public detectedCells: VisionDebugDetectedCell[];

  public constructor() {
    this.visibleSectorCells = [];
    this.detectedCells = [];
  }
}
