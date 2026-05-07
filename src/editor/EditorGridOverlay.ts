import {
  Color3,
  MeshBuilder,
  Scene,
  Vector3,
  type AbstractMesh,
  type LinesMesh
} from "@babylonjs/core";
import { GridCell } from "../core/grid/GridCell";
import { RectGrid } from "../core/grid/RectGrid";
import { RectGridOverlay } from "../core/grid/RectGridOverlay";
import { RECT_TILE_SIZE, WORLD_GRID_ORIGIN_X, WORLD_GRID_ORIGIN_Z } from "../core/grid/WorldGridConstants";
import type { EditorBounds } from "./types";

const EDITOR_GRID_MIN_CELL = -200;
const EDITOR_GRID_MAX_CELL = 200;

/**
 * Editor-owned world grid and optional axes helpers.
 */
export class EditorGridOverlay {
  private readonly scene: Scene;
  private grid: RectGrid;
  private overlay: RectGridOverlay;
  private axesMeshes: readonly LinesMesh[];
  private gridVisible: boolean;
  private axesVisible: boolean;

  public constructor(scene: Scene) {
    this.scene = scene;
    this.gridVisible = true;
    this.axesVisible = true;
    this.grid = this.createGrid(undefined);
    this.overlay = new RectGridOverlay(scene, this.grid, 0.02);
    this.overlay.setDebugVisible(this.gridVisible);
    this.axesMeshes = this.createAxesMeshes();
    this.setAxesVisible(this.axesVisible);
  }

  public refreshFromMeshes(meshes: readonly AbstractMesh[]): void {
    void meshes;
  }

  public setGridVisible(isVisible: boolean): void {
    this.gridVisible = isVisible;
    this.overlay.setDebugVisible(isVisible);
  }

  public getGridVisible(): boolean {
    return this.gridVisible;
  }

  public setAxesVisible(isVisible: boolean): void {
    this.axesVisible = isVisible;
    for (const mesh of this.axesMeshes) {
      mesh.isVisible = isVisible;
    }
  }

  public getAxesVisible(): boolean {
    return this.axesVisible;
  }

  public getGridBounds(): EditorBounds {
    const bounds = this.grid.getBounds();
    return {
      min: new Vector3(bounds.minX * RECT_TILE_SIZE, 0, bounds.minZ * RECT_TILE_SIZE),
      max: new Vector3((bounds.maxX + 1) * RECT_TILE_SIZE, 0, (bounds.maxZ + 1) * RECT_TILE_SIZE)
    };
  }

  public dispose(): void {
    this.overlay.dispose();
    for (const mesh of this.axesMeshes) {
      mesh.dispose(false);
    }
  }

  private createGrid(meshes: readonly AbstractMesh[] | undefined): RectGrid {
    void meshes;
    const origin = new Vector3(WORLD_GRID_ORIGIN_X, 0, WORLD_GRID_ORIGIN_Z);
    const bounds = {
      minX: EDITOR_GRID_MIN_CELL,
      maxX: EDITOR_GRID_MAX_CELL,
      minZ: EDITOR_GRID_MIN_CELL,
      maxZ: EDITOR_GRID_MAX_CELL
    };
    return new RectGrid(origin, RECT_TILE_SIZE, bounds);
  }

  private createAxesMeshes(): readonly LinesMesh[] {
    const axisLength = 4;
    const createAxis = (name: string, points: Vector3[], color: Color3): LinesMesh => {
      const mesh = MeshBuilder.CreateLines(name, { points, updatable: false }, this.scene);
      mesh.color = color;
      mesh.isPickable = false;
      return mesh;
    };

    return [
      createAxis("editor-axis-x", [Vector3.Zero(), new Vector3(axisLength, 0, 0)], new Color3(0.92, 0.28, 0.22)),
      createAxis("editor-axis-y", [Vector3.Zero(), new Vector3(0, axisLength, 0)], new Color3(0.28, 0.8, 0.42)),
      createAxis("editor-axis-z", [Vector3.Zero(), new Vector3(0, 0, axisLength)], new Color3(0.22, 0.5, 0.95))
    ];
  }
}
