import { Color4, Vector3, type AbstractMesh, type Scene } from "@babylonjs/core";
import { GridDebugState } from "./debug/GridDebugState";
import { DEFAULT_RECT_GRID_SETTINGS, type RectGridSettings } from "./RectGridSettings";
import { GridCell } from "./GridCell";
import { RectGrid } from "./RectGrid";
import { RectGridGroundMeshResolver } from "./RectGridGroundMeshResolver";
import { RectGridOverlay } from "./RectGridOverlay";
import { RectGroundPickerController } from "./RectGroundPickerController";
import type { PickedNavigationCell } from "./RectGroundPickerController";
import type { PickedNavigationTarget } from "./RectGroundPickerController";
import { BuildingNavigationRegistry } from "../navigation/BuildingNavigationRegistry";
import type { StoryDoorGridEdge, StoryGridCell, StoryGridEdge } from "./RectGridOverlay";
import { FloorNavigationSurfaceRegistry } from "../navigation/FloorNavigationSurfaceRegistry";
import { NavigationObstacleRegistry, type NavigationCover } from "../navigation/NavigationObstacleRegistry";
import { NavigationBlockerRegistry } from "../navigation/NavigationBlockerRegistry";
import type { StairNavigationConnector } from "../navigation/NavigationGraph";
import { WORLD_GRID_ORIGIN_X, WORLD_GRID_ORIGIN_Z } from "./WorldGridConstants";

export interface GridDebugDetectedCell {
  readonly cell: GridCell;
  readonly color: Color4;
}

export function validateAndRepairStairEndpointCells(
  connectors: readonly StairNavigationConnector[],
  floorNavigationSurfaceRegistry: Pick<FloorNavigationSurfaceRegistry, "isWalkableCell">,
  navigationBlockerRegistry: Pick<NavigationBlockerRegistry, "isCellBlocked" | "forceUnblockCell">
): number {
  let repairedEndpointCount = 0;
  for (const connector of connectors) {
    const fromWalkable = floorNavigationSurfaceRegistry.isWalkableCell(connector.fromCell, connector.fromStoryIndex);
    const toWalkable = floorNavigationSurfaceRegistry.isWalkableCell(connector.toCell, connector.toStoryIndex);
    const initialFromBlocked = navigationBlockerRegistry.isCellBlocked(connector.fromCell, connector.fromStoryIndex);
    const initialToBlocked = navigationBlockerRegistry.isCellBlocked(connector.toCell, connector.toStoryIndex);
    if (initialFromBlocked) {
      repairedEndpointCount += 1;
      console.warn(
        `[RectNavStairValidation] repaired blocked stair endpoint id=${connector.stairId} endpoint=from cell=${connector.fromStoryIndex}:${connector.fromCell.x}:${connector.fromCell.z} reason=gameFallbackCleanup invalidMetadata=true`
      );
      navigationBlockerRegistry.forceUnblockCell(connector.fromCell, connector.fromStoryIndex, `stairEndpoint:${connector.stairId}:from`);
    }
    if (initialToBlocked) {
      repairedEndpointCount += 1;
      console.warn(
        `[RectNavStairValidation] repaired blocked stair endpoint id=${connector.stairId} endpoint=to cell=${connector.toStoryIndex}:${connector.toCell.x}:${connector.toCell.z} reason=gameFallbackCleanup invalidMetadata=true`
      );
      navigationBlockerRegistry.forceUnblockCell(connector.toCell, connector.toStoryIndex, `stairEndpoint:${connector.stairId}:to`);
    }
    const fromBlocked = navigationBlockerRegistry.isCellBlocked(connector.fromCell, connector.fromStoryIndex);
    const toBlocked = navigationBlockerRegistry.isCellBlocked(connector.toCell, connector.toStoryIndex);
    console.info(
      `[RectNavStairValidation] id=${connector.stairId} ` +
      `from=${connector.fromStoryIndex}:${connector.fromCell.x}:${connector.fromCell.z} walkable=${fromWalkable} blocked=${fromBlocked} ` +
      `to=${connector.toStoryIndex}:${connector.toCell.x}:${connector.toCell.z} walkable=${toWalkable} blocked=${toBlocked} ` +
      `ok=${fromWalkable && !fromBlocked && toWalkable && !toBlocked}`
    );
  }
  return repairedEndpointCount;
}

/**
 * Wires grid grid logic, renderer, and picking runtime for the active scene.
 */
export class RectGridRuntime {
  private grid: RectGrid;
  private readonly debugState: GridDebugState;
  private overlay: RectGridOverlay;
  private pickerController: RectGroundPickerController;
  private readonly settings: RectGridSettings;
  private readonly buildingNavigationRegistry: BuildingNavigationRegistry;
  private readonly floorNavigationSurfaceRegistry: FloorNavigationSurfaceRegistry;
  private readonly navigationObstacleRegistry: NavigationObstacleRegistry;
  private readonly navigationBlockerRegistry: NavigationBlockerRegistry;
  private groundMesh: AbstractMesh;

  /**
   * Creates complete in-game grid runtime module.
   */
  public constructor(
    scene: Scene,
    settings: RectGridSettings = DEFAULT_RECT_GRID_SETTINGS,
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
    this.validateStairEndpointCells();
    this.pickerController.setWalkableCellPredicate((cell, storyIndex) => this.isWalkableCell(cell, storyIndex));
    this.refreshOverlayNavigationData();
    this.debugState = new GridDebugState(settings.debugEnabledByDefault);
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

  public setVisionCells(cells: readonly GridCell[]): void {
    this.overlay.setVisionCells(cells);
  }

  public setPatrolTargetCells(cells: readonly GridCell[]): void {
    this.overlay.setPatrolTargetCells(cells);
  }

  public setDetectedCells(cells: readonly GridDebugDetectedCell[]): void {
    this.overlay.setDetectedCells(cells);
  }

  public clearDebugHighlights(): void {
    this.overlay.clearDebugHighlights();
  }

  public setMoveRangeCells(cells: readonly GridCell[]): void {
    this.overlay.setMoveRangeCells(cells);
  }

  public setMovePathCells(cells: readonly GridCell[]): void {
    this.overlay.setMovePathCells(cells);
  }

  public setMoveRangeNavigationCells(cells: readonly StoryGridCell[]): void {
    this.overlay.setMoveRangeNavigationCells(cells);
  }

  public setMovePathNavigationCells(cells: readonly StoryGridCell[]): void {
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
    this.validateStairEndpointCells();
    this.pickerController.setWalkableCellPredicate((cell, storyIndex) => this.isWalkableCell(cell, storyIndex));
    this.refreshOverlayNavigationData();
    this.buildingNavigationRegistry.setDebugVisible(this.debugState.getIsDebugEnabled());
  }

  /**
   * Returns logical grid grid backing this runtime.
   */
  public getGrid(): RectGrid {
    return this.grid;
  }

  /**
   * Returns currently hovered ground grid under pointer, if any.
   */
  public getHoveredCell(): GridCell | null {
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

  public isNavigationCellBlocked(cell: GridCell, storyIndex: number): boolean {
    return this.navigationBlockerRegistry.isCellBlocked(cell, storyIndex);
  }

  public isNavigationEdgeBlocked(fromCell: GridCell, toCell: GridCell, storyIndex: number): boolean {
    return this.navigationBlockerRegistry.isEdgeBlocked(fromCell, toCell, storyIndex);
  }

  public isWalkableCell(cell: GridCell, storyIndex: number): boolean {
    if (!this.floorNavigationSurfaceRegistry.isWalkableCell(cell, storyIndex)) {
      return false;
    }

    return !this.navigationBlockerRegistry.isCellBlocked(cell, storyIndex);
  }

  public getWalkableCells(storyIndex: number): readonly GridCell[] {
    return this.floorNavigationSurfaceRegistry
      .getWalkableCells(storyIndex)
      .filter((cell) => this.isWalkableCell(cell, storyIndex));
  }

  public getMergedStoryYByStory(): ReadonlyMap<number, number> {
    return this.mergeStoryYMaps();
  }

  public getMovementCost(cell: GridCell, storyIndex: number): number {
    if (!this.isWalkableCell(cell, storyIndex)) {
      return Number.POSITIVE_INFINITY;
    }

    return this.navigationObstacleRegistry.getMovementCost(cell, storyIndex);
  }

  public getCover(cell: GridCell, storyIndex: number): "none" | NavigationCover {
    return this.navigationObstacleRegistry.getCover(cell, storyIndex);
  }

  public isVisionBlocked(cell: GridCell, storyIndex: number): boolean {
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
      fromStory: target.fromStory,
      toStory: target.toStory,
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
   * Origin strategy: world X/Z origin is the shared editor/runtime contract.
   * Ground AABB only decides how many bounded cells are created.
   */
  private createGridFromGround(groundMeshes: readonly AbstractMesh[], settings: RectGridSettings): RectGrid {
    const sourceMeshes = groundMeshes.length > 0 ? groundMeshes : [];
    const primaryGroundMesh = sourceMeshes[0];
    if (!primaryGroundMesh) {
      throw new Error("[RectGridRuntime] Cannot create grid without ground meshes.");
    }

    let minX = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY;
    let minZ = Number.POSITIVE_INFINITY;
    let maxZ = Number.NEGATIVE_INFINITY;
    let minY = Number.POSITIVE_INFINITY;

    for (const groundMesh of sourceMeshes) {
      const boundingBox = groundMesh.getBoundingInfo().boundingBox;
      minX = Math.min(minX, boundingBox.minimumWorld.x);
      maxX = Math.max(maxX, boundingBox.maximumWorld.x);
      minZ = Math.min(minZ, boundingBox.minimumWorld.z);
      maxZ = Math.max(maxZ, boundingBox.maximumWorld.z);
      minY = Math.min(minY, boundingBox.centerWorld.y);
    }

    const origin = new Vector3(
      WORLD_GRID_ORIGIN_X,
      minY,
      WORLD_GRID_ORIGIN_Z
    );

    const bounds = RectGrid.deriveBoundsFromWorldRect(
      origin,
      settings.tileSize,
      minX,
      maxX,
      minZ,
      maxZ
    );

    return new RectGrid(origin, settings.tileSize, bounds);
  }

  private createRuntime(
    scene: Scene,
    settings: RectGridSettings,
    preferredGroundMeshes: readonly AbstractMesh[]
  ): { grid: RectGrid; overlay: RectGridOverlay; pickerController: RectGroundPickerController; groundMesh: AbstractMesh } {
    const groundSelection = new RectGridGroundMeshResolver().resolve(scene, preferredGroundMeshes);
    groundSelection.groundMesh.isPickable = true;
    for (const groundMesh of groundSelection.groundMeshes) {
      groundMesh.isPickable = true;
    }
    const grid = this.createGridFromGround(groundSelection.groundMeshes, settings);
    const overlay = new RectGridOverlay(scene, grid, settings.overlayVerticalOffset);
    const pickerController = new RectGroundPickerController(scene, groundSelection.isGroundPick, grid, overlay);
    return { grid, overlay, pickerController, groundMesh: groundSelection.groundMesh };
  }

  private addForcedStairEndpointCells(): void {
    for (const connector of this.buildingNavigationRegistry.getStairConnectors()) {
      this.floorNavigationSurfaceRegistry.addForcedWalkableCell(connector.fromCell, connector.fromStoryIndex);
      this.floorNavigationSurfaceRegistry.addForcedWalkableCell(connector.toCell, connector.toStoryIndex);
    }
  }

  private validateStairEndpointCells(): void {
    validateAndRepairStairEndpointCells(
      this.buildingNavigationRegistry.getStairConnectors(),
      this.floorNavigationSurfaceRegistry,
      this.navigationBlockerRegistry
    );
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
    this.overlay.setBlockedNavigationEdges(this.getBlockedEdgeEntries());
    this.overlay.setDoorNavigationEdges(this.getDoorEdgeEntries());
    this.pickerController.setStoryYResolver((storyIndex) =>
      storyYByStory.get(storyIndex) ?? this.grid.getOrigin().y
    );
    this.pickerController.setStoryIndicesProvider(() =>
      this.floorNavigationSurfaceRegistry.getStoryIndices()
    );
  }

  private getWalkableCellEntries(): readonly StoryGridCell[] {
    return this.floorNavigationSurfaceRegistry
      .getWalkableCellEntries()
      .filter((entry) => this.isWalkableCell(entry.cell, entry.storyIndex));
  }

  private getBlockedEdgeEntries(): readonly StoryGridEdge[] {
    return this.navigationBlockerRegistry.getBlockedEdgeEntries().map((entry) => ({
      storyIndex: entry.storyIndex,
      a: entry.a,
      b: entry.b
    }));
  }

  private getDoorEdgeEntries(): readonly StoryDoorGridEdge[] {
    return this.navigationBlockerRegistry.getDoorEdgeEntries().map((entry) => ({
      storyIndex: entry.storyIndex,
      a: entry.a,
      b: entry.b,
      isOpen: entry.isOpen
    }));
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
