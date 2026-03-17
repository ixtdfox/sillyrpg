import { Vector3, type AbstractMesh, type Scene } from "@babylonjs/core";
import { HexGridDebugState } from "./debug/HexGridDebugState";
import { HexGridDebugUi } from "./debug/HexGridDebugUi";
import { DEFAULT_HEX_GRID_SETTINGS, type HexGridSettings } from "./HexGridSettings";
import { HexGrid } from "./HexGrid";
import { HexGridGroundMeshResolver } from "./HexGridGroundMeshResolver";
import { HexGridOverlay } from "./HexGridOverlay";
import { HexGroundPickerController } from "./HexGroundPickerController";

/**
 * Wires hex grid logic, renderer, picker controller, and debug UI state.
 */
export class HexGridRuntime {
  private readonly debugState: HexGridDebugState;
  private readonly overlay: HexGridOverlay;
  private readonly pickerController: HexGroundPickerController;
  private readonly debugUi: HexGridDebugUi;

  /**
   * Creates complete in-game hex runtime module.
   */
  public constructor(scene: Scene, settings: HexGridSettings = DEFAULT_HEX_GRID_SETTINGS) {
    const groundSelection = new HexGridGroundMeshResolver().resolve(scene);
    groundSelection.groundMesh.isPickable = true;

    const grid = this.createGridFromGround(groundSelection.groundMesh, settings);

    this.overlay = new HexGridOverlay(scene, grid, settings.overlayVerticalOffset);
    this.debugState = new HexGridDebugState(settings.debugEnabledByDefault);
    this.overlay.setDebugVisible(this.debugState.getIsDebugEnabled());

    this.pickerController = new HexGroundPickerController(scene, groundSelection.isGroundPick, grid, this.overlay);

    this.debugUi = new HexGridDebugUi(scene, () => {
      const isEnabled = this.debugState.toggle();
      this.overlay.setDebugVisible(isEnabled);
      this.debugUi.setDebugEnabled(isEnabled);
    });
    this.debugUi.setDebugEnabled(this.debugState.getIsDebugEnabled());
  }

  public dispose(): void {
    this.pickerController.dispose();
    this.overlay.dispose();
    this.debugUi.dispose();
  }

  /**
   * Builds a logical grid from the selected ground surface.
   *
   * Origin strategy: anchor at world-space minimum X/Z corner of ground AABB.
   * This avoids dependence on imported mesh pivot placement or center drift.
   */
  private createGridFromGround(groundMesh: AbstractMesh, settings: HexGridSettings): HexGrid {
    const boundingBox = groundMesh.getBoundingInfo().boundingBox;
    const origin = new Vector3(
      boundingBox.minimumWorld.x,
      boundingBox.centerWorld.y,
      boundingBox.minimumWorld.z
    );

    const bounds = HexGrid.deriveBoundsFromWorldRect(
      origin,
      settings.hexSize,
      boundingBox.minimumWorld.x,
      boundingBox.maximumWorld.x,
      boundingBox.minimumWorld.z,
      boundingBox.maximumWorld.z
    );

    return new HexGrid(origin, settings.hexSize, bounds);
  }
}
