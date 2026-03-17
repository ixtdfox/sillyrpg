import type { AbstractMesh, Scene } from "@babylonjs/core";
import { HexCell } from "./HexCell";
import { HexGrid } from "./HexGrid";
import { HexGridOverlay } from "./HexGridOverlay";

/**
 * Integrates mouse picking with logical hex snapping and hovered-cell highlight.
 */
export class HexGroundPickerController {
  private readonly scene: Scene;
  private readonly groundMesh: AbstractMesh;
  private readonly grid: HexGrid;
  private readonly overlay: HexGridOverlay;
  private hoveredCell: HexCell | null;

  /**
   * Creates mouse-driven ground picking controller.
   *
   * @param scene - Scene to read pointer and perform ray picks.
   * @param groundMesh - Ground mesh used for picking.
   * @param grid - Logical hex grid.
   * @param overlay - Grid overlay visuals.
   */
  public constructor(scene: Scene, groundMesh: AbstractMesh, grid: HexGrid, overlay: HexGridOverlay) {
    this.scene = scene;
    this.groundMesh = groundMesh;
    this.grid = grid;
    this.overlay = overlay;
    this.hoveredCell = null;

    this.scene.onBeforeRenderObservable.add(this.updateHoverFromPointer);
  }

  /**
   * Releases scene callbacks.
   */
  public dispose(): void {
    this.scene.onBeforeRenderObservable.removeCallback(this.updateHoverFromPointer);
  }

  /**
   * Updates hovered hex every frame based on current mouse-ground intersection.
   */
  private readonly updateHoverFromPointer = (): void => {
    const pickResult = this.scene.pick(
      this.scene.pointerX,
      this.scene.pointerY,
      (mesh) => mesh === this.groundMesh,
      false,
      this.scene.activeCamera ?? undefined
    );

    if (!pickResult?.hit || !pickResult.pickedPoint) {
      this.hoveredCell = null;
      this.overlay.hideHoveredCell();
      return;
    }

    const nextCell = this.grid.worldToCell(pickResult.pickedPoint);

    if (this.hoveredCell?.equals(nextCell)) {
      return;
    }

    this.hoveredCell = nextCell;
    this.overlay.setHoveredCell(nextCell);
  };
}
