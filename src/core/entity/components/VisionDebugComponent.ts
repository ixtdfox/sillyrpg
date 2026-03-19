import type { Component } from "../Component";
import { HexCell } from "../../hex/HexCell";

export type VisionDebugRelation = "friendly" | "neutral" | "hostile";

export interface VisionDebugDetectedCell {
  readonly cell: HexCell;
  readonly relation: VisionDebugRelation;
}

/**
 * Stores debug-friendly perception results for overlay rendering systems.
 */
export class VisionDebugComponent implements Component {
  /** Broad-phase vision sector cells for current frame. */
  public visibleSectorCells: HexCell[];

  /** Cells containing currently visible entities, classified by relation. */
  public detectedCells: VisionDebugDetectedCell[];

  public constructor() {
    this.visibleSectorCells = [];
    this.detectedCells = [];
  }
}
