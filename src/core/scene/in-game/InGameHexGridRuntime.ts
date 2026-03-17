import type { AbstractMesh, Scene } from "@babylonjs/core";
import { HexGrid } from "../../hex/HexGrid";
import { HexGridOverlay } from "../../hex/HexGridOverlay";
import { HexGroundPickerController } from "../../hex/HexGroundPickerController";
import { HexGridDebugState } from "./HexGridDebugState";
import { InGameHexGridDebugUi } from "./InGameHexGridDebugUi";

/**
 * Wires hex grid logic, renderer, picker controller, and debug UI state.
 */
export class InGameHexGridRuntime {
  private static readonly DEFAULT_HEX_SIZE = 1;

  private readonly debugState: HexGridDebugState;
  private readonly overlay: HexGridOverlay;
  private readonly pickerController: HexGroundPickerController;
  private readonly debugUi: InGameHexGridDebugUi;

  /**
   * Creates complete in-game hex runtime module.
   *
   * @param scene - Scene with loaded district and ground.
   * @param groundMesh - Ground mesh used for sizing and picking.
   */
  public constructor(scene: Scene, groundMesh: AbstractMesh) {
    const boundingBox = groundMesh.getBoundingInfo().boundingBox;
    const bounds = HexGrid.deriveBoundsFromWorldRect(
      boundingBox.centerWorld,
      InGameHexGridRuntime.DEFAULT_HEX_SIZE,
      boundingBox.minimumWorld.x,
      boundingBox.maximumWorld.x,
      boundingBox.minimumWorld.z,
      boundingBox.maximumWorld.z
    );

    const grid = new HexGrid(boundingBox.centerWorld, InGameHexGridRuntime.DEFAULT_HEX_SIZE, bounds);

    this.overlay = new HexGridOverlay(scene, grid);
    this.debugState = new HexGridDebugState(false);
    this.overlay.setDebugVisible(this.debugState.getIsDebugEnabled());

    this.pickerController = new HexGroundPickerController(scene, groundMesh, grid, this.overlay);

    this.debugUi = new InGameHexGridDebugUi(scene, () => {
      const isEnabled = this.debugState.toggle();
      this.overlay.setDebugVisible(isEnabled);
      this.debugUi.setDebugEnabled(isEnabled);
    });
    this.debugUi.setDebugEnabled(this.debugState.getIsDebugEnabled());
  }

  /**
   * Disposes all runtime components.
   */
  public dispose(): void {
    this.pickerController.dispose();
    this.overlay.dispose();
    this.debugUi.dispose();
  }
}
