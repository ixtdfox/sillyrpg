import type { Component } from "../Component";

/**
 * Turn-based combat resources and derived combat parameters.
 */
export class CombatStatsComponent implements Component {
  public initiative: number;
  public apPerTurn: number;
  public mpPerTurn: number;
  public currentAp: number;
  public currentMp: number;
  public armor: number;

  public constructor(initiative: number, apPerTurn: number, mpPerTurn: number, armor: number) {
    this.initiative = initiative;
    this.apPerTurn = apPerTurn;
    this.mpPerTurn = mpPerTurn;
    this.currentAp = apPerTurn;
    this.currentMp = mpPerTurn;
    this.armor = armor;
  }

  public resetTurnResources(): void {
    this.currentAp = this.apPerTurn;
    this.currentMp = this.mpPerTurn;
  }
}
