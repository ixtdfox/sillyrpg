import { TurnBasedCombatState } from "../../../game/TurnBasedCombatState";
import { WorldModeController } from "../../../game/WorldModeController";
import { CombatParticipantResolver } from "./CombatParticipantResolver";
import type { EntityManager } from "../../EntityManager";
import { HexPathMovementComponent } from "../../components/HexPathMovementComponent";
import { HexPositionComponent } from "../../components/HexPositionComponent";
import { PatrolComponent } from "../../components/PatrolComponent";

/**
 * Starts turn-based encounters while keeping perception systems decoupled from combat orchestration.
 */
export class CombatEncounterCoordinator {
  private readonly worldModeController: WorldModeController;
  private readonly combatState: TurnBasedCombatState;
  private readonly participantResolver: CombatParticipantResolver;
  private readonly entityManager: EntityManager;

  public constructor(
    worldModeController: WorldModeController,
    combatState: TurnBasedCombatState,
    participantResolver: CombatParticipantResolver,
    entityManager: EntityManager
  ) {
    this.worldModeController = worldModeController;
    this.combatState = combatState;
    this.participantResolver = participantResolver;
    this.entityManager = entityManager;
  }

  public tryStartCombatFromDetection(initiatorEntityId: string, targetEntityId: string): boolean {
    if (this.worldModeController.isTurnBased()) {
      return false;
    }

    const participants = this.participantResolver.resolveParticipants(initiatorEntityId, targetEntityId);
    if (participants.length < 2) {
      return false;
    }

    this.prepareParticipantsForCombat(participants);
    this.combatState.startCombat(participants, initiatorEntityId);
    return true;
  }

  private prepareParticipantsForCombat(participantIds: readonly string[]): void {
    for (const participantId of participantIds) {
      const entity = this.entityManager.getEntity(participantId);
      if (!entity) {
        continue;
      }

      const hexPosition = entity.tryGetComponent(HexPositionComponent);
      if (hexPosition) {
        hexPosition.targetCell = null;
      }

      entity.tryGetComponent(HexPathMovementComponent)?.resetPathState();

      const patrol = entity.tryGetComponent(PatrolComponent);
      if (patrol) {
        patrol.currentPatrolTargetCell = null;
      }
    }
  }
}
