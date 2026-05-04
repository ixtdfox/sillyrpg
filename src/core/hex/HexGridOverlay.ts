import {
  Color3,
  Color4,
  LinesMesh,
  Mesh,
  MeshBuilder,
  StandardMaterial,
  Scene,
  Vector3,
} from "@babylonjs/core";
import { HexCell } from "./HexCell";
import { HexGrid } from "./HexGrid";

interface HexCellHighlightSpec {
  readonly cell: HexCell;
  readonly storyIndex?: number;
  readonly color: Color4;
}

export interface StoryHexCell {
  readonly cell: HexCell;
  readonly storyIndex: number;
}

interface HexHighlightPool {
  readonly name: string;
  readonly meshes: Mesh[];
}

/**
 * Handles rendering for debug hex grid and hovered-cell highlight visuals.
 */
export class HexGridOverlay {
  private static readonly HEX_FILL_ROTATION_Y = -Math.PI / 6;

  private readonly scene: Scene;
  private readonly grid: HexGrid;
  private readonly verticalOffset: number;
  private readonly gridMesh: LinesMesh;
  private currentStoryGridMesh: LinesMesh | null;
  private readonly hoverMesh: LinesMesh;
  private readonly visionPool: HexHighlightPool;
  private readonly patrolPool: HexHighlightPool;
  private readonly detectedPool: HexHighlightPool;
  private readonly moveRangePool: HexHighlightPool;
  private readonly movePathPool: HexHighlightPool;

  private isDebugVisible: boolean;
  private visionCells: HexCell[];
  private patrolTargetCells: HexCell[];
  private detectedCells: HexCellHighlightSpec[];
  private moveRangeCells: HexCell[];
  private movePathCells: HexCell[];
  private moveRangeNavigationCells: StoryHexCell[];
  private movePathNavigationCells: StoryHexCell[];
  private storyYByStory: ReadonlyMap<number, number>;
  private currentStoryIndex: number;
  private walkableNavigationCells: StoryHexCell[];

  /**
   * Creates visual overlay meshes for grid debug and hover cell.
   */
  public constructor(scene: Scene, grid: HexGrid, verticalOffset: number) {
    this.scene = scene;
    this.grid = grid;
    this.verticalOffset = verticalOffset;

    this.gridMesh = this.buildGridMesh();
    this.gridMesh.color = new Color3(0.31, 0.73, 0.93);
    this.gridMesh.isPickable = false;
    this.currentStoryGridMesh = null;

    this.hoverMesh = this.buildHoverMesh();
    this.hoverMesh.color = new Color3(1, 0.86, 0.3);
    this.hoverMesh.isPickable = false;
    this.hoverMesh.isVisible = false;

    this.visionPool = this.createHighlightPool("hex-vision-highlight");
    this.patrolPool = this.createHighlightPool("hex-patrol-highlight");
    this.detectedPool = this.createHighlightPool("hex-detected-highlight");
    this.moveRangePool = this.createHighlightPool("hex-combat-move-range");
    this.movePathPool = this.createHighlightPool("hex-combat-move-path");

    this.isDebugVisible = false;
    this.visionCells = [];
    this.patrolTargetCells = [];
    this.detectedCells = [];
    this.moveRangeCells = [];
    this.movePathCells = [];
    this.moveRangeNavigationCells = [];
    this.movePathNavigationCells = [];
    this.storyYByStory = new Map();
    this.currentStoryIndex = 0;
    this.walkableNavigationCells = [];
  }

  public setDebugVisible(isVisible: boolean): void {
    this.isDebugVisible = isVisible;
    this.refreshGridVisibility();
    this.refreshHighlights();
  }

  public setVisionCells(cells: readonly HexCell[]): void {
    this.visionCells = [...cells];
    this.refreshHighlights();
  }

  public setPatrolTargetCells(cells: readonly HexCell[]): void {
    this.patrolTargetCells = [...cells];
    this.refreshHighlights();
  }

  public setDetectedCells(cells: readonly HexCellHighlightSpec[]): void {
    this.detectedCells = [...cells];
    this.refreshHighlights();
  }

  public clearDebugHighlights(): void {
    this.visionCells = [];
    this.patrolTargetCells = [];
    this.detectedCells = [];
    this.refreshHighlights();
  }

  public setMoveRangeCells(cells: readonly HexCell[]): void {
    this.moveRangeCells = [...cells];
    this.moveRangeNavigationCells = [];
    this.refreshHighlights();
  }

  public setMovePathCells(cells: readonly HexCell[]): void {
    this.movePathCells = [...cells];
    this.movePathNavigationCells = [];
    this.refreshHighlights();
  }

  public setMoveRangeNavigationCells(cells: readonly StoryHexCell[]): void {
    this.moveRangeCells = [];
    this.moveRangeNavigationCells = [...cells];
    this.refreshHighlights();
  }

  public setMovePathNavigationCells(cells: readonly StoryHexCell[]): void {
    this.movePathCells = [];
    this.movePathNavigationCells = [...cells];
    this.refreshHighlights();
  }

  public clearCombatMovementPreview(): void {
    this.moveRangeCells = [];
    this.movePathCells = [];
    this.moveRangeNavigationCells = [];
    this.movePathNavigationCells = [];
    this.refreshHighlights();
  }

  public setHoveredCell(cell: HexCell): void {
    this.setHoveredNavigationCell(cell, 0);
  }

  public setHoveredNavigationCell(cell: HexCell, storyIndex: number): void {
    if (!this.isCellOverlayAllowed(cell, storyIndex)) {
      this.hideHoveredCell();
      return;
    }

    const center = this.grid.cellToWorld(cell, this.getStoryY(storyIndex));
    this.hoverMesh.position.copyFrom(center);
    this.hoverMesh.position.y += this.verticalOffset * 1.2;
    this.hoverMesh.isVisible = true;
  }

  public setStoryYByStory(storyYByStory: ReadonlyMap<number, number>): void {
    this.storyYByStory = new Map(storyYByStory);
    this.rebuildCurrentStoryGridMesh();
    this.refreshHighlights();
  }

  public setCurrentStoryIndex(storyIndex: number): void {
    if (this.currentStoryIndex === storyIndex) {
      return;
    }

    this.currentStoryIndex = storyIndex;
    this.rebuildCurrentStoryGridMesh();
    this.refreshHighlights();
  }

  public setWalkableNavigationCells(cells: readonly StoryHexCell[]): void {
    this.walkableNavigationCells = [...cells];
    this.rebuildCurrentStoryGridMesh();
    this.refreshHighlights();
  }

  public hideHoveredCell(): void {
    this.hoverMesh.isVisible = false;
  }

  public dispose(): void {
    this.gridMesh.dispose();
    this.currentStoryGridMesh?.dispose();
    this.hoverMesh.dispose();
    this.disposePool(this.visionPool);
    this.disposePool(this.patrolPool);
    this.disposePool(this.detectedPool);
    this.disposePool(this.moveRangePool);
    this.disposePool(this.movePathPool);
  }

  /**
   * Builds static debug line mesh for all logical cells within the bounded grid area.
   *
   * Limitation: this first pass still renders a bounded rectangular axial footprint
   * derived from ground extents rather than terrain-aware walkable cells.
   */
  private buildGridMesh(): LinesMesh {
    const lines: Vector3[][] = [];

    for (const cell of this.grid.getCellsWithinBounds()) {
      const center = this.grid.cellToWorld(cell);
      const points = this.buildHexPoints(center, this.verticalOffset);
      lines.push(points);
    }

    return MeshBuilder.CreateLineSystem("hex-grid-overlay", { lines, updatable: false }, this.scene);
  }

  private buildHoverMesh(): LinesMesh {
    const points = this.buildHexPoints(Vector3.Zero(), 0);
    return MeshBuilder.CreateLines("hex-hover-overlay", { points, updatable: false }, this.scene);
  }

  private buildHexPoints(center: Vector3, yOffset: number): Vector3[] {
    const points: Vector3[] = [];
    const radius = this.grid.getHexSize();

    for (let corner = 0; corner < 6; corner += 1) {
      const angle = Math.PI / 180 * (60 * corner - 30);
      const x = center.x + radius * Math.cos(angle);
      const z = center.z + radius * Math.sin(angle);
      const y = center.y + yOffset;
      points.push(new Vector3(x, y, z));
    }

    points.push(points[0].clone());
    return points;
  }

  private createHighlightPool(name: string): HexHighlightPool {
    return {
      name,
      meshes: [],
    };
  }

  private refreshHighlights(): void {
    if (!this.isDebugVisible) {
      this.setPoolVisibility(this.visionPool, 0);
      this.setPoolVisibility(this.patrolPool, 0);
      this.setPoolVisibility(this.detectedPool, 0);
    } else {
      const visionHighlights = this.visionCells.map((cell) => ({
        cell,
        color: new Color4(0.22, 0.63, 0.94, 0.22),
      }));

      const patrolHighlights = this.patrolTargetCells.map((cell) => ({
        cell,
        color: new Color4(1.0, 0.55, 0.14, 0.45),
      }));

      this.updatePool(this.visionPool, visionHighlights, this.verticalOffset * 0.3);
      this.updatePool(this.patrolPool, patrolHighlights, this.verticalOffset * 0.6);
      this.updatePool(this.detectedPool, this.detectedCells, this.verticalOffset * 0.9);
    }

    const moveRangeHighlights = this.moveRangeCells.map((cell) => ({
      cell,
      storyIndex: this.currentStoryIndex,
      color: new Color4(0.45, 0.92, 0.62, 0.26),
    }));

    const movePathHighlights = this.movePathCells.map((cell) => ({
      cell,
      storyIndex: this.currentStoryIndex,
      color: new Color4(0.96, 1, 0.68, 0.72),
    }));

    const moveRangeNavigationHighlights = this.moveRangeNavigationCells.map((entry) => ({
      cell: entry.cell,
      storyIndex: entry.storyIndex,
      color: new Color4(0.45, 0.92, 0.62, 0.26),
    }));

    const movePathNavigationHighlights = this.movePathNavigationCells.map((entry) => ({
      cell: entry.cell,
      storyIndex: entry.storyIndex,
      color: new Color4(0.96, 1, 0.68, 0.72),
    }));

    this.updatePool(
      this.moveRangePool,
      moveRangeNavigationHighlights.length > 0 ? moveRangeNavigationHighlights : moveRangeHighlights,
      this.verticalOffset * 1.05
    );
    this.updatePool(
      this.movePathPool,
      movePathNavigationHighlights.length > 0 ? movePathNavigationHighlights : movePathHighlights,
      this.verticalOffset * 1.2
    );
  }

  private updatePool(pool: HexHighlightPool, highlights: readonly HexCellHighlightSpec[], yOffset: number): void {
    const filteredHighlights = highlights.filter((highlight) =>
      this.isCellOverlayAllowed(highlight.cell, highlight.storyIndex ?? this.currentStoryIndex)
    );
    this.ensurePoolCapacity(pool, filteredHighlights.length);

    for (let index = 0; index < filteredHighlights.length; index += 1) {
      const highlight = filteredHighlights[index];
      const mesh = pool.meshes[index];
      const center = this.grid.cellToWorld(highlight.cell, this.getStoryY(highlight.storyIndex ?? this.currentStoryIndex));
      mesh.position.set(center.x, center.y + yOffset, center.z);
      const material = this.getOrCreateHighlightMaterial(mesh, `${pool.name}-material-${index}`);
      material.diffuseColor = new Color3(highlight.color.r, highlight.color.g, highlight.color.b);
      material.emissiveColor = new Color3(highlight.color.r, highlight.color.g, highlight.color.b).scale(0.45);
      material.alpha = highlight.color.a;
      mesh.isVisible = true;
    }

    this.setPoolVisibility(pool, filteredHighlights.length);
  }

  private ensurePoolCapacity(pool: HexHighlightPool, desiredSize: number): void {
    while (pool.meshes.length < desiredSize) {
      const index = pool.meshes.length;
      const mesh = MeshBuilder.CreateDisc(
        `${pool.name}-${index}`,
        {
          radius: this.grid.getHexSize() * 0.92,
          tessellation: 6,
          sideOrientation: Mesh.DOUBLESIDE,
        },
        this.scene
      );
      mesh.rotation.x = Math.PI / 2;
      mesh.rotation.y = HexGridOverlay.HEX_FILL_ROTATION_Y;
      mesh.isPickable = false;
      mesh.isVisible = false;
      pool.meshes.push(mesh);
    }
  }

  private getOrCreateHighlightMaterial(mesh: Mesh, name: string): StandardMaterial {
    const existingMaterial = mesh.material;
    if (existingMaterial instanceof StandardMaterial) {
      return existingMaterial;
    }

    const material = new StandardMaterial(name, this.scene);
    material.backFaceCulling = false;
    material.disableLighting = true;
    mesh.material = material;
    return material;
  }

  private setPoolVisibility(pool: HexHighlightPool, visibleCount: number): void {
    for (let index = 0; index < pool.meshes.length; index += 1) {
      pool.meshes[index].isVisible = index < visibleCount;
    }
  }

  private disposePool(pool: HexHighlightPool): void {
    for (const mesh of pool.meshes) {
      mesh.material?.dispose();
      mesh.dispose();
    }
    pool.meshes.length = 0;
  }

  private getStoryY(storyIndex: number): number {
    return this.storyYByStory.get(storyIndex) ?? this.grid.getOrigin().y;
  }

  private rebuildCurrentStoryGridMesh(): void {
    this.currentStoryGridMesh?.dispose();
    this.currentStoryGridMesh = null;

    if (this.walkableNavigationCells.length === 0) {
      this.refreshGridVisibility();
      return;
    }

    const lines = this.walkableNavigationCells
      .filter((entry) => entry.storyIndex === this.currentStoryIndex)
      .map((entry) => this.buildHexPoints(this.grid.cellToWorld(entry.cell, this.getStoryY(entry.storyIndex)), this.verticalOffset));

    if (lines.length === 0) {
      this.refreshGridVisibility();
      return;
    }

    this.currentStoryGridMesh = MeshBuilder.CreateLineSystem(
      `hex-current-story-grid-overlay-${this.currentStoryIndex}`,
      { lines, updatable: false },
      this.scene
    );
    this.currentStoryGridMesh.color = new Color3(0.31, 0.73, 0.93);
    this.currentStoryGridMesh.isPickable = false;
    this.refreshGridVisibility();
  }

  private refreshGridVisibility(): void {
    const hasWalkableCells = this.walkableNavigationCells.length > 0;
    this.gridMesh.isVisible = this.isDebugVisible && !hasWalkableCells;
    if (this.currentStoryGridMesh) {
      this.currentStoryGridMesh.isVisible = this.isDebugVisible;
    }
  }

  private isCellOverlayAllowed(cell: HexCell, storyIndex: number): boolean {
    if (this.walkableNavigationCells.length === 0) {
      return true;
    }

    return this.walkableNavigationCells.some(
      (entry) => entry.storyIndex === storyIndex && entry.cell.equals(cell)
    );
  }
}
