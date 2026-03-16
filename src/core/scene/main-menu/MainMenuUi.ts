import { AdvancedDynamicTexture, Button, Control, Rectangle, StackPanel, TextBlock } from "@babylonjs/gui";
import type { MainMenuAction } from "./MainMenuAction";
import { MainMenuCommand } from "./MainMenuCommand";

/**
 * Encapsulates Babylon GUI creation and updates for the main menu.
 * It builds all widgets and exposes refresh methods for text and selection styles.
 */
export class MainMenuUi {
  /** Fullscreen GUI texture hosting all controls. */
  private readonly texture: AdvancedDynamicTexture;

  /** Localized title text control. */
  private readonly titleText: TextBlock;

  /** Localized subtitle text control. */
  private readonly subtitleText: TextBlock;

  /** Localized section label control. */
  private readonly sectionLabelText: TextBlock;

  /** Language switch button for English. */
  private readonly engButton: Button;

  /** Language switch button for Russian. */
  private readonly ruButton: Button;

  /** Mapping from action command to its GUI button control. */
  private readonly actionButtons: Map<MainMenuCommand, Button>;

  /**
   * Builds and wires the complete main menu GUI controls.
   *
   * @param scene - Babylon scene that owns the GUI texture.
   * @param actions - Ordered menu actions to render.
   * @param onCommand - Callback invoked when any GUI control triggers a command.
   * @param onActionHover - Callback invoked when a menu action is hovered by mouse.
   */
  public constructor(
      scene: import("@babylonjs/core").Scene,
      actions: MainMenuAction[],
      onCommand: (command: MainMenuCommand) => void,
      onActionHover: (command: MainMenuCommand) => void
  ) {
    this.texture = AdvancedDynamicTexture.CreateFullscreenUI("main-menu-ui", true, scene);
    this.actionButtons = new Map<MainMenuCommand, Button>();

    const root = new Rectangle("root");
    root.thickness = 0;
    root.background = "#0A0E1A";
    this.texture.addControl(root);

    const topPanel = new StackPanel("title-panel");
    topPanel.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
    topPanel.top = "50px";
    topPanel.isVertical = true;
    topPanel.width = "100%";
    root.addControl(topPanel);

    this.titleText = this.createLabel("title", "", "64px", "#F6E27A");
    this.subtitleText = this.createLabel("subtitle", "", "28px", "#CFD8EF");
    this.sectionLabelText = this.createLabel("section", "", "20px", "#9CA8C7");

    topPanel.addControl(this.titleText);
    topPanel.addControl(this.subtitleText);
    topPanel.addControl(this.sectionLabelText);

    const menuPanel = new StackPanel("menu-panel");
    menuPanel.width = "420px";
    menuPanel.isVertical = true;
    menuPanel.spacing = 10;
    menuPanel.verticalAlignment = Control.VERTICAL_ALIGNMENT_CENTER;
    root.addControl(menuPanel);

    for (const action of actions) {
      const button = this.createMenuButton(
          action.command,
          () => onCommand(action.command),
          () => onActionHover(action.command)
      );

      this.actionButtons.set(action.command, button);
      menuPanel.addControl(button);
    }

    const langPanel = new StackPanel("lang-panel");
    langPanel.isVertical = false;
    langPanel.width = "220px";
    langPanel.height = "52px";
    langPanel.spacing = 10;
    langPanel.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_RIGHT;
    langPanel.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
    langPanel.top = "20px";
    langPanel.left = "-20px";
    root.addControl(langPanel);

    this.engButton = this.createLangButton("eng-btn", () => onCommand(MainMenuCommand.SET_LANG_ENG));
    this.ruButton = this.createLangButton("ru-btn", () => onCommand(MainMenuCommand.SET_LANG_RU));
    langPanel.addControl(this.engButton);
    langPanel.addControl(this.ruButton);
  }

  /**
   * Updates all visible menu texts from the provided UI dictionary.
   *
   * @param ui - Localized text dictionary.
   * @param actions - Action metadata describing button text keys.
   * @returns No return value.
   */
  public refreshTexts(ui: Record<string, string>, actions: MainMenuAction[]): void {
    this.titleText.text = ui.title;
    this.subtitleText.text = ui.subtitle;
    this.sectionLabelText.text = ui.mainMenuLabel;

    for (const action of actions) {
      const button = this.actionButtons.get(action.command);
      const textControl = button?.children[0] as TextBlock | undefined;
      if (textControl) {
        textControl.text = ui[action.labelKey] ?? action.labelKey;
      }
    }

    (this.engButton.children[0] as TextBlock).text = ui.langEng;
    (this.ruButton.children[0] as TextBlock).text = ui.langRus;
  }

  /**
   * Applies visual highlight to the currently selected action.
   *
   * @param selectedCommand - Command of the selected menu item.
   * @returns No return value.
   */
  public updateSelection(selectedCommand: MainMenuCommand): void {
    for (const [command, button] of this.actionButtons.entries()) {
      const isSelected = command === selectedCommand;
      button.thickness = isSelected ? 2 : 1;
      button.color = isSelected ? "#F6E27A" : "#46506A";
      button.background = isSelected ? "#1D2740" : "#121A2B";
      const label = button.children[0] as TextBlock;
      label.color = isSelected ? "#FFF3B2" : "#D9E0F0";
    }
  }

  /**
   * Releases all GUI resources for this menu.
   *
   * @returns No return value.
   */
  public dispose(): void {
    this.texture.dispose();
  }

  /**
   * Creates a standardized static text label control.
   *
   * @param name - Control name.
   * @param text - Initial text value.
   * @param fontSize - CSS font size string.
   * @param color - Text color.
   * @returns Configured text block.
   */
  private createLabel(name: string, text: string, fontSize: string, color: string): TextBlock {
    const label = new TextBlock(name, text);
    label.height = "40px";
    label.fontSize = fontSize;
    label.color = color;
    return label;
  }

  /**
   * Creates a standardized main menu action button.
   *
   * @param name - Button name.
   * @param onClick - Click callback.
   * @param onHover - Hover callback.
   * @returns Configured Babylon GUI button.
   */
  private createMenuButton(name: string, onClick: () => void, onHover: () => void): Button {
    const button = Button.CreateSimpleButton(name, "");
    button.height = "52px";
    button.width = 0.9;
    button.color = "#46506A";
    button.thickness = 1;
    button.background = "#121A2B";
    button.cornerRadius = 4;

    button.onPointerUpObservable.add(onClick);
    button.onPointerEnterObservable.add(onHover);

    const text = button.children[0] as TextBlock;
    text.fontSize = 22;
    text.color = "#D9E0F0";

    return button;
  }

  /**
   * Creates a language switch button with shared styling.
   *
   * @param name - Button name.
   * @param onClick - Click callback.
   * @returns Configured language button.
   */
  private createLangButton(name: string, onClick: () => void): Button {
    const button = Button.CreateSimpleButton(name, "");
    button.height = "46px";
    button.width = "100px";
    button.color = "#6881B8";
    button.thickness = 1;
    button.background = "#0F1628";
    button.cornerRadius = 4;
    button.onPointerUpObservable.add(onClick);

    const text = button.children[0] as TextBlock;
    text.fontSize = 18;
    text.color = "#DFE8FF";

    return button;
  }
}