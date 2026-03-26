import { Color4, Vector3, type AbstractMesh, type Scene } from "@babylonjs/core";
import { HexGridDebugState } from "./debug/HexGridDebugState";
import { DEFAULT_HEX_GRID_SETTINGS, type HexGridSettings } from "./HexGridSettings";
import { HexCell } from "./HexCell";
import { HexGrid } from "./HexGrid";
import { HexGridGroundMeshResolver } from "./HexGridGroundMeshResolver";
import { HexGridOverlay } from "./HexGridOverlay";
import { HexGroundPickerController } from "./HexGroundPickerController";

export interface HexDebugDetectedCell {
  readonly cell: HexCell;
  readonly color: Color4;
}

/**
 * Wires hex grid logic, renderer, and picking runtime for the active scene.
 */
export class HexGridRuntime {
  private grid: HexGrid;
  private readonly debugState: HexGridDebugState;
  private overlay: HexGridOverlay;
  private pickerController: HexGroundPickerController;
  private readonly settings: HexGridSettings;

  /**
   * Creates complete in-game hex runtime module.
   */
  public constructor(
    scene: Scene,
    settings: HexGridSettings = DEFAULT_HEX_GRID_SETTINGS,
    preferredGroundMeshes: readonly AbstractMesh[] = []
  ) {
    this.settings = settings;
    const { grid, overlay, pickerController } = this.createRuntime(scene, settings, preferredGroundMeshes);
    this.grid = grid;
    this.overlay = overlay;
    this.pickerController = pickerController;
    this.debugState = new HexGridDebugState(settings.debugEnabledByDefault);
    this.overlay.setDebugVisible(this.debugState.getIsDebugEnabled());
  }

  /**
   * Returns current grid-debug visibility state.
   */
  public getIsDebugEnabled(): boolean {
    return this.debugState.getIsDebugEnabled();
  }

  /**
   * Toggles debug visibility and returns new state.
   */
  public toggleDebug(): boolean {
    const isEnabled = this.debugState.toggle();
    this.overlay.setDebugVisible(isEnabled);
    return isEnabled;
  }

  public setVisionCells(cells: readonly HexCell[]): void {
    this.overlay.setVisionCells(cells);
  }

  public setPatrolTargetCells(cells: readonly HexCell[]): void {
    this.overlay.setPatrolTargetCells(cells);
  }

  public setDetectedCells(cells: readonly HexDebugDetectedCell[]): void {
    this.overlay.setDetectedCells(cells);
  }

  public clearDebugHighlights(): void {
    this.overlay.clearDebugHighlights();
  }

  public setMoveRangeCells(cells: readonly HexCell[]): void {
    this.overlay.setMoveRangeCells(cells);
  }

  public setMovePathCells(cells: readonly HexCell[]): void {
    this.overlay.setMovePathCells(cells);
  }

  public clearCombatMovementPreview(): void {
    this.overlay.clearCombatMovementPreview();
  }

  public dispose(): void {
    this.pickerController.dispose();
    this.overlay.dispose();
  }

  /**
   * Rebuilds grid, overlay, and picking bindings against current scene ground meshes.
   *
   * @param scene - Scene containing currently active district geometry.
   */
  public rebuild(scene: Scene, preferredGroundMeshes: readonly AbstractMesh[] = []): void {
    const runtime = this.createRuntime(scene, this.settings, preferredGroundMeshes);

    this.pickerController.dispose();
    this.overlay.dispose();
    this.grid = runtime.grid;
    this.overlay = runtime.overlay;
    this.overlay.setDebugVisible(this.debugState.getIsDebugEnabled());
    this.pickerController = runtime.pickerController;
  }

  /**
   * Returns logical hex grid backing this runtime.
   */
  public getGrid(): HexGrid {
    return this.grid;
  }

  /**
   * Returns currently hovered ground hex under pointer, if any.
   */
  public getHoveredCell(): HexCell | null {
    return this.pickerController.getHoveredCell();
  }

  /**
   * Builds a logical grid from the selected ground surface.
   *
   * Origin strategy: anchor at world-space minimum X/Z corner of ground AABB.
   * This avoids dependence on imported mesh pivot placement or center drift.
   */
  private createGridFromGround(groundMesh: AbstractMesh, settings: HexGridSettings): HexGrid {
    const boundingBox = groundMesh.getBoundingInfo().boundingBox;
    const origin = new Vector3(
      boundingBox.minimumWorld.x,
      boundingBox.centerWorld.y,
      boundingBox.minimumWorld.z
    );

    const bounds = HexGrid.deriveBoundsFromWorldRect(
      origin,
      settings.hexSize,
      boundingBox.minimumWorld.x,
      boundingBox.maximumWorld.x,
      boundingBox.minimumWorld.z,
      boundingBox.maximumWorld.z
    );

    return new HexGrid(origin, settings.hexSize, bounds);
  }

  private createRuntime(
    scene: Scene,
    settings: HexGridSettings,
    preferredGroundMeshes: readonly AbstractMesh[]
  ): { grid: HexGrid; overlay: HexGridOverlay; pickerController: HexGroundPickerController } {
    const groundSelection = new HexGridGroundMeshResolver().resolve(scene, preferredGroundMeshes);
    groundSelection.groundMesh.isPickable = true;
    const grid = this.createGridFromGround(groundSelection.groundMesh, settings);
    const overlay = new HexGridOverlay(scene, grid, settings.overlayVerticalOffset);
    const pickerController = new HexGroundPickerController(scene, groundSelection.isGroundPick, grid, overlay);
    return { grid, overlay, pickerController };
  }
}
