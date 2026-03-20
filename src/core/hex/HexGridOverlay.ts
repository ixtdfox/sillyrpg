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
  readonly color: Color4;
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
  }

  public setDebugVisible(isVisible: boolean): void {
    this.isDebugVisible = isVisible;
    this.gridMesh.isVisible = isVisible;
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
    this.refreshHighlights();
  }

  public setMovePathCells(cells: readonly HexCell[]): void {
    this.movePathCells = [...cells];
    this.refreshHighlights();
  }

  public clearCombatMovementPreview(): void {
    this.moveRangeCells = [];
    this.movePathCells = [];
    this.refreshHighlights();
  }

  public setHoveredCell(cell: HexCell): void {
    const center = this.grid.cellToWorld(cell);
    this.hoverMesh.position.copyFrom(center);
    this.hoverMesh.position.y += this.verticalOffset * 1.2;
    this.hoverMesh.isVisible = true;
  }

  public hideHoveredCell(): void {
    this.hoverMesh.isVisible = false;
  }

  public dispose(): void {
    this.gridMesh.dispose();
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
      color: new Color4(0.45, 0.92, 0.62, 0.26),
    }));

    const movePathHighlights = this.movePathCells.map((cell) => ({
      cell,
      color: new Color4(0.96, 1, 0.68, 0.72),
    }));

    this.updatePool(this.moveRangePool, moveRangeHighlights, this.verticalOffset * 1.05);
    this.updatePool(this.movePathPool, movePathHighlights, this.verticalOffset * 1.2);
  }

  private updatePool(pool: HexHighlightPool, highlights: readonly HexCellHighlightSpec[], yOffset: number): void {
    this.ensurePoolCapacity(pool, highlights.length);

    for (let index = 0; index < highlights.length; index += 1) {
      const highlight = highlights[index];
      const mesh = pool.meshes[index];
      const center = this.grid.cellToWorld(highlight.cell);
      mesh.position.set(center.x, center.y + yOffset, center.z);
      const material = this.getOrCreateHighlightMaterial(mesh, `${pool.name}-material-${index}`);
      material.diffuseColor = new Color3(highlight.color.r, highlight.color.g, highlight.color.b);
      material.emissiveColor = new Color3(highlight.color.r, highlight.color.g, highlight.color.b).scale(0.45);
      material.alpha = highlight.color.a;
      mesh.isVisible = true;
    }

    this.setPoolVisibility(pool, highlights.length);
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
}
