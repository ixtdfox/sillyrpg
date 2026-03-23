import type { Scene } from "@babylonjs/core";
import { AdvancedDynamicTexture, Button, Control, Rectangle, StackPanel, TextBlock } from "@babylonjs/gui";
import { HexGridDebugToggleControl } from "../../../hex/debug/HexGridDebugToggleControl";
import { PhoneDialogUi } from "./PhoneDialogUi";

/**
 * Owns the in-game root HUD top panel and assembles top-level controls.
 */
export class InGameTopPanelUi {
  private readonly texture: AdvancedDynamicTexture;
  private readonly hexGridDebugControl: HexGridDebugToggleControl;
  private readonly combatBanner: Rectangle;
  private readonly phoneDialogUi: PhoneDialogUi;
  private readonly phoneToggleButton: Button;

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

    this.phoneToggleButton = Button.CreateSimpleButton("in-game-phone-toggle", "📱");
    this.phoneToggleButton.width = "52px";
    this.phoneToggleButton.height = "38px";
    this.phoneToggleButton.cornerRadius = 4;
    this.phoneToggleButton.color = "#E7EDF9";
    this.phoneToggleButton.background = "#1F2937";
    this.phoneToggleButton.thickness = 1;
    this.phoneToggleButton.paddingLeft = "8px";
    this.phoneToggleButton.onPointerUpObservable.add(() => {
      this.phoneDialogUi.toggleVisibility();
    });
    content.addControl(this.phoneToggleButton);

    this.combatBanner = new Rectangle("in-game-combat-banner");
    this.combatBanner.thickness = 1;
    this.combatBanner.height = "36px";
    this.combatBanner.width = "120px";
    this.combatBanner.cornerRadius = 4;
    this.combatBanner.color = "#FCA5A5";
    this.combatBanner.background = "#B91C1C";
    this.combatBanner.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
    this.combatBanner.verticalAlignment = Control.VERTICAL_ALIGNMENT_CENTER;
    this.combatBanner.isVisible = false;
    topPanel.addControl(this.combatBanner);

    const combatBannerText = new TextBlock("in-game-combat-banner-text", "Бой!");
    combatBannerText.color = "#FFFFFF";
    combatBannerText.fontSize = 20;
    this.combatBanner.addControl(combatBannerText);

    this.phoneDialogUi = new PhoneDialogUi(scene);
    this.texture.addControl(this.phoneDialogUi.getRootControl());
  }

  /**
   * Updates hex debug control visual state.
   */
  public setHexGridDebugEnabled(isEnabled: boolean): void {
    this.hexGridDebugControl.setDebugEnabled(isEnabled);
  }

  public setCombatBannerVisible(isVisible: boolean): void {
    this.combatBanner.isVisible = isVisible;
  }

  /**
   * Disposes top-level in-game HUD resources.
   */
  public dispose(): void {
    this.phoneDialogUi.dispose();
    this.texture.dispose();
  }
}
