import { TurnBasedCombatState } from "../../../game/TurnBasedCombatState";
import { WorldModeController } from "../../../game/WorldModeController";
import { CombatParticipantResolver } from "./CombatParticipantResolver";

/**
 * Starts turn-based encounters while keeping perception systems decoupled from combat orchestration.
 */
export class CombatEncounterCoordinator {
  private readonly worldModeController: WorldModeController;
  private readonly combatState: TurnBasedCombatState;
  private readonly participantResolver: CombatParticipantResolver;

  public constructor(
    worldModeController: WorldModeController,
    combatState: TurnBasedCombatState,
    participantResolver: CombatParticipantResolver
  ) {
    this.worldModeController = worldModeController;
    this.combatState = combatState;
    this.participantResolver = participantResolver;
  }

  public tryStartCombatFromDetection(initiatorEntityId: string, targetEntityId: string): boolean {
    if (this.worldModeController.isTurnBased()) {
      return false;
    }

    const participants = this.participantResolver.resolveParticipants(initiatorEntityId, targetEntityId);
    if (participants.length < 2) {
      return false;
    }

    this.combatState.startCombat(participants, initiatorEntityId);
    return true;
  }
}
