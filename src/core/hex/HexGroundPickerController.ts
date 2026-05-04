import type { AbstractMesh, Scene } from "@babylonjs/core";
import { HexCell } from "./HexCell";
import { HexGrid } from "./HexGrid";
import { HexGridOverlay } from "./HexGridOverlay";
import { parsePickableStoryMetadata } from "../navigation/BuildingNavigationMetadata";

export interface PickedNavigationCell {
  readonly cell: HexCell;
  readonly storyIndex: number;
  readonly worldPosition: import("@babylonjs/core").Vector3;
}

/**
 * Integrates mouse picking with logical hex snapping and hovered-cell highlight.
 */
export class HexGroundPickerController {
  private readonly scene: Scene;
  private readonly isGroundPick: (mesh: AbstractMesh) => boolean;
  private readonly grid: HexGrid;
  private readonly overlay: HexGridOverlay;
  private hoveredCell: HexCell | null;
  private hoveredNavigationCell: PickedNavigationCell | null;
  private warnedMissingStoryMetadataMeshIds: Set<number>;

  /**
   * Creates mouse-driven ground picking controller.
   */
  public constructor(
    scene: Scene,
    isGroundPick: (mesh: AbstractMesh) => boolean,
    grid: HexGrid,
    overlay: HexGridOverlay
  ) {
    this.scene = scene;
    this.isGroundPick = isGroundPick;
    this.grid = grid;
    this.overlay = overlay;
    this.hoveredCell = null;
    this.hoveredNavigationCell = null;
    this.warnedMissingStoryMetadataMeshIds = new Set();

    this.scene.onBeforeRenderObservable.add(this.updateHoverFromPointer);
  }

  public dispose(): void {
    this.scene.onBeforeRenderObservable.removeCallback(this.updateHoverFromPointer);
  }

  /**
   * Returns currently hovered cell derived from pointer pick, if any.
   */
  public getHoveredCell(): HexCell | null {
    return this.hoveredCell;
  }

  public getHoveredNavigationCell(fallbackStoryIndex = 0): PickedNavigationCell | null {
    if (!this.hoveredNavigationCell) {
      return null;
    }

    if (this.hoveredNavigationCell.storyIndex === Number.MIN_SAFE_INTEGER) {
      return {
        ...this.hoveredNavigationCell,
        storyIndex: fallbackStoryIndex
      };
    }

    return this.hoveredNavigationCell;
  }

  private readonly updateHoverFromPointer = (): void => {
    const pickResult = this.scene.pick(
      this.scene.pointerX,
      this.scene.pointerY,
      this.isGroundPick,
      false,
      this.scene.activeCamera ?? undefined
    );

    if (!pickResult?.hit || !pickResult.pickedPoint) {
      this.hoveredCell = null;
      this.hoveredNavigationCell = null;
      this.overlay.hideHoveredCell();
      return;
    }

    const nextCell = this.grid.worldToCell(pickResult.pickedPoint);
    if (!this.grid.contains(nextCell)) {
      this.hoveredCell = null;
      this.hoveredNavigationCell = null;
      this.overlay.hideHoveredCell();
      return;
    }

    const pickedMesh = pickResult.pickedMesh ?? null;
    const storyMetadata = pickedMesh ? parsePickableStoryMetadata(pickedMesh) : null;
    const storyIndex = storyMetadata?.storyIndex ?? Number.MIN_SAFE_INTEGER;
    if (!storyMetadata && pickedMesh && !this.warnedMissingStoryMetadataMeshIds.has(pickedMesh.uniqueId)) {
      this.warnedMissingStoryMetadataMeshIds.add(pickedMesh.uniqueId);
      console.warn(
        `[HexGroundPickerController] Missing floor story metadata on picked mesh '${pickedMesh.name}'. Falling back to current entity story.`
      );
    }

    if (this.hoveredCell?.equals(nextCell) && this.hoveredNavigationCell?.storyIndex === storyIndex) {
      return;
    }

    this.hoveredCell = nextCell;
    this.hoveredNavigationCell = {
      cell: nextCell,
      storyIndex,
      worldPosition: pickResult.pickedPoint.clone()
    };
    this.overlay.setHoveredCell(nextCell);
  };
}
