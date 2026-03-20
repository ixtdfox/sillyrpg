import type { Scene } from "@babylonjs/core";
import { AdvancedDynamicTexture, Button, Control, Rectangle, StackPanel, TextBlock } from "@babylonjs/gui";
import { CombatInputMode } from "../../../game/CombatInputMode";

export interface CombatHudCardData {
  readonly name: string;
  readonly hpText: string;
  readonly apText: string;
  readonly mpText: string;
}

/**
 * Renders combat HUD cards and action bar.
 */
export class InGameCombatHudUi {
  private readonly texture: AdvancedDynamicTexture;
  private readonly playerCardText: TextBlock;
  private readonly enemyCardText: TextBlock;
  private readonly enemyCardContainer: Rectangle;
  private readonly moveButton: Button;
  private readonly attackButton: Button;
  private readonly endTurnButton: Button;

  public constructor(
    scene: Scene,
    onMoveRequested: () => void,
    onAttackRequested: () => void,
    onEndTurnRequested: () => void
  ) {
    this.texture = AdvancedDynamicTexture.CreateFullscreenUI("in-game-combat-ui", true, scene);

    const playerCard = this.createCard("in-game-player-card", "350px", "190px");
    playerCard.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    playerCard.verticalAlignment = Control.VERTICAL_ALIGNMENT_BOTTOM;
    playerCard.left = "16px";
    playerCard.top = "-16px";
    this.texture.addControl(playerCard);

    this.playerCardText = this.createCardText("in-game-player-card-text");
    playerCard.addControl(this.playerCardText);

    const actionsPanel = new StackPanel("in-game-player-actions");
    actionsPanel.isVertical = false;
    actionsPanel.width = "324px";
    actionsPanel.height = "48px";
    actionsPanel.verticalAlignment = Control.VERTICAL_ALIGNMENT_BOTTOM;
    actionsPanel.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    actionsPanel.paddingLeft = "12px";
    actionsPanel.paddingBottom = "10px";
    actionsPanel.spacing = 8;
    playerCard.addControl(actionsPanel);

    this.moveButton = this.createActionButton("in-game-action-move", "Move", onMoveRequested);
    actionsPanel.addControl(this.moveButton);

    this.attackButton = this.createActionButton("in-game-action-attack", "Attack", onAttackRequested);
    actionsPanel.addControl(this.attackButton);

    this.endTurnButton = this.createActionButton("in-game-end-turn", "End Turn", onEndTurnRequested);
    actionsPanel.addControl(this.endTurnButton);

    this.enemyCardContainer = this.createCard("in-game-enemy-card", "280px", "150px");
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

  public setActionState(isPlayersTurn: boolean, inputMode: CombatInputMode): void {
    this.moveButton.isVisible = isPlayersTurn;
    this.attackButton.isVisible = isPlayersTurn;
    this.endTurnButton.isVisible = isPlayersTurn;

    this.moveButton.isEnabled = isPlayersTurn;
    this.attackButton.isEnabled = isPlayersTurn;
    this.endTurnButton.isEnabled = isPlayersTurn;

    this.updateModeButtonStyle(this.moveButton, inputMode === CombatInputMode.MOVE);
    this.updateModeButtonStyle(this.attackButton, inputMode === CombatInputMode.ATTACK);
  }

  public dispose(): void {
    this.texture.dispose();
  }

  private createCard(name: string, width: string, height: string): Rectangle {
    const card = new Rectangle(name);
    card.width = width;
    card.height = height;
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

  private createActionButton(name: string, label: string, onClick: () => void): Button {
    const button = Button.CreateSimpleButton(name, label);
    button.width = "100px";
    button.height = "40px";
    button.thickness = 1;
    button.cornerRadius = 4;
    button.color = "#E5E7EB";
    button.background = "#1F2937";
    button.onPointerUpObservable.add(onClick);
    return button;
  }

  private updateModeButtonStyle(button: Button, isActive: boolean): void {
    button.background = isActive ? "#2563EB" : "#1F2937";
    button.color = isActive ? "#FFFFFF" : "#E5E7EB";
    button.thickness = isActive ? 2 : 1;
  }

  private formatCardText(data: CombatHudCardData): string {
    return `${data.name}\n${data.hpText}\n${data.apText}\n${data.mpText}`;
  }
}
