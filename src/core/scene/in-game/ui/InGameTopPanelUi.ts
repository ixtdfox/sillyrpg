import type { Scene } from "@babylonjs/core";
import { AdvancedDynamicTexture, Control, Rectangle, StackPanel } from "@babylonjs/gui";
import { HexGridDebugToggleControl } from "../../../hex/debug/HexGridDebugToggleControl";

/**
 * Owns the in-game root HUD top panel and assembles top-level controls.
 */
export class InGameTopPanelUi {
  private readonly texture: AdvancedDynamicTexture;
  private readonly hexGridDebugControl: HexGridDebugToggleControl;

  /**
   * Creates root top-panel HUD and mounts hex debug widget into it.
   *
   * @param scene - Active in-game scene.
   * @param onHexGridToggleRequested - Callback for hex debug toggle clicks.
   */
  public constructor(scene: Scene, onHexGridToggleRequested: () => void) {
    this.texture = AdvancedDynamicTexture.CreateFullscreenUI("in-game-ui", true, scene);

    const topPanel = new Rectangle("in-game-top-panel");
    topPanel.thickness = 0;
    topPanel.height = "64px";
    topPanel.width = "100%";
    topPanel.background = "#111827AA";
    topPanel.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
    this.texture.addControl(topPanel);

    const content = new StackPanel("in-game-top-panel-content");
    content.isVertical = false;
    content.height = "100%";
    content.paddingLeft = "16px";
    content.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    topPanel.addControl(content);

    this.hexGridDebugControl = new HexGridDebugToggleControl(onHexGridToggleRequested);
    content.addControl(this.hexGridDebugControl.getControl());
  }

  /**
   * Updates hex debug control visual state.
   */
  public setHexGridDebugEnabled(isEnabled: boolean): void {
    this.hexGridDebugControl.setDebugEnabled(isEnabled);
  }

  /**
   * Disposes top-level in-game HUD resources.
   */
  public dispose(): void {
    this.texture.dispose();
  }
}
