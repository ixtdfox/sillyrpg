import { CombatInputMode } from "./CombatInputMode";

/**
 * Centralized player combat input mode state.
 */
export class CombatInputController {
  private mode: CombatInputMode;

  public constructor(initialMode: CombatInputMode = CombatInputMode.NONE) {
    this.mode = initialMode;
  }

  public getMode(): CombatInputMode {
    return this.mode;
  }

  public setMode(mode: CombatInputMode): void {
    this.mode = mode;
  }

  public reset(): void {
    this.mode = CombatInputMode.NONE;
  }

  public isMode(mode: CombatInputMode): boolean {
    return this.mode === mode;
  }
}
