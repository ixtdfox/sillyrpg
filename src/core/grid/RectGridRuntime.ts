import { Color4, Vector3, type AbstractMesh, type Scene } from "@babylonjs/core";
import { GridDebugState } from "./debug/GridDebugState";
import { DEFAULT_RECT_GRID_SETTINGS, type RectGridSettings } from "./RectGridSettings";
import { GridCell } from "./GridCell";
import { RectGrid, RectGridBoundsFactory } from "./RectGrid";
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
import { SurfaceHeightResolver } from "../world/surface/SurfaceHeightResolver";
import { TerrainSurfaceRegistry } from "../world/terrain/TerrainSurfaceRegistry";
import { WORLD_GRID_ORIGIN_X, WORLD_GRID_ORIGIN_Z } from "./WorldGridConstants";

/**
 * Описание debug-подсветки клетки.
 */
export interface GridDebugDetectedCell {
  readonly cell: GridCell;
  readonly color: Color4;
}

/**
 * Сервис санитарной проверки stair endpoints.
 *
 * Навигационные контракты иногда приходят с блокерами на клетках входа/выхода
 * лестницы. Для gameplay это хуже, чем мягкая коррекция: персонаж видит лестницу,
 * но pathfinding не может войти в connector. Сервис инкапсулирует Strategy
 * ремонта таких клеток и возвращает количество исправленных endpoints.
 */
export class StairEndpointCellRepairService {
  public validateAndRepair(
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
}

/**
 * Результат сборки runtime-частей вокруг выбранной земли.
 */
interface RectGridRuntimeAssembly {
  readonly grid: RectGrid;
  readonly overlay: RectGridOverlay;
  readonly pickerController: RectGroundPickerController;
  readonly groundMesh: AbstractMesh;
}

/**
 * Фабрика RectGrid из meshes земли.
 *
 * Она отделяет правила вычисления origin/bounds от RectGridRuntime: runtime
 * теперь оркестрирует подсистемы, а не занимается геометрией сцены вручную.
 */
export class RectGridFromGroundFactory {
  private readonly boundsFactory: RectGridBoundsFactory;

  public constructor(boundsFactory = new RectGridBoundsFactory()) {
    this.boundsFactory = boundsFactory;
  }

  public create(groundMeshes: readonly AbstractMesh[], settings: RectGridSettings): RectGrid {
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

    const bounds = this.boundsFactory.deriveFromWorldRect(
      origin,
      settings.tileSize,
      minX,
      maxX,
      minZ,
      maxZ
    );

    return new RectGrid(origin, settings.tileSize, bounds);
  }
}

/**
 * Абстрактная фабрика для runtime-сборки сетки.
 *
 * В одном месте создаются связанные объекты: ground selection, RectGrid,
 * overlay и picker. Это снижает риск, что при rebuild будет создана новая
 * сетка, но picker/overlay случайно останутся привязаны к старой.
 */
export class RectGridRuntimeAssemblyFactory {
  private readonly groundMeshResolver: RectGridGroundMeshResolver;
  private readonly gridFactory: RectGridFromGroundFactory;

  public constructor(
    groundMeshResolver = new RectGridGroundMeshResolver(),
    gridFactory = new RectGridFromGroundFactory()
  ) {
    this.groundMeshResolver = groundMeshResolver;
    this.gridFactory = gridFactory;
  }

  public create(
    scene: Scene,
    settings: RectGridSettings,
    preferredGroundMeshes: readonly AbstractMesh[]
  ): RectGridRuntimeAssembly {
    const groundSelection = this.groundMeshResolver.resolve(scene, preferredGroundMeshes);
    groundSelection.groundMesh.isPickable = true;
    for (const groundMesh of groundSelection.groundMeshes) {
      groundMesh.isPickable = true;
    }
    const grid = this.gridFactory.create(groundSelection.groundMeshes, settings);
    const overlay = new RectGridOverlay(scene, grid, settings.overlayVerticalOffset);
    const pickerController = new RectGroundPickerController(scene, groundSelection.isGroundPick, grid, overlay);
    return { grid, overlay, pickerController, groundMesh: groundSelection.groundMesh };
  }
}

/**
 * Оркестратор runtime-сетки активной сцены.
 *
 * Класс связывает модель RectGrid, debug overlay, picking, этажную навигацию,
 * препятствия и surface height resolver. Создание деталей делегировано фабрикам
 * и сервисам, чтобы runtime оставался фасадом для gameplay-кода.
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
  private readonly terrainSurfaceRegistry: TerrainSurfaceRegistry;
  private readonly surfaceHeightResolver: SurfaceHeightResolver;
  private readonly runtimeAssemblyFactory: RectGridRuntimeAssemblyFactory;
  private readonly stairEndpointRepairService: StairEndpointCellRepairService;
  private groundMesh: AbstractMesh;

  /**
   * Создает полный runtime-модуль сетки для текущей сцены.
   */
  public constructor(
    scene: Scene,
    settings: RectGridSettings = DEFAULT_RECT_GRID_SETTINGS,
    preferredGroundMeshes: readonly AbstractMesh[] = []
  ) {
    this.settings = settings;
    this.runtimeAssemblyFactory = new RectGridRuntimeAssemblyFactory();
    this.stairEndpointRepairService = new StairEndpointCellRepairService();
    const { grid, overlay, pickerController, groundMesh } = this.runtimeAssemblyFactory.create(scene, settings, preferredGroundMeshes);
    this.grid = grid;
    this.overlay = overlay;
    this.pickerController = pickerController;
    this.groundMesh = groundMesh;
    this.buildingNavigationRegistry = new BuildingNavigationRegistry();
    this.floorNavigationSurfaceRegistry = new FloorNavigationSurfaceRegistry();
    this.navigationObstacleRegistry = new NavigationObstacleRegistry();
    this.navigationBlockerRegistry = new NavigationBlockerRegistry();
    this.terrainSurfaceRegistry = new TerrainSurfaceRegistry();
    this.surfaceHeightResolver = new SurfaceHeightResolver(this, this.terrainSurfaceRegistry);
    this.terrainSurfaceRegistry.rebuildFromMeshes(preferredGroundMeshes);
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
   * Возвращает текущее состояние debug-сетки.
   */
  public getIsDebugEnabled(): boolean {
    return this.debugState.getIsDebugEnabled();
  }

  /**
   * Переключает debug-визуализацию и возвращает новое значение.
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
   * Пересобирает grid/overlay/picker под текущие меши сцены.
   *
   * @param scene - Сцена с геометрией активного района.
   */
  public rebuild(scene: Scene, preferredGroundMeshes: readonly AbstractMesh[] = []): void {
    const runtime = this.runtimeAssemblyFactory.create(scene, this.settings, preferredGroundMeshes);

    this.pickerController.dispose();
    this.overlay.dispose();
    this.grid = runtime.grid;
    this.overlay = runtime.overlay;
    this.groundMesh = runtime.groundMesh;
    this.overlay.setDebugVisible(this.debugState.getIsDebugEnabled());
    this.pickerController = runtime.pickerController;
    this.terrainSurfaceRegistry.rebuildFromMeshes(preferredGroundMeshes);
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
   * Возвращает логическую RectGrid, на которой работают runtime-системы.
   */
  public getGrid(): RectGrid {
    return this.grid;
  }

  /**
   * Возвращает наведенную клетку земли под pointer, если она есть.
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

  public getTerrainSurfaceRegistry(): TerrainSurfaceRegistry {
    return this.terrainSurfaceRegistry;
  }

  public getSurfaceHeightResolver(): SurfaceHeightResolver {
    return this.surfaceHeightResolver;
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
   * Гарантирует, что endpoints всех stair connectors считаются walkable.
   */
  private addForcedStairEndpointCells(): void {
    for (const connector of this.buildingNavigationRegistry.getStairConnectors()) {
      this.floorNavigationSurfaceRegistry.addForcedWalkableCell(connector.fromCell, connector.fromStoryIndex);
      this.floorNavigationSurfaceRegistry.addForcedWalkableCell(connector.toCell, connector.toStoryIndex);
    }
  }

  /**
   * Запускает repair-сервис для blocked stair endpoints после rebuild metadata.
   */
  private validateStairEndpointCells(): void {
    this.stairEndpointRepairService.validateAndRepair(
      this.buildingNavigationRegistry.getStairConnectors(),
      this.floorNavigationSurfaceRegistry,
      this.navigationBlockerRegistry
    );
  }

  /**
   * Пересобирает obstacle/blocker metadata уже после создания grid и этажей.
   */
  private rebuildNavigationMetadata(scene: Scene): void {
    const storyYByStory = this.mergeStoryYMaps();
    this.navigationObstacleRegistry.rebuild(scene, this.grid, storyYByStory);
    this.navigationBlockerRegistry.rebuild(scene, this.grid, storyYByStory);
  }

  /**
   * Синхронизирует overlay и picker с актуальными navigation registries.
   */
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

  /**
   * Возвращает walkable клетки, уже очищенные от blockers.
   */
  private getWalkableCellEntries(): readonly StoryGridCell[] {
    return this.floorNavigationSurfaceRegistry
      .getWalkableCellEntries()
      .filter((entry) => this.isWalkableCell(entry.cell, entry.storyIndex));
  }

  /**
   * Адаптирует entries blockers registry к формату overlay.
   */
  private getBlockedEdgeEntries(): readonly StoryGridEdge[] {
    return this.navigationBlockerRegistry.getBlockedEdgeEntries().map((entry) => ({
      storyIndex: entry.storyIndex,
      a: entry.a,
      b: entry.b
    }));
  }

  /**
   * Адаптирует door-edge entries к формату overlay.
   */
  private getDoorEdgeEntries(): readonly StoryDoorGridEdge[] {
    return this.navigationBlockerRegistry.getDoorEdgeEntries().map((entry) => ({
      storyIndex: entry.storyIndex,
      a: entry.a,
      b: entry.b,
      isOpen: entry.isOpen
    }));
  }

  /**
   * Склеивает высоты этажей из building и floor registries.
   */
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
