import { Color3, LinesMesh, MeshBuilder, Scene, Vector3 } from "@babylonjs/core";
import { HexCell } from "./HexCell";
import { HexGrid } from "./HexGrid";

/**
 * Handles rendering for debug hex grid and hovered-cell highlight visuals.
 */
export class HexGridOverlay {
  private readonly scene: Scene;
  private readonly grid: HexGrid;
  private readonly verticalOffset: number;
  private readonly gridMesh: LinesMesh;
  private readonly hoverMesh: LinesMesh;

  /**
   * Creates visual overlay meshes for grid debug and hover cell.
   *
   * @param scene - Babylon scene.
   * @param grid - Logical hex grid.
   * @param verticalOffset - Offset above ground to avoid z-fighting.
   */
  public constructor(scene: Scene, grid: HexGrid, verticalOffset = 0.06) {
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
  }

  /**
   * Shows or hides debug grid overlay lines.
   *
   * @param isVisible - Visibility state.
   */
  public setDebugVisible(isVisible: boolean): void {
    this.gridMesh.isVisible = isVisible;
  }

  /**
   * Updates hovered-cell highlight position.
   *
   * @param cell - Hovered cell.
   */
  public setHoveredCell(cell: HexCell): void {
    const center = this.grid.cellToWorld(cell);
    this.hoverMesh.position.copyFrom(center);
    this.hoverMesh.position.y += this.verticalOffset * 1.2;
    this.hoverMesh.isVisible = true;
  }

  /**
   * Hides hovered-cell highlight when no valid ground hit exists.
   */
  public hideHoveredCell(): void {
    this.hoverMesh.isVisible = false;
  }

  /**
   * Releases all overlay rendering resources.
   */
  public dispose(): void {
    this.gridMesh.dispose();
    this.hoverMesh.dispose();
  }

  /**
   * Builds static debug line mesh for every in-bounds hex cell.
   */
  private buildGridMesh(): LinesMesh {
    const lines: Vector3[][] = [];
    const bounds = this.grid.getBounds();

    for (let q = bounds.minQ; q <= bounds.maxQ; q += 1) {
      for (let r = bounds.minR; r <= bounds.maxR; r += 1) {
        const center = this.grid.cellToWorld(new HexCell(q, r));
        const points = this.buildHexPoints(center, this.verticalOffset);
        lines.push(points);
      }
    }

    return MeshBuilder.CreateLineSystem("hex-grid-overlay", { lines, updatable: false }, this.scene);
  }

  /**
   * Builds reusable hovered-cell hex outline mesh centered on local origin.
   */
  private buildHoverMesh(): LinesMesh {
    const points = this.buildHexPoints(Vector3.Zero(), 0);
    return MeshBuilder.CreateLines("hex-hover-overlay", { points, updatable: false }, this.scene);
  }

  /**
   * Creates 6-corner line loop points for a single hex cell.
   */
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
}
