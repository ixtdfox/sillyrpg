import { Scene as BabylonScene } from "@babylonjs/core";
import type { System } from "../System";
import { WorldModeController } from "../../game/WorldModeController";
import { getInGameSceneRuntimeContext, type InGameSceneRuntimeContext } from "../../scene/in-game/InGameSceneRuntimeContext";

/**
 * Updates top-panel combat banner visibility from world mode.
 */
export class CombatBannerSystem implements System {
  private readonly worldModeController: WorldModeController;
  private runtimeContext: InGameSceneRuntimeContext | null;

  public constructor(worldModeController: WorldModeController) {
    this.worldModeController = worldModeController;
    this.runtimeContext = null;
  }

  public setScene(scene: BabylonScene | null): void {
    this.runtimeContext = scene ? getInGameSceneRuntimeContext(scene) : null;
    this.runtimeContext?.topPanelUi.setCombatBannerVisible(false);
  }

  public update(_deltaSeconds: number): void {
    if (!this.runtimeContext) {
      return;
    }

    this.runtimeContext.topPanelUi.setCombatBannerVisible(this.worldModeController.isTurnBased());
  }
}
