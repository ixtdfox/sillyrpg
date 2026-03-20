import { Scene as BabylonScene } from "@babylonjs/core";
import type { Entity } from "../../Entity";
import type { EntityManager } from "../../EntityManager";
import type { System } from "../../System";
import { LocalPlayerComponent } from "../../components/LocalPlayerComponent";
import { RelationsComponent } from "../../components/RelationsComponent";
import { getInGameSceneRuntimeContext, type InGameSceneRuntimeContext } from "../../../scene/in-game/InGameSceneRuntimeContext";
import { TurnBasedCombatState } from "../../../game/TurnBasedCombatState";
import { WorldModeController } from "../../../game/WorldModeController";
import { HexSpatialIndex } from "../hex/HexSpatialIndex";
import { HostilityResolver } from "../hex/HostilityResolver";

/**
 * Resolves currently hovered hostile entity id for combat HUD.
 */
export class HoveredCombatTargetSystem implements System {
  private readonly entityManager: EntityManager;
  private readonly spatialIndex: HexSpatialIndex;
  private readonly worldModeController: WorldModeController;
  private readonly combatState: TurnBasedCombatState;
  private runtimeContext: InGameSceneRuntimeContext | null;

  public constructor(
    entityManager: EntityManager,
    spatialIndex: HexSpatialIndex,
    worldModeController: WorldModeController,
    combatState: TurnBasedCombatState
  ) {
    this.entityManager = entityManager;
    this.spatialIndex = spatialIndex;
    this.worldModeController = worldModeController;
    this.combatState = combatState;
    this.runtimeContext = null;
  }

  public setScene(scene: BabylonScene | null): void {
    this.runtimeContext = scene ? getInGameSceneRuntimeContext(scene) : null;
    this.combatState.setHoveredHostileEntityId(null);
  }

  public update(_deltaSeconds: number): void {
    if (!this.runtimeContext || !this.worldModeController.isTurnBased()) {
      this.combatState.setHoveredHostileEntityId(null);
      return;
    }

    const localPlayer = this.resolveLocalPlayer();
    if (!localPlayer || !localPlayer.hasComponent(RelationsComponent)) {
      this.combatState.setHoveredHostileEntityId(null);
      return;
    }

    const hoveredCell = this.runtimeContext.hexGridRuntime.getHoveredCell();
    if (!hoveredCell) {
      this.combatState.setHoveredHostileEntityId(null);
      return;
    }

    const hoveredEntityIds = this.spatialIndex.getEntitiesAt(hoveredCell);
    const playerRelations = localPlayer.getComponent(RelationsComponent);

    for (const hoveredEntityId of hoveredEntityIds) {
      if (hoveredEntityId === localPlayer.getId()) {
        continue;
      }

      if (HostilityResolver.isHostileTowards(playerRelations, hoveredEntityId)) {
        this.combatState.setHoveredHostileEntityId(hoveredEntityId);
        return;
      }
    }

    this.combatState.setHoveredHostileEntityId(null);
  }

  private resolveLocalPlayer(): Entity | null {
    const players = this.entityManager.query(LocalPlayerComponent, RelationsComponent);
    return players[0] ?? null;
  }
}
