import { AdvancedDynamicTexture, Button, Control, Rectangle, StackPanel, TextBlock } from "@babylonjs/gui";
import type { Scene } from "@babylonjs/core";

/**
 * Creates top HUD panel with grid debug toggle button.
 */
export class InGameHexGridDebugUi {
  private readonly texture: AdvancedDynamicTexture;
  private readonly toggleButton: Button;

  /**
   * Creates in-game top-panel HUD for hex debug controls.
   *
   * @param scene - Babylon scene.
   * @param onToggleRequested - Callback for button click.
   */
  public constructor(scene: Scene, onToggleRequested: () => void) {
    this.texture = AdvancedDynamicTexture.CreateFullscreenUI("in-game-hex-grid-ui", true, scene);

    const topPanel = new Rectangle("in-game-grid-top-panel");
    topPanel.thickness = 0;
    topPanel.height = "64px";
    topPanel.width = "100%";
    topPanel.background = "#111827AA";
    topPanel.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
    this.texture.addControl(topPanel);

    const content = new StackPanel("in-game-grid-top-panel-content");
    content.isVertical = false;
    content.height = "100%";
    content.paddingLeft = "16px";
    content.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    topPanel.addControl(content);

    this.toggleButton = Button.CreateSimpleButton("toggle-grid-debug", "On/Off Grid Debug");
    this.toggleButton.height = "38px";
    this.toggleButton.width = "220px";
    this.toggleButton.cornerRadius = 4;
    this.toggleButton.color = "#91A3C8";
    this.toggleButton.background = "#1F2937";
    this.toggleButton.thickness = 1;
    this.toggleButton.onPointerUpObservable.add(onToggleRequested);

    const text = this.toggleButton.children[0] as TextBlock;
    text.fontSize = 18;
    text.color = "#E7EDF9";

    content.addControl(this.toggleButton);
  }

  /**
   * Updates button style to reflect current debug visibility state.
   */
  public setDebugEnabled(isEnabled: boolean): void {
    this.toggleButton.background = isEnabled ? "#304D2C" : "#1F2937";
    this.toggleButton.color = isEnabled ? "#A8E6A3" : "#91A3C8";
  }

  /**
   * Disposes HUD GUI resources.
   */
  public dispose(): void {
    this.texture.dispose();
  }
}
