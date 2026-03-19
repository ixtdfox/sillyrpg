import { Scene as BabylonScene, Vector3 } from "@babylonjs/core";
import type { Entity } from "../Entity";
import type { EntityManager } from "../EntityManager";
import type { System } from "../System";
import { DetectableComponent } from "../components/DetectableComponent";
import { DetectableKinds } from "../components/DetectableKinds";
import { DetectionStateComponent } from "../components/DetectionStateComponent";
import { HexPositionComponent } from "../components/HexPositionComponent";
import { IdentityComponent } from "../components/IdentityComponent";
import { RelationsComponent } from "../components/RelationsComponent";
import { TransformComponent } from "../components/TransformComponent";
import { VisionComponent } from "../components/VisionComponent";
import { HexCell } from "../../hex/HexCell";
import { getInGameSceneRuntimeContext, type InGameSceneRuntimeContext } from "../../scene/in-game/InGameSceneRuntimeContext";
import { getHexCellsInVisionSector } from "../services/HexVisionSector";
import { HexSpatialIndex } from "../services/HexSpatialIndex";
import { HostilityResolver } from "../services/HostilityResolver";

/**
 * Detects hostile visible entities using a hex broad-phase and world-space cone narrow-phase.
 */
export class VisionDetectionSystem implements System {
  private readonly entityManager: EntityManager;
  private readonly spatialIndex: HexSpatialIndex;
  private runtimeContext: InGameSceneRuntimeContext | null;

  public constructor(entityManager: EntityManager, spatialIndex: HexSpatialIndex) {
    this.entityManager = entityManager;
    this.spatialIndex = spatialIndex;
    this.runtimeContext = null;
  }

  public setScene(scene: BabylonScene | null): void {
    this.runtimeContext = scene ? getInGameSceneRuntimeContext(scene) : null;
  }

  public update(_deltaSeconds: number): void {
    if (!this.runtimeContext) {
      return;
    }

    const observers = this.entityManager.query(
      VisionComponent,
      HexPositionComponent,
      RelationsComponent,
      IdentityComponent,
      DetectionStateComponent,
      TransformComponent
    );

    for (const observer of observers) {
      this.updateObserverDetection(observer);
    }
  }

  private updateObserverDetection(observer: Entity): void {
    if (!this.runtimeContext) {
      return;
    }

    const vision = observer.getComponent(VisionComponent);
    const hexPosition = observer.getComponent(HexPositionComponent);
    const relations = observer.getComponent(RelationsComponent);
    const transform = observer.getComponent(TransformComponent);
    const detectionState = observer.getComponent(DetectionStateComponent);
    const observerIdentity = observer.getComponent(IdentityComponent);

    const forward = this.resolveForwardVector(vision, transform);
    const grid = this.runtimeContext.hexGridRuntime.getGrid();
    const candidateCells = getHexCellsInVisionSector(
      grid,
      hexPosition.currentCell,
      forward,
      vision.rangeCells,
      vision.fovDegrees
    );

    const candidateEntityIds = this.spatialIndex.getEntitiesInCells(candidateCells);
    let detectedTarget: Entity | null = null;

    for (const candidateEntityId of candidateEntityIds) {
      if (candidateEntityId === observer.getId()) {
        continue;
      }

      if (!HostilityResolver.isHostileTowards(relations, candidateEntityId)) {
        continue;
      }

      const candidateEntity = this.entityManager.getEntity(candidateEntityId);
      if (!candidateEntity || !candidateEntity.hasComponent(DetectableComponent)) {
        continue;
      }

      const detectable = candidateEntity.getComponent(DetectableComponent);
      if (!detectable.isVisible || !candidateEntity.hasComponent(TransformComponent)) {
        continue;
      }

      if (this.isInsideVisionCone(observer, candidateEntity, vision, forward)) {
        detectedTarget = candidateEntity;
        break;
      }
    }

    const detectedEntityId = detectedTarget?.getId() ?? null;
    const didTransitionToDetected = !detectionState.isAnyHostileVisible && detectedTarget !== null;
    const didSwitchTarget = detectionState.isAnyHostileVisible && detectionState.detectedEntityId !== detectedEntityId;

    detectionState.detectedEntityId = detectedEntityId;
    detectionState.isAnyHostileVisible = detectedTarget !== null;

    if (!detectedTarget || (!didTransitionToDetected && !didSwitchTarget)) {
      return;
    }

    const targetIdentity = detectedTarget.tryGetComponent(IdentityComponent);
    const targetDetectable = detectedTarget.getComponent(DetectableComponent);
    const observerDetectable = observer.tryGetComponent(DetectableComponent);

    if (targetDetectable.kind === DetectableKinds.PLAYER) {
      const observerLabel = observerDetectable?.kind ?? observerIdentity.name.toLowerCase();
      console.log(`Player detected by ${observerLabel}`);
      return;
    }

    console.log(`Hostile entity detected: ${targetIdentity?.id ?? detectedTarget.getId()}`);
  }

  private resolveForwardVector(vision: VisionComponent, transform: TransformComponent): Vector3 {
    if (vision.forward) {
      const overriddenForward = new Vector3(vision.forward.x, 0, vision.forward.z);
      if (overriddenForward.lengthSquared() > Number.EPSILON) {
        return overriddenForward.normalize();
      }
    }

    const yaw = transform.rotation.y;
    return new Vector3(Math.sin(yaw), 0, Math.cos(yaw)).normalize();
  }

  private isInsideVisionCone(
    observer: Entity,
    target: Entity,
    vision: VisionComponent,
    forward: Vector3
  ): boolean {
    const observerTransform = observer.getComponent(TransformComponent);
    const targetTransform = target.getComponent(TransformComponent);

    const toTarget = targetTransform.value.subtract(observerTransform.value);
    toTarget.y = 0;

    const distance = toTarget.length();
    if (distance <= Number.EPSILON) {
      return true;
    }

    if (distance > this.getVisionRangeWorldUnits(observer, vision)) {
      return false;
    }

    const normalizedToTarget = toTarget.scale(1 / distance);
    const dot = Vector3.Dot(forward, normalizedToTarget);
    const minDot = Math.cos((vision.fovDegrees * Math.PI) / 360);

    return dot >= minDot;
  }

  private getVisionRangeWorldUnits(observer: Entity, vision: VisionComponent): number {
    const runtimeGrid = this.runtimeContext?.hexGridRuntime.getGrid();
    const hexPosition = observer.getComponent(HexPositionComponent);

    if (!runtimeGrid) {
      return Number.POSITIVE_INFINITY;
    }

    const origin = runtimeGrid.cellToWorld(hexPosition.currentCell, 0);
    const neighboringCell = new HexCell(hexPosition.currentCell.q + 1, hexPosition.currentCell.r);
    const neighborCenter = runtimeGrid.cellToWorld(neighboringCell, 0);
    const oneCellWorldDistance = neighborCenter.subtract(origin).length();

    return oneCellWorldDistance * vision.rangeCells + 0.001;
  }
}
