import { WorldMode } from "./WorldMode";

/**
 * Stores and exposes the active world gameplay mode.
 */
export class WorldModeController {
  private currentMode: WorldMode;

  public constructor(initialMode: WorldMode = WorldMode.RUNTIME) {
    this.currentMode = initialMode;
  }

  public getMode(): WorldMode {
    return this.currentMode;
  }

  public isTurnBased(): boolean {
    return this.currentMode === WorldMode.TURN_BASED;
  }

  public setMode(nextMode: WorldMode): void {
    this.currentMode = nextMode;
  }
}
