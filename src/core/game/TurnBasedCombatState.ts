import { WorldMode } from "./WorldMode";
import { WorldModeController } from "./WorldModeController";

/**
 * Holds active turn-based combat encounter state and turn sequencing.
 */
export class TurnBasedCombatState {
  private readonly worldModeController: WorldModeController;
  private roundBaseOrder: string[];
  private orderedParticipantEntityIds: string[];
  private activeParticipantIndex: number;
  private currentRound: number;
  private initiatorEntityId: string | null;
  private hoveredHostileEntityId: string | null;

  public constructor(worldModeController: WorldModeController) {
    this.worldModeController = worldModeController;
    this.roundBaseOrder = [];
    this.orderedParticipantEntityIds = [];
    this.activeParticipantIndex = 0;
    this.currentRound = 0;
    this.initiatorEntityId = null;
    this.hoveredHostileEntityId = null;
  }

  public startCombat(participantOrderByInitiative: readonly string[], initiatorEntityId: string): void {
    this.roundBaseOrder = [...participantOrderByInitiative];
    this.orderedParticipantEntityIds = this.buildFirstRoundOrder(participantOrderByInitiative, initiatorEntityId);
    this.activeParticipantIndex = 0;
    this.currentRound = 1;
    this.initiatorEntityId = initiatorEntityId;
    this.worldModeController.setMode(WorldMode.TURN_BASED);
  }

  public endCombat(): void {
    this.roundBaseOrder = [];
    this.orderedParticipantEntityIds = [];
    this.activeParticipantIndex = 0;
    this.currentRound = 0;
    this.initiatorEntityId = null;
    this.hoveredHostileEntityId = null;
    this.worldModeController.setMode(WorldMode.RUNTIME);
  }

  public isActive(): boolean {
    return this.worldModeController.isTurnBased() && this.orderedParticipantEntityIds.length > 0;
  }

  public advanceTurn(): void {
    if (!this.isActive()) {
      return;
    }

    this.activeParticipantIndex += 1;

    if (this.activeParticipantIndex < this.orderedParticipantEntityIds.length) {
      return;
    }

    this.currentRound += 1;
    this.activeParticipantIndex = 0;
    this.orderedParticipantEntityIds = [...this.roundBaseOrder];
  }

  public removeParticipant(entityId: string): void {
    this.roundBaseOrder = this.roundBaseOrder.filter((id) => id !== entityId);

    const previousActiveEntityId = this.getActiveEntityId();
    this.orderedParticipantEntityIds = this.orderedParticipantEntityIds.filter((id) => id !== entityId);

    if (this.orderedParticipantEntityIds.length === 0) {
      return;
    }

    if (!previousActiveEntityId) {
      this.activeParticipantIndex = Math.min(this.activeParticipantIndex, this.orderedParticipantEntityIds.length - 1);
      return;
    }

    const newIndex = this.orderedParticipantEntityIds.indexOf(previousActiveEntityId);
    if (newIndex >= 0) {
      this.activeParticipantIndex = newIndex;
      return;
    }

    this.activeParticipantIndex = Math.min(this.activeParticipantIndex, this.orderedParticipantEntityIds.length - 1);
  }

  public getCurrentRound(): number {
    return this.currentRound;
  }

  public getOrderedParticipantEntityIds(): readonly string[] {
    return this.orderedParticipantEntityIds;
  }

  public getActiveEntityId(): string | null {
    return this.orderedParticipantEntityIds[this.activeParticipantIndex] ?? null;
  }

  public getInitiatorEntityId(): string | null {
    return this.initiatorEntityId;
  }

  public isActiveEntity(entityId: string): boolean {
    return this.getActiveEntityId() === entityId;
  }

  public setHoveredHostileEntityId(entityId: string | null): void {
    this.hoveredHostileEntityId = entityId;
  }

  public getHoveredHostileEntityId(): string | null {
    return this.hoveredHostileEntityId;
  }

  private buildFirstRoundOrder(participantOrderByInitiative: readonly string[], initiatorEntityId: string): string[] {
    const withoutInitiator = participantOrderByInitiative.filter((participantId) => participantId !== initiatorEntityId);
    return [initiatorEntityId, ...withoutInitiator];
  }
}
