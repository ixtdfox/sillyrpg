import type { EntityManager } from "../EntityManager";
import type { System } from "../System";
import { TurnBasedCombatState } from "../../game/TurnBasedCombatState";
import { WorldModeController } from "../../game/WorldModeController";
import { CombatInputController } from "../../game/CombatInputController";
import { CombatInputMode } from "../../game/CombatInputMode";
import { CombatStatsComponent } from "../components/CombatStatsComponent";
import { RelationsComponent } from "../components/RelationsComponent";
import { VitalsComponent } from "../components/VitalsComponent";
import { AIComponent } from "../components/AIComponent";
import { LocalPlayerComponent } from "../components/LocalPlayerComponent";
import { BasicCombatAiService } from "./combat/BasicCombatAiService";

/**
 * Drives turn progression and encounter lifetime in turn-based mode.
 */
export class TurnBasedCombatSystem implements System {
  private readonly entityManager: EntityManager;
  private readonly worldModeController: WorldModeController;
  private readonly combatState: TurnBasedCombatState;
  private readonly combatInputController: CombatInputController;
  private readonly basicCombatAiService: BasicCombatAiService;
  private turnInitializedForEntityId: string | null;

  public constructor(
    entityManager: EntityManager,
    worldModeController: WorldModeController,
    combatState: TurnBasedCombatState,
    combatInputController: CombatInputController,
    basicCombatAiService: BasicCombatAiService
  ) {
    this.entityManager = entityManager;
    this.worldModeController = worldModeController;
    this.combatState = combatState;
    this.combatInputController = combatInputController;
    this.basicCombatAiService = basicCombatAiService;
    this.turnInitializedForEntityId = null;
  }

  public update(_deltaSeconds: number): void {
    if (!this.worldModeController.isTurnBased() || !this.combatState.isActive()) {
      this.turnInitializedForEntityId = null;
      this.basicCombatAiService.clearAllTurnStates();
      this.combatInputController.reset();
      return;
    }

    this.removeDeadParticipants();

    if (this.combatState.getOrderedParticipantEntityIds().length < 2 || !this.hasHostileOpposition()) {
      this.combatState.endCombat();
      this.turnInitializedForEntityId = null;
      this.basicCombatAiService.clearAllTurnStates();
      this.combatInputController.reset();
      return;
    }

    const activeEntityId = this.combatState.getActiveEntityId();
    if (!activeEntityId) {
      this.combatState.endCombat();
      this.turnInitializedForEntityId = null;
      this.basicCombatAiService.clearAllTurnStates();
      this.combatInputController.reset();
      return;
    }

    const activeEntity = this.entityManager.getEntity(activeEntityId);
    if (!activeEntity || !activeEntity.hasComponent(CombatStatsComponent)) {
      this.combatState.removeParticipant(activeEntityId);
      this.turnInitializedForEntityId = null;
      this.basicCombatAiService.clearTurnState(activeEntityId);
      this.combatInputController.reset();
      return;
    }

    if (this.turnInitializedForEntityId !== activeEntityId) {
      activeEntity.getComponent(CombatStatsComponent).resetTurnResources();
      this.turnInitializedForEntityId = activeEntityId;
      this.setDefaultInputModeForActiveTurn(activeEntityId);
    }

    if (activeEntity.hasComponent(AIComponent)) {
      const aiStepResult = this.basicCombatAiService.resolveTurnStep(
        activeEntityId,
        this.combatState.getOrderedParticipantEntityIds()
      );
      if (aiStepResult === "completed") {
        this.basicCombatAiService.clearTurnState(activeEntityId);
        this.combatState.advanceTurn();
        this.turnInitializedForEntityId = null;
        this.combatInputController.reset();
      }
    }
  }

  public requestEndTurnForEntity(entityId: string): void {
    if (!this.combatState.isActiveEntity(entityId)) {
      return;
    }

    this.basicCombatAiService.clearTurnState(entityId);
    this.combatState.advanceTurn();
    this.turnInitializedForEntityId = null;
    this.combatInputController.reset();
  }

  private removeDeadParticipants(): void {
    const participantIds = [...this.combatState.getOrderedParticipantEntityIds()];

    for (const participantId of participantIds) {
      const participantEntity = this.entityManager.getEntity(participantId);
      if (!participantEntity || !participantEntity.hasComponent(VitalsComponent)) {
        this.combatState.removeParticipant(participantId);
        this.basicCombatAiService.clearTurnState(participantId);
        continue;
      }

      const vitals = participantEntity.getComponent(VitalsComponent);
      if (vitals.hp.current <= 0) {
        this.combatState.removeParticipant(participantId);
        this.basicCombatAiService.clearTurnState(participantId);
      }
    }
  }

  private hasHostileOpposition(): boolean {
    const participantIds = this.combatState.getOrderedParticipantEntityIds();

    for (let i = 0; i < participantIds.length; i += 1) {
      for (let j = i + 1; j < participantIds.length; j += 1) {
        const first = this.entityManager.getEntity(participantIds[i]);
        const second = this.entityManager.getEntity(participantIds[j]);

        if (!first || !second || !first.hasComponent(RelationsComponent) || !second.hasComponent(RelationsComponent)) {
          continue;
        }

        const firstRelations = first.getComponent(RelationsComponent);
        const secondRelations = second.getComponent(RelationsComponent);
        const firstToSecond = firstRelations.isHostileTowards(second.getId());
        const secondToFirst = secondRelations.isHostileTowards(first.getId());

        if (firstToSecond || secondToFirst) {
          return true;
        }
      }
    }

    return false;
  }

  private setDefaultInputModeForActiveTurn(activeEntityId: string): void {
    const localPlayer = this.entityManager.query(LocalPlayerComponent)[0] ?? null;
    if (localPlayer && localPlayer.getId() === activeEntityId) {
      this.combatInputController.setMode(CombatInputMode.MOVE);
      return;
    }

    this.combatInputController.reset();
  }
}
