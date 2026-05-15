import type { Scene } from "@babylonjs/core";
import { AdvancedDynamicTexture, Button, Control, Rectangle, StackPanel, TextBlock } from "@babylonjs/gui";
import { GridDebugToggleControl } from "../../../grid/debug/GridDebugToggleControl";
import { PhoneDialogUi } from "./phone/PhoneDialogUi";

/**
 * Owns the in-game root HUD top panel and assembles top-level controls.
 */
export class InGameTopPanelUi {
  private readonly texture: AdvancedDynamicTexture;
  private readonly gridDebugControl: GridDebugToggleControl;
  private readonly combatBanner: Rectangle;
  private readonly phoneDialogUi: PhoneDialogUi;
  private readonly phoneToggleButton: Button;
  private readonly terrainLodDebugButton: Button;
  private readonly performanceDebugButton: Button;

  /**
   * Creates root top-panel HUD and mounts grid debug widget into it.
   *
   * @param scene - Active in-game scene.
   * @param onRectGridToggleRequested - Callback for grid debug toggle clicks.
   */
  public constructor(
    scene: Scene,
    onRectGridToggleRequested: () => void,
    onTerrainLodDebugToggleRequested?: () => void,
    onPerformanceDebugToggleRequested?: () => void
  ) {
    this.texture = AdvancedDynamicTexture.CreateFullscreenUI("in-game-ui", true, scene);

    const topPanel = new Rectangle("in-game-top-panel");
    topPanel.thickness = 0;
    topPanel.height = "64px";
    topPanel.width = "100%";
    topPanel.background = "#111827AA";
    topPanel.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
    topPanel.zIndex = 20;
    this.texture.addControl(topPanel);

    const content = new StackPanel("in-game-top-panel-content");
    content.isVertical = false;
    content.height = "100%";
    content.paddingLeft = "16px";
    content.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    topPanel.addControl(content);

    this.gridDebugControl = new GridDebugToggleControl(onRectGridToggleRequested);
    content.addControl(this.gridDebugControl.getControl());

    this.terrainLodDebugButton = Button.CreateSimpleButton("in-game-terrain-lod-debug-toggle", "LOD Grid");
    this.terrainLodDebugButton.width = "92px";
    this.terrainLodDebugButton.height = "38px";
    this.terrainLodDebugButton.cornerRadius = 4;
    this.terrainLodDebugButton.color = "#E7EDF9";
    this.terrainLodDebugButton.background = "#1F2937";
    this.terrainLodDebugButton.thickness = 1;
    this.terrainLodDebugButton.paddingLeft = "8px";
    this.terrainLodDebugButton.fontSize = 14;
    this.terrainLodDebugButton.isVisible = onTerrainLodDebugToggleRequested !== undefined;
    this.terrainLodDebugButton.isEnabled = onTerrainLodDebugToggleRequested !== undefined;
    this.terrainLodDebugButton.onPointerUpObservable.add(() => {
      onTerrainLodDebugToggleRequested?.();
    });
    content.addControl(this.terrainLodDebugButton);

    this.performanceDebugButton = Button.CreateSimpleButton("in-game-performance-debug-toggle", "Perf");
    this.performanceDebugButton.width = "66px";
    this.performanceDebugButton.height = "38px";
    this.performanceDebugButton.cornerRadius = 4;
    this.performanceDebugButton.color = "#E7EDF9";
    this.performanceDebugButton.background = "#1F2937";
    this.performanceDebugButton.thickness = 1;
    this.performanceDebugButton.paddingLeft = "8px";
    this.performanceDebugButton.fontSize = 14;
    this.performanceDebugButton.isVisible = onPerformanceDebugToggleRequested !== undefined;
    this.performanceDebugButton.isEnabled = onPerformanceDebugToggleRequested !== undefined;
    this.performanceDebugButton.onPointerUpObservable.add(() => {
      onPerformanceDebugToggleRequested?.();
    });
    content.addControl(this.performanceDebugButton);

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
    const phoneDialogControl = this.phoneDialogUi.getRootControl();
    phoneDialogControl.zIndex = 10;
    this.texture.addControl(phoneDialogControl);
  }

  public getTexture(): AdvancedDynamicTexture {
    return this.texture;
  }

  /**
   * Updates grid debug control visual state.
   */
  public setRectGridDebugEnabled(isEnabled: boolean): void {
    this.gridDebugControl.setDebugEnabled(isEnabled);
  }

  public setTerrainLodDebugAvailable(isAvailable: boolean): void {
    this.terrainLodDebugButton.isVisible = isAvailable;
    this.terrainLodDebugButton.isEnabled = isAvailable;
  }

  public setTerrainLodDebugEnabled(isEnabled: boolean): void {
    this.terrainLodDebugButton.background = isEnabled ? "#2563EB" : "#1F2937";
    this.terrainLodDebugButton.color = isEnabled ? "#FFFFFF" : "#E7EDF9";
  }

  public setPerformanceDebugEnabled(isEnabled: boolean): void {
    this.performanceDebugButton.background = isEnabled ? "#D97706" : "#1F2937";
    this.performanceDebugButton.color = isEnabled ? "#FFFFFF" : "#E7EDF9";
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
