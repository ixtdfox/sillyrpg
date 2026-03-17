import type { AbstractMesh, Scene } from "@babylonjs/core";
import { HexCell } from "./HexCell";
import { HexGrid } from "./HexGrid";
import { HexGridOverlay } from "./HexGridOverlay";

/**
 * Integrates mouse picking with logical hex snapping and hovered-cell highlight.
 */
export class HexGroundPickerController {
  private readonly scene: Scene;
  private readonly isGroundPick: (mesh: AbstractMesh) => boolean;
  private readonly grid: HexGrid;
  private readonly overlay: HexGridOverlay;
  private hoveredCell: HexCell | null;

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

    this.scene.onBeforeRenderObservable.add(this.updateHoverFromPointer);
  }

  public dispose(): void {
    this.scene.onBeforeRenderObservable.removeCallback(this.updateHoverFromPointer);
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
      this.overlay.hideHoveredCell();
      return;
    }

    const nextCell = this.grid.worldToCell(pickResult.pickedPoint);
    if (!this.grid.contains(nextCell)) {
      this.hoveredCell = null;
      this.overlay.hideHoveredCell();
      return;
    }

    if (this.hoveredCell?.equals(nextCell)) {
      return;
    }

    this.hoveredCell = nextCell;
    this.overlay.setHoveredCell(nextCell);
  };
}
