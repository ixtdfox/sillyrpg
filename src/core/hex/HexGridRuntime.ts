import { Color4, Vector3, type AbstractMesh, type Scene } from "@babylonjs/core";
import { HexGridDebugState } from "./debug/HexGridDebugState";
import { DEFAULT_HEX_GRID_SETTINGS, type HexGridSettings } from "./HexGridSettings";
import { HexCell } from "./HexCell";
import { HexGrid } from "./HexGrid";
import { HexGridGroundMeshResolver } from "./HexGridGroundMeshResolver";
import { HexGridOverlay } from "./HexGridOverlay";
import { HexGroundPickerController } from "./HexGroundPickerController";
import type { PickedNavigationCell } from "./HexGroundPickerController";
import type { PickedNavigationTarget } from "./HexGroundPickerController";
import { BuildingNavigationRegistry } from "../navigation/BuildingNavigationRegistry";
import type { StoryHexCell } from "./HexGridOverlay";
import { FloorNavigationSurfaceRegistry } from "../navigation/FloorNavigationSurfaceRegistry";
import { NavigationObstacleRegistry, type NavigationCover } from "../navigation/NavigationObstacleRegistry";
import { NavigationBlockerRegistry } from "../navigation/NavigationBlockerRegistry";

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
  private readonly buildingNavigationRegistry: BuildingNavigationRegistry;
  private readonly floorNavigationSurfaceRegistry: FloorNavigationSurfaceRegistry;
  private readonly navigationObstacleRegistry: NavigationObstacleRegistry;
  private readonly navigationBlockerRegistry: NavigationBlockerRegistry;
  private groundMesh: AbstractMesh;

  /**
   * Creates complete in-game hex runtime module.
   */
  public constructor(
    scene: Scene,
    settings: HexGridSettings = DEFAULT_HEX_GRID_SETTINGS,
    preferredGroundMeshes: readonly AbstractMesh[] = []
  ) {
    this.settings = settings;
    const { grid, overlay, pickerController, groundMesh } = this.createRuntime(scene, settings, preferredGroundMeshes);
    this.grid = grid;
    this.overlay = overlay;
    this.pickerController = pickerController;
    this.groundMesh = groundMesh;
    this.buildingNavigationRegistry = new BuildingNavigationRegistry();
    this.floorNavigationSurfaceRegistry = new FloorNavigationSurfaceRegistry();
    this.navigationObstacleRegistry = new NavigationObstacleRegistry();
    this.navigationBlockerRegistry = new NavigationBlockerRegistry();
    this.floorNavigationSurfaceRegistry.rebuild(scene, this.grid, { forcedGroundMesh: this.groundMesh });
    this.buildingNavigationRegistry.rebuild(scene, this.grid);
    this.addForcedStairEndpointCells();
    this.rebuildNavigationMetadata(scene);
    this.pickerController.setWalkableCellPredicate((cell, storyIndex) => this.isWalkableCell(cell, storyIndex));
    this.refreshOverlayNavigationData();
    this.debugState = new HexGridDebugState(settings.debugEnabledByDefault);
    this.overlay.setDebugVisible(this.debugState.getIsDebugEnabled());
    this.buildingNavigationRegistry.setDebugVisible(this.debugState.getIsDebugEnabled());
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
    this.buildingNavigationRegistry.setDebugVisible(isEnabled);
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

  public setMoveRangeNavigationCells(cells: readonly StoryHexCell[]): void {
    this.overlay.setMoveRangeNavigationCells(cells);
  }

  public setMovePathNavigationCells(cells: readonly StoryHexCell[]): void {
    this.overlay.setMovePathNavigationCells(cells);
  }

  public clearCombatMovementPreview(): void {
    this.overlay.clearCombatMovementPreview();
  }

  public dispose(): void {
    this.pickerController.dispose();
    this.overlay.dispose();
    this.buildingNavigationRegistry.dispose();
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
    this.groundMesh = runtime.groundMesh;
    this.overlay.setDebugVisible(this.debugState.getIsDebugEnabled());
    this.pickerController = runtime.pickerController;
    this.floorNavigationSurfaceRegistry.rebuild(scene, this.grid, { forcedGroundMesh: this.groundMesh });
    this.buildingNavigationRegistry.rebuild(scene, this.grid);
    this.addForcedStairEndpointCells();
    this.rebuildNavigationMetadata(scene);
    this.pickerController.setWalkableCellPredicate((cell, storyIndex) => this.isWalkableCell(cell, storyIndex));
    this.refreshOverlayNavigationData();
    this.buildingNavigationRegistry.setDebugVisible(this.debugState.getIsDebugEnabled());
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

  public getHoveredNavigationCell(fallbackStoryIndex = 0): PickedNavigationCell | null {
    return this.pickerController.getHoveredNavigationCell(fallbackStoryIndex);
  }

  public getHoveredNavigationTarget(fallbackStoryIndex = 0): PickedNavigationTarget | null {
    return this.pickerController.getHoveredNavigationTarget(fallbackStoryIndex);
  }

  public getBuildingNavigationRegistry(): BuildingNavigationRegistry {
    return this.buildingNavigationRegistry;
  }

  public getFloorNavigationSurfaceRegistry(): FloorNavigationSurfaceRegistry {
    return this.floorNavigationSurfaceRegistry;
  }

  public getNavigationObstacleRegistry(): NavigationObstacleRegistry {
    return this.navigationObstacleRegistry;
  }

  public getNavigationBlockerRegistry(): NavigationBlockerRegistry {
    return this.navigationBlockerRegistry;
  }

  public isNavigationCellBlocked(cell: HexCell, storyIndex: number): boolean {
    return this.navigationBlockerRegistry.isCellBlocked(cell, storyIndex);
  }

  public isNavigationEdgeBlocked(fromCell: HexCell, toCell: HexCell, storyIndex: number): boolean {
    return this.navigationBlockerRegistry.isEdgeBlocked(fromCell, toCell, storyIndex);
  }

  public isWalkableCell(cell: HexCell, storyIndex: number): boolean {
    if (!this.floorNavigationSurfaceRegistry.isWalkableCell(cell, storyIndex)) {
      return false;
    }

    return !this.navigationBlockerRegistry.isCellBlocked(cell, storyIndex);
  }

  public getWalkableCells(storyIndex: number): readonly HexCell[] {
    return this.floorNavigationSurfaceRegistry
      .getWalkableCells(storyIndex)
      .filter((cell) => this.isWalkableCell(cell, storyIndex));
  }

  public getMergedStoryYByStory(): ReadonlyMap<number, number> {
    return this.mergeStoryYMaps();
  }

  public getMovementCost(cell: HexCell, storyIndex: number): number {
    if (!this.isWalkableCell(cell, storyIndex)) {
      return Number.POSITIVE_INFINITY;
    }

    return this.navigationObstacleRegistry.getMovementCost(cell, storyIndex);
  }

  public getCover(cell: HexCell, storyIndex: number): "none" | NavigationCover {
    return this.navigationObstacleRegistry.getCover(cell, storyIndex);
  }

  public isVisionBlocked(cell: HexCell, storyIndex: number): boolean {
    return this.navigationObstacleRegistry.isVisionBlocked(cell, storyIndex);
  }

  public setNavigationFallbackStoryIndex(storyIndex: number): void {
    this.pickerController.setFallbackStoryIndex(storyIndex);
    this.overlay.setCurrentStoryIndex(storyIndex);
  }

  public updateStairHoverAffordance(target: PickedNavigationTarget | null, currentStoryIndex: number): void {
    if (target?.kind !== "stair") {
      this.buildingNavigationRegistry.setHoveredStairConnector(null, currentStoryIndex);
      return;
    }

    const resolvedTarget = this.buildingNavigationRegistry.resolveStairInteractionTarget({
      stairId: target.stairId,
      pickedPoint: target.pickedPoint,
      currentStoryIndex
    });
    this.buildingNavigationRegistry.setHoveredStairConnector(
      resolvedTarget?.connector.stairId ?? target.stairId ?? null,
      currentStoryIndex
    );
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
  ): { grid: HexGrid; overlay: HexGridOverlay; pickerController: HexGroundPickerController; groundMesh: AbstractMesh } {
    const groundSelection = new HexGridGroundMeshResolver().resolve(scene, preferredGroundMeshes);
    groundSelection.groundMesh.isPickable = true;
    const grid = this.createGridFromGround(groundSelection.groundMesh, settings);
    const overlay = new HexGridOverlay(scene, grid, settings.overlayVerticalOffset);
    const pickerController = new HexGroundPickerController(scene, groundSelection.isGroundPick, grid, overlay);
    return { grid, overlay, pickerController, groundMesh: groundSelection.groundMesh };
  }

  private addForcedStairEndpointCells(): void {
    for (const connector of this.buildingNavigationRegistry.getStairConnectors()) {
      this.floorNavigationSurfaceRegistry.addForcedWalkableCell(connector.fromCell, connector.fromStoryIndex);
      this.floorNavigationSurfaceRegistry.addForcedWalkableCell(connector.toCell, connector.toStoryIndex);
    }
  }

  private rebuildNavigationMetadata(scene: Scene): void {
    const storyYByStory = this.mergeStoryYMaps();
    this.navigationObstacleRegistry.rebuild(scene, this.grid, storyYByStory);
    this.navigationBlockerRegistry.rebuild(scene, this.grid, storyYByStory);
  }

  private refreshOverlayNavigationData(): void {
    const storyYByStory = this.mergeStoryYMaps();
    this.overlay.setStoryYByStory(storyYByStory);
    this.overlay.setWalkableNavigationCells(this.getWalkableCellEntries());
    this.overlay.setBlockedNavigationCells(this.navigationBlockerRegistry.getBlockedCellEntries());
    this.pickerController.setStoryYResolver((storyIndex) =>
      storyYByStory.get(storyIndex) ?? this.grid.getOrigin().y
    );
    this.pickerController.setStoryIndicesProvider(() =>
      this.floorNavigationSurfaceRegistry.getStoryIndices()
    );
  }

  private getWalkableCellEntries(): readonly StoryHexCell[] {
    return this.floorNavigationSurfaceRegistry
      .getWalkableCellEntries()
      .filter((entry) => this.isWalkableCell(entry.cell, entry.storyIndex));
  }

  private mergeStoryYMaps(): ReadonlyMap<number, number> {
    const merged = new Map<number, number>();
    for (const [storyIndex, y] of this.buildingNavigationRegistry.getStoryYByStory()) {
      merged.set(storyIndex, y);
    }
    for (const [storyIndex, y] of this.floorNavigationSurfaceRegistry.getStoryYByStory()) {
      merged.set(storyIndex, y);
    }
    return merged;
  }
}
