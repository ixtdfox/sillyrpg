import { Scene as BabylonScene } from "@babylonjs/core";
import type { EntityManager } from "../EntityManager";
import type { System } from "../System";
import { getInGameSceneRuntimeContext, type InGameSceneRuntimeContext } from "../../scene/in-game/InGameSceneRuntimeContext";
import { GroundAttachmentComponent } from "../components/GroundAttachmentComponent";
import { GridPathMovementComponent } from "../components/GridPathMovementComponent";
import { GridPositionComponent } from "../components/GridPositionComponent";
import { TransformComponent } from "../components/TransformComponent";

export class GroundAttachmentSystem implements System {
  private readonly entityManager: EntityManager;
  private runtimeContext: InGameSceneRuntimeContext | null;
  private lastSkipDebugKey: string | null;

  public constructor(entityManager: EntityManager) {
    this.entityManager = entityManager;
    this.runtimeContext = null;
    this.lastSkipDebugKey = null;
  }

  public setScene(scene: BabylonScene | null): void {
    this.runtimeContext = scene ? getInGameSceneRuntimeContext(scene) : null;
    this.lastSkipDebugKey = null;
  }

  public update(deltaSeconds: number): void {
    if (!this.runtimeContext) {
      return;
    }

    const entities = this.entityManager.query(TransformComponent, GridPositionComponent, GroundAttachmentComponent);
    for (const entity of entities) {
      const transform = entity.getComponent(TransformComponent);
      const gridPosition = entity.getComponent(GridPositionComponent);
      const groundAttachment = entity.getComponent(GroundAttachmentComponent);
      if (!groundAttachment.enabled) {
        continue;
      }

      const pathMovement = entity.tryGetComponent(GridPathMovementComponent);
      const activeSegment = pathMovement?.isMoving ? pathMovement.pathSegments[pathMovement.currentSegmentIndex] : null;
      if (activeSegment && (activeSegment.kind === "stair" || activeSegment.kind === "external_stair")) {
        this.debugSkip(entity.getId(), activeSegment.kind, activeSegment.metadata?.stairId);
        continue;
      }
      if (pathMovement?.isMoving && !groundAttachment.allowDuringMovement) {
        continue;
      }

      const groundedPosition = this.runtimeContext.surfaceHeightResolver.resolveGroundedPosition({
        position: transform.value,
        cell: gridPosition.currentCell,
        storyIndex: gridPosition.currentStoryIndex,
        fallbackY: transform.value.y,
        footOffset: groundAttachment.footOffset
      });
      const deltaY = groundedPosition.y - transform.value.y;
      if (Math.abs(deltaY) > groundAttachment.maxSnapDistance) {
        continue;
      }

      if (groundAttachment.mode === "smooth") {
        const alpha = Math.min(1, deltaSeconds * 10);
        transform.value.y += deltaY * alpha;
        continue;
      }

      transform.value.y = groundedPosition.y;
    }
  }

  private debugSkip(entityId: string, kind: "stair" | "external_stair", stairId?: string): void {
    if (!isSurfaceHeightDebugEnabled()) {
      return;
    }

    const debugKey = `${entityId}:${kind}:${stairId ?? "n/a"}`;
    if (debugKey === this.lastSkipDebugKey) {
      return;
    }

    this.lastSkipDebugKey = debugKey;
    console.debug(`[GroundAttachment] skip kind=${kind} entity=${entityId} stairId=${stairId ?? "n/a"}`);
  }
}

function isSurfaceHeightDebugEnabled(): boolean {
  try {
    return globalThis.localStorage?.getItem("sillyrpg.debug.surfaceHeight") === "1";
  } catch {
    return false;
  }
}
