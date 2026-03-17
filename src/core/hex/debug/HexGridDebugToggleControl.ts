import { Button, Control, TextBlock } from "@babylonjs/gui";

/**
 * Hex-specific debug toggle control that can be embedded into any parent HUD layout.
 */
export class HexGridDebugToggleControl {
  private readonly toggleButton: Button;

  /**
   * Creates reusable hex debug toggle button.
   *
   * @param onToggleRequested - Callback invoked on click.
   */
  public constructor(onToggleRequested: () => void) {
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
  }

  /**
   * Returns root GUI control for this hex debug widget.
   */
  public getControl(): Control {
    return this.toggleButton;
  }

  /**
   * Updates control visual state.
   */
  public setDebugEnabled(isEnabled: boolean): void {
    this.toggleButton.background = isEnabled ? "#304D2C" : "#1F2937";
    this.toggleButton.color = isEnabled ? "#A8E6A3" : "#91A3C8";
  }
}
