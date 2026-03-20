import type { Scene } from "@babylonjs/core";
import { AdvancedDynamicTexture, Button, Control, Rectangle, StackPanel, TextBlock } from "@babylonjs/gui";

export interface CombatHudCardData {
  readonly name: string;
  readonly hpText: string;
  readonly apText: string;
  readonly mpText: string;
}

/**
 * Renders combat HUD cards and turn action button.
 */
export class InGameCombatHudUi {
  private readonly texture: AdvancedDynamicTexture;
  private readonly playerCardText: TextBlock;
  private readonly enemyCardText: TextBlock;
  private readonly enemyCardContainer: Rectangle;
  private readonly endTurnButton: Button;

  public constructor(scene: Scene, onEndTurnRequested: () => void) {
    this.texture = AdvancedDynamicTexture.CreateFullscreenUI("in-game-combat-ui", true, scene);

    const playerCard = this.createCard("in-game-player-card");
    playerCard.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    playerCard.verticalAlignment = Control.VERTICAL_ALIGNMENT_BOTTOM;
    playerCard.left = "16px";
    playerCard.top = "-16px";
    this.texture.addControl(playerCard);

    this.playerCardText = this.createCardText("in-game-player-card-text");
    playerCard.addControl(this.playerCardText);

    const actionsPanel = new StackPanel("in-game-player-actions");
    actionsPanel.isVertical = true;
    actionsPanel.width = "100%";
    actionsPanel.height = "56px";
    actionsPanel.verticalAlignment = Control.VERTICAL_ALIGNMENT_BOTTOM;
    actionsPanel.paddingTop = "84px";
    playerCard.addControl(actionsPanel);

    this.endTurnButton = Button.CreateSimpleButton("in-game-end-turn", "End Turn");
    this.endTurnButton.width = "140px";
    this.endTurnButton.height = "40px";
    this.endTurnButton.thickness = 1;
    this.endTurnButton.color = "#E5E7EB";
    this.endTurnButton.background = "#1F2937";
    this.endTurnButton.cornerRadius = 4;
    this.endTurnButton.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    this.endTurnButton.onPointerUpObservable.add(onEndTurnRequested);
    actionsPanel.addControl(this.endTurnButton);

    this.enemyCardContainer = this.createCard("in-game-enemy-card");
    this.enemyCardContainer.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_RIGHT;
    this.enemyCardContainer.verticalAlignment = Control.VERTICAL_ALIGNMENT_BOTTOM;
    this.enemyCardContainer.left = "-16px";
    this.enemyCardContainer.top = "-16px";
    this.enemyCardContainer.isVisible = false;
    this.texture.addControl(this.enemyCardContainer);

    this.enemyCardText = this.createCardText("in-game-enemy-card-text");
    this.enemyCardContainer.addControl(this.enemyCardText);
  }

  public setPlayerCard(data: CombatHudCardData): void {
    this.playerCardText.text = this.formatCardText(data);
  }

  public setHoveredEnemyCard(data: CombatHudCardData | null): void {
    this.enemyCardContainer.isVisible = Boolean(data);
    if (!data) {
      return;
    }

    this.enemyCardText.text = this.formatCardText(data);
  }

  public setEndTurnVisible(isVisible: boolean): void {
    this.endTurnButton.isVisible = isVisible;
    this.endTurnButton.isEnabled = isVisible;
  }

  public dispose(): void {
    this.texture.dispose();
  }

  private createCard(name: string): Rectangle {
    const card = new Rectangle(name);
    card.width = "280px";
    card.height = "150px";
    card.thickness = 1;
    card.cornerRadius = 6;
    card.color = "#9CA3AF";
    card.background = "#111827D9";
    return card;
  }

  private createCardText(name: string): TextBlock {
    const text = new TextBlock(name, "");
    text.fontSize = 20;
    text.color = "#F3F4F6";
    text.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    text.textVerticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
    text.paddingLeft = "12px";
    text.paddingTop = "10px";
    text.lineSpacing = "4px";
    return text;
  }

  private formatCardText(data: CombatHudCardData): string {
    return `${data.name}\n${data.hpText}\n${data.apText}\n${data.mpText}`;
  }
}
