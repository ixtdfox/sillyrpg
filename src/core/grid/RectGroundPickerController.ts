import { Matrix, type AbstractMesh, type PickingInfo, type Ray, type Scene, Vector3 } from "@babylonjs/core";
import { GridCell } from "./GridCell";
import { RectGrid } from "./RectGrid";
import { RectGridOverlay } from "./RectGridOverlay";
import { parseStairPickMetadata } from "../navigation/BuildingNavigationMetadata";

export interface PickedNavigationCell {
  readonly cell: GridCell;
  readonly storyIndex: number;
  readonly worldPosition: Vector3;
  readonly pickedMeshName?: string;
  readonly hasStoryMetadata?: boolean;
  readonly pickedMeshUniqueId?: number;
}

export type PickedNavigationTarget =
  | ({
      readonly kind: "cell";
    } & PickedNavigationCell)
  | {
      readonly kind: "stair";
      readonly stairId?: string;
      readonly fromStory?: number;
      readonly toStory?: number;
      readonly pickedPoint: Vector3;
      readonly pickedMeshName?: string;
    };

/**
 * Integrates mouse picking with logical grid snapping and hovered-cell highlight.
 */
export class RectGroundPickerController {
  private readonly scene: Scene;
  private readonly isGroundPick: (mesh: AbstractMesh) => boolean;
  private isWalkableCell: (cell: GridCell, storyIndex: number) => boolean;
  private storyYResolver: (storyIndex: number) => number;
  private storyIndicesProvider: () => readonly number[];
  private readonly grid: RectGrid;
  private readonly overlay: RectGridOverlay;
  private hoveredCell: GridCell | null;
  private hoveredNavigationCell: PickedNavigationCell | null;
  private hoveredNavigationTarget: PickedNavigationTarget | null;
  private warnedMissingStoryMetadataMeshIds: Set<number>;
  private fallbackStoryIndex: number;

  /**
   * Creates mouse-driven ground picking controller.
   */
  public constructor(
    scene: Scene,
    isGroundPick: (mesh: AbstractMesh) => boolean,
    grid: RectGrid,
    overlay: RectGridOverlay,
    isWalkableCell: (cell: GridCell, storyIndex: number) => boolean = () => true
  ) {
    this.scene = scene;
    this.isGroundPick = isGroundPick;
    this.isWalkableCell = isWalkableCell;
    this.storyYResolver = () => this.grid.getOrigin().y;
    this.storyIndicesProvider = () => [this.fallbackStoryIndex];
    this.grid = grid;
    this.overlay = overlay;
    this.hoveredCell = null;
    this.hoveredNavigationCell = null;
    this.hoveredNavigationTarget = null;
    this.warnedMissingStoryMetadataMeshIds = new Set();
    this.fallbackStoryIndex = 0;

    this.scene.onBeforeRenderObservable.add(this.updateHoverFromPointer);
  }

  public dispose(): void {
    this.scene.onBeforeRenderObservable.removeCallback(this.updateHoverFromPointer);
  }

  /**
   * Returns currently hovered cell derived from pointer pick, if any.
   */
  public getHoveredCell(): GridCell | null {
    return this.hoveredCell;
  }

  public getHoveredNavigationCell(fallbackStoryIndex = 0): PickedNavigationCell | null {
    const target = this.getHoveredNavigationTarget(fallbackStoryIndex);
    if (!target || target.kind !== "cell") {
      return null;
    }

    return target;
  }

  public getHoveredNavigationTarget(fallbackStoryIndex = 0): PickedNavigationTarget | null {
    if (!this.hoveredNavigationTarget) {
      return null;
    }

    void fallbackStoryIndex;
    return this.hoveredNavigationTarget;
  }

  public setFallbackStoryIndex(storyIndex: number): void {
    this.fallbackStoryIndex = storyIndex;
  }

  public setWalkableCellPredicate(isWalkableCell: (cell: GridCell, storyIndex: number) => boolean): void {
    this.isWalkableCell = isWalkableCell;
  }

  public setStoryYResolver(resolver: (storyIndex: number) => number): void {
    this.storyYResolver = resolver;
  }

  public setStoryIndicesProvider(provider: () => readonly number[]): void {
    this.storyIndicesProvider = provider;
  }

  private readonly updateHoverFromPointer = (): void => {
    const pickResults = this.scene.multiPick(
      this.scene.pointerX,
      this.scene.pointerY,
      this.isGroundPick,
      this.scene.activeCamera ?? undefined
    ) ?? [];

    const target = this.resolveNavigationTargetFromHits(pickResults);
    if (!target) {
      this.hoveredCell = null;
      this.hoveredNavigationCell = null;
      this.hoveredNavigationTarget = null;
      this.overlay.hideHoveredCell();
      return;
    }

    if (target.kind === "stair") {
      this.hoveredCell = null;
      this.hoveredNavigationCell = null;
      this.hoveredNavigationTarget = target;
      this.overlay.hideHoveredCell();
      return;
    }

    const nextCell = target.cell;
    const storyIndex = target.storyIndex;

    if (this.hoveredCell?.equals(nextCell) && this.hoveredNavigationCell?.storyIndex === storyIndex) {
      return;
    }

    this.hoveredCell = nextCell;
    this.hoveredNavigationCell = {
      cell: nextCell,
      storyIndex,
      worldPosition: target.worldPosition.clone(),
      pickedMeshName: target.pickedMeshName
    };
    this.hoveredNavigationTarget = {
      kind: "cell",
      ...this.hoveredNavigationCell
    };
    this.overlay.setHoveredNavigationCell(nextCell, storyIndex);
  };

  private resolveNavigationTargetFromHits(pickResults: readonly PickingInfo[]): PickedNavigationTarget | null {
    const stairCandidates: Extract<PickedNavigationTarget, { kind: "stair" }>[] = [];

    for (const pickResult of pickResults) {
      if (!pickResult.hit || !pickResult.pickedPoint) {
        continue;
      }

      const pickedMesh = pickResult.pickedMesh ?? null;
      const stairPickMetadata = pickedMesh ? parseStairPickMetadata(pickedMesh) : null;
      if (stairPickMetadata?.isStairLike) {
        if (!isStairPickConnectedToStory(stairPickMetadata, this.fallbackStoryIndex)) {
          continue;
        }

        const stairTarget: Extract<PickedNavigationTarget, { kind: "stair" }> = {
          kind: "stair",
          stairId: stairPickMetadata.stairId,
          fromStory: stairPickMetadata.fromStory,
          toStory: stairPickMetadata.toStory,
          pickedPoint: pickResult.pickedPoint.clone(),
          pickedMeshName: pickedMesh?.name
        };

        if (stairCandidates.length === 0) {
          stairCandidates.push(stairTarget);
        }

        if (pickResults[0] === pickResult) {
          return stairTarget;
        }
        continue;
      }
    }

    const selectedStair = stairCandidates[0] ?? null;
    if (selectedStair) {
      return selectedStair;
    }

    return this.resolveCurrentStoryPlaneCellTarget() ?? this.resolveLowerStoryPlaneCellTarget();
  }

  private resolveCurrentStoryPlaneCellTarget(): Extract<PickedNavigationTarget, { kind: "cell" }> | null {
    return this.resolvePlaneCellTarget(this.fallbackStoryIndex, "current-story-plane");
  }

  private resolveLowerStoryPlaneCellTarget(): Extract<PickedNavigationTarget, { kind: "cell" }> | null {
    const lowerStories = this.storyIndicesProvider()
      .filter((storyIndex) => storyIndex < this.fallbackStoryIndex)
      .sort((first, second) => second - first);

    for (const storyIndex of lowerStories) {
      const target = this.resolvePlaneCellTarget(storyIndex, "lower-story-plane");
      if (target) {
        return target;
      }
    }

    return null;
  }

  private resolvePlaneCellTarget(
    storyIndex: number,
    pickedMeshName: string
  ): Extract<PickedNavigationTarget, { kind: "cell" }> | null {
    const ray = this.getPointerRay();
    if (!ray) {
      return null;
    }

    const planePoint = this.intersectRayWithHorizontalPlane(ray, this.storyYResolver(storyIndex));
    if (!planePoint) {
      return null;
    }

    const nextCell = this.grid.worldToCell(planePoint);
    if (!this.grid.contains(nextCell) || !this.isWalkableCell(nextCell, storyIndex)) {
      return null;
    }

    return {
      kind: "cell",
      cell: nextCell,
      storyIndex,
      worldPosition: planePoint,
      pickedMeshName,
      hasStoryMetadata: false
    };
  }

  private getPointerRay(): Ray | null {
    const camera = this.scene.activeCamera;
    if (!camera) {
      return null;
    }

    return this.scene.createPickingRay(
      this.scene.pointerX,
      this.scene.pointerY,
      Matrix.Identity(),
      camera
    );
  }

  private intersectRayWithHorizontalPlane(ray: Ray, y: number): Vector3 | null {
    if (Math.abs(ray.direction.y) < 0.00001) {
      return null;
    }

    const t = (y - ray.origin.y) / ray.direction.y;
    if (t < 0) {
      return null;
    }

    return ray.origin.add(ray.direction.scale(t));
  }
}

function isStairPickConnectedToStory(
  metadata: { readonly fromStory?: number; readonly toStory?: number },
  currentStoryIndex: number
): boolean {
  const hasFrom = metadata.fromStory !== undefined;
  const hasTo = metadata.toStory !== undefined;

  if (!hasFrom && !hasTo) {
    return true;
  }

  return metadata.fromStory === currentStoryIndex || metadata.toStory === currentStoryIndex;
}
