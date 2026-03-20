import { Scene as BabylonScene } from "@babylonjs/core";
import type { Entity } from "../../Entity";
import type { EntityManager } from "../../EntityManager";
import type { System } from "../../System";
import { TurnBasedCombatState } from "../../../game/TurnBasedCombatState";
import { WorldModeController } from "../../../game/WorldModeController";
import { CombatStatsComponent } from "../../components/CombatStatsComponent";
import { IdentityComponent } from "../../components/IdentityComponent";
import { LocalPlayerComponent } from "../../components/LocalPlayerComponent";
import { VitalsComponent } from "../../components/VitalsComponent";
import { InGameCombatHudUi, type CombatHudCardData } from "../../../scene/in-game/ui/InGameCombatHudUi";
import { TurnBasedCombatSystem } from "./TurnBasedCombatSystem";

/**
 * Bridges ECS combat/player state into in-game combat HUD controls.
 */
export class CombatHudSystem implements System {
  private readonly entityManager: EntityManager;
  private readonly worldModeController: WorldModeController;
  private readonly combatState: TurnBasedCombatState;
  private readonly turnBasedCombatSystem: TurnBasedCombatSystem;
  private ui: InGameCombatHudUi | null;

  public constructor(
    entityManager: EntityManager,
    worldModeController: WorldModeController,
    combatState: TurnBasedCombatState,
    turnBasedCombatSystem: TurnBasedCombatSystem
  ) {
    this.entityManager = entityManager;
    this.worldModeController = worldModeController;
    this.combatState = combatState;
    this.turnBasedCombatSystem = turnBasedCombatSystem;
    this.ui = null;
  }

  public setScene(scene: BabylonScene | null): void {
    this.ui?.dispose();
    this.ui = null;

    if (!scene) {
      return;
    }

    this.ui = new InGameCombatHudUi(scene, () => this.requestEndTurn());
  }

  public update(_deltaSeconds: number): void {
    if (!this.ui) {
      return;
    }

    const player = this.resolveLocalPlayer();
    if (!player || !player.hasComponent(IdentityComponent) || !player.hasComponent(VitalsComponent)) {
      return;
    }

    this.ui.setPlayerCard(this.buildCardData(player));

    const hoveredHostileId = this.combatState.getHoveredHostileEntityId();
    const hoveredHostile = hoveredHostileId ? this.entityManager.getEntity(hoveredHostileId) : null;
    this.ui.setHoveredEnemyCard(hoveredHostile ? this.buildCardData(hoveredHostile) : null);

    const showEndTurn = this.worldModeController.isTurnBased() && this.combatState.isActiveEntity(player.getId());
    this.ui.setEndTurnVisible(showEndTurn);
  }

  private requestEndTurn(): void {
    const player = this.resolveLocalPlayer();
    if (!player) {
      return;
    }

    this.turnBasedCombatSystem.requestEndTurnForEntity(player.getId());
  }

  private resolveLocalPlayer(): Entity | null {
    return this.entityManager.query(LocalPlayerComponent, IdentityComponent, VitalsComponent)[0] ?? null;
  }

  private buildCardData(entity: Entity): CombatHudCardData {
    const identity = entity.getComponent(IdentityComponent);
    const vitals = entity.getComponent(VitalsComponent);
    const combatStats = entity.tryGetComponent(CombatStatsComponent);

    return {
      name: identity.name,
      hpText: `HP: ${vitals.hp.current}/${vitals.hp.max}`,
      apText: combatStats ? `AP: ${combatStats.currentAp}/${combatStats.apPerTurn}` : "AP: -",
      mpText: combatStats ? `MP: ${combatStats.currentMp}/${combatStats.mpPerTurn}` : "MP: -",
    };
  }
}
