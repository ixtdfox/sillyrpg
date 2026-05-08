import { Vector3 } from "@babylonjs/core";
import { WORLD_VERTICAL_TILE_SIZE } from "../core/grid/WorldGridConstants";
import { snapEditorMovePosition } from "./EditorPlacementSnapping";
import type { EditorMoveAxisMode } from "./state/EditorMoveAxisMode";

const PIXELS_PER_VERTICAL_GRID_STEP = 24;

interface HorizontalMoveSession {
  readonly kind: "horizontal";
  readonly pointerId: number;
  readonly objectId: string;
  readonly axisMode: "xz" | "x" | "z";
  readonly moveOffset: Vector3;
}

interface VerticalMoveSession {
  readonly kind: "vertical";
  readonly pointerId: number;
  readonly objectId: string;
  readonly startClientY: number;
  readonly startPosition: Vector3;
}

type MoveSession = HorizontalMoveSession | VerticalMoveSession;

export interface EditorObjectMoveStart {
  readonly pointerId: number;
  readonly clientY: number;
  readonly objectId: string;
  readonly objectPosition: Vector3;
  readonly axisMode: EditorMoveAxisMode;
  readonly placementPoint: Vector3 | null;
}

export interface EditorObjectMoveUpdate {
  readonly pointerId: number;
  readonly clientY: number;
  readonly currentPosition: Vector3;
  readonly placementPoint: Vector3 | null;
}

export interface EditorObjectMoveResult {
  readonly objectId: string;
  readonly nextPosition: Vector3;
}

export class EditorObjectMoveController {
  private activeSession: MoveSession | null = null;

  public beginMove(params: EditorObjectMoveStart): boolean {
    if (params.axisMode === "y") {
      this.activeSession = {
        kind: "vertical",
        pointerId: params.pointerId,
        objectId: params.objectId,
        startClientY: params.clientY,
        startPosition: params.objectPosition.clone()
      };
      return true;
    }

    if (!params.placementPoint) {
      return false;
    }

    this.activeSession = {
      kind: "horizontal",
      pointerId: params.pointerId,
      objectId: params.objectId,
      axisMode: params.axisMode,
      moveOffset: params.objectPosition.subtract(params.placementPoint)
    };
    return true;
  }

  public updateMove(params: EditorObjectMoveUpdate): EditorObjectMoveResult | null {
    if (!this.activeSession || this.activeSession.pointerId !== params.pointerId) {
      return null;
    }

    if (this.activeSession.kind === "vertical") {
      const gridDelta = Math.round((this.activeSession.startClientY - params.clientY) / PIXELS_PER_VERTICAL_GRID_STEP);
      const rawPosition = new Vector3(
        this.activeSession.startPosition.x,
        this.activeSession.startPosition.y + gridDelta * WORLD_VERTICAL_TILE_SIZE,
        this.activeSession.startPosition.z
      );
      return {
        objectId: this.activeSession.objectId,
        nextPosition: snapEditorMovePosition(rawPosition, params.currentPosition, "y")
      };
    }

    if (!params.placementPoint) {
      return null;
    }

    const rawPosition = params.placementPoint.add(this.activeSession.moveOffset);
    return {
      objectId: this.activeSession.objectId,
      nextPosition: snapEditorMovePosition(rawPosition, params.currentPosition, this.activeSession.axisMode)
    };
  }

  public cancelMove(pointerId?: number): boolean {
    if (!this.activeSession) {
      return false;
    }

    if (pointerId !== undefined && this.activeSession.pointerId !== pointerId) {
      return false;
    }

    this.activeSession = null;
    return true;
  }

  public getActiveObjectId(): string | null {
    return this.activeSession?.objectId ?? null;
  }

  public isMovingPointer(pointerId: number): boolean {
    return this.activeSession?.pointerId === pointerId;
  }
}
