import type { Entity } from "../../Entity";
import type { EntityManager } from "../../EntityManager";
import { CombatStatsComponent } from "../../components/CombatStatsComponent";
import { HexPathMovementComponent } from "../../components/HexPathMovementComponent";
import { HexPositionComponent } from "../../components/HexPositionComponent";
import { RelationsComponent } from "../../components/RelationsComponent";
import { VitalsComponent } from "../../components/VitalsComponent";
import { HexCell } from "../../../hex/HexCell";
import { CombatAttackTargetingService } from "./CombatAttackTargetingService";
import { HexSpatialIndex } from "../hex/HexSpatialIndex";

export type AiTurnStepResult = "in_progress" | "completed";

/**
 * Basic AI turn handler: try melee attack, else move toward nearest hostile target.
 */
export class BasicCombatAiService {
  private readonly entityManager: EntityManager;
  private readonly attackTargetingService: CombatAttackTargetingService;
  private readonly spatialIndex: HexSpatialIndex;
  private readonly movingAiEntities: Set<string>;

  public constructor(
    entityManager: EntityManager,
    attackTargetingService: CombatAttackTargetingService,
    spatialIndex: HexSpatialIndex
  ) {
    this.entityManager = entityManager;
    this.attackTargetingService = attackTargetingService;
    this.spatialIndex = spatialIndex;
    this.movingAiEntities = new Set<string>();
  }

  public resolveTurnStep(activeAiEntityId: string, participantIds: readonly string[]): AiTurnStepResult {
    const activeAi = this.entityManager.getEntity(activeAiEntityId);
    if (!activeAi) {
      return "completed";
    }

    const movement = activeAi.tryGetComponent(HexPathMovementComponent);
    if (this.movingAiEntities.has(activeAiEntityId)) {
      if (movement?.isMoving) {
        return "in_progress";
      }

      this.movingAiEntities.delete(activeAiEntityId);
      return "completed";
    }

    const target = this.findNearestHostileTarget(activeAi, participantIds);
    if (!target) {
      return "completed";
    }

    const attackResult = this.attackTargetingService.tryPerformMeleeAttack(activeAiEntityId, target.getId());
    if (attackResult.success) {
      return "completed";
    }

    const activeStats = activeAi.tryGetComponent(CombatStatsComponent);
    const activeHexPosition = activeAi.tryGetComponent(HexPositionComponent);
    const targetHexPosition = target.tryGetComponent(HexPositionComponent);

    if (!activeStats || !activeHexPosition || !targetHexPosition) {
      return "completed";
    }

    if (activeStats.currentMp <= 0 || !movement) {
      return "completed";
    }

    const approachCell = this.resolveApproachCell(activeAi.getId(), activeHexPosition.currentCell, targetHexPosition.currentCell);
    if (!approachCell) {
      return "completed";
    }

    activeHexPosition.targetCell = approachCell;
    movement.resetPathState();
    this.movingAiEntities.add(activeAiEntityId);
    return "in_progress";
  }

  private findNearestHostileTarget(activeAi: Entity, participantIds: readonly string[]): Entity | null {
    const activeRelations = activeAi.tryGetComponent(RelationsComponent);
    const activeHexPosition = activeAi.tryGetComponent(HexPositionComponent);

    if (!activeRelations || !activeHexPosition) {
      return null;
    }

    const aliveHostiles: Entity[] = [];

    for (const participantId of participantIds) {
      if (participantId === activeAi.getId()) {
        continue;
      }

      const participant = this.entityManager.getEntity(participantId);
      if (!participant) {
        continue;
      }

      if (!activeRelations.isHostileTowards(participantId)) {
        continue;
      }

      const vitals = participant.tryGetComponent(VitalsComponent);
      if (!vitals || vitals.hp.current <= 0) {
        continue;
      }

      if (!participant.hasComponent(HexPositionComponent)) {
        continue;
      }

      aliveHostiles.push(participant);
    }

    if (aliveHostiles.length === 0) {
      return null;
    }

    aliveHostiles.sort((first, second) => {
      const firstCell = first.getComponent(HexPositionComponent).currentCell;
      const secondCell = second.getComponent(HexPositionComponent).currentCell;
      const firstDistance = activeHexPosition.currentCell.distance(firstCell);
      const secondDistance = activeHexPosition.currentCell.distance(secondCell);
      return firstDistance - secondDistance;
    });

    return aliveHostiles[0] ?? null;
  }
  private resolveApproachCell(activeAiEntityId: string, activeCell: HexCell, targetCell: HexCell): HexCell | null {
    const candidateCells = [
      new HexCell(targetCell.q + 1, targetCell.r),
      new HexCell(targetCell.q - 1, targetCell.r),
      new HexCell(targetCell.q, targetCell.r + 1),
      new HexCell(targetCell.q, targetCell.r - 1),
      new HexCell(targetCell.q + 1, targetCell.r - 1),
      new HexCell(targetCell.q - 1, targetCell.r + 1),
    ];

    const unoccupiedCandidates = candidateCells.filter((cell) => {
      const occupants = this.spatialIndex.getEntitiesAt(cell);
      return occupants.length === 0 || occupants.every((occupantId) => occupantId === activeAiEntityId);
    });

    if (unoccupiedCandidates.length === 0) {
      return null;
    }

    unoccupiedCandidates.sort((first, second) => {
      const firstDistance = activeCell.distance(first);
      const secondDistance = activeCell.distance(second);
      return firstDistance - secondDistance;
    });

    return unoccupiedCandidates[0] ?? null;
  }
}
