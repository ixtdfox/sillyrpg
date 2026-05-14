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
import { GridCell } from "./GridCell";
import { RectGrid } from "./RectGrid";

interface GridCellHighlightSpec {
  readonly cell: GridCell;
  readonly storyIndex?: number;
  readonly color: Color4;
}

/**
 * Клетка с привязкой к этажу для многоэтажного overlay.
 */
export interface StoryGridCell {
  readonly cell: GridCell;
  readonly storyIndex: number;
}

/**
 * Пул meshes для одного типа подсветки.
 *
 * Слой overlay часто обновляется во время hover/combat preview, поэтому meshes
 * переиспользуются вместо постоянного create/dispose.
 */
interface GridHighlightPool {
  readonly name: string;
  readonly meshes: Mesh[];
}

/**
 * Ребро между двумя клетками на конкретном этаже.
 */
export interface StoryGridEdge {
  readonly storyIndex: number;
  readonly a: GridCell;
  readonly b: GridCell;
}

/**
 * Ребро двери расширяет обычное ребро состоянием двери.
 */
export interface StoryDoorGridEdge extends StoryGridEdge {
  readonly isOpen: boolean;
}

/**
 * Рендерер debug-сетки, hover-клетки и tactical highlights.
 *
 * Класс является View/Presenter для RectGridRuntime: он не решает, какие клетки
 * walkable или blocked, а только получает готовые DTO и поддерживает Babylon
 * meshes/materials в актуальном состоянии.
 */
export class RectGridOverlay {
  private readonly scene: Scene;
  private readonly grid: RectGrid;
  private readonly verticalOffset: number;
  private readonly gridMesh: LinesMesh;
  private currentStoryGridMesh: LinesMesh | null;
  private readonly hoverMesh: LinesMesh;
  private readonly visionPool: GridHighlightPool;
  private readonly patrolPool: GridHighlightPool;
  private readonly detectedPool: GridHighlightPool;
  private readonly blockedNavigationPool: GridHighlightPool;
  private readonly moveRangePool: GridHighlightPool;
  private readonly movePathPool: GridHighlightPool;
  private readonly blockedEdgeMeshes: LinesMesh[];
  private readonly doorEdgeMeshes: LinesMesh[];

  private isDebugVisible: boolean;
  private visionCells: GridCell[];
  private patrolTargetCells: GridCell[];
  private detectedCells: GridCellHighlightSpec[];
  private moveRangeCells: GridCell[];
  private movePathCells: GridCell[];
  private moveRangeNavigationCells: StoryGridCell[];
  private movePathNavigationCells: StoryGridCell[];
  private storyYByStory: ReadonlyMap<number, number>;
  private currentStoryIndex: number;
  private walkableNavigationCells: StoryGridCell[];
  private blockedNavigationCells: StoryGridCell[];
  private blockedNavigationEdges: StoryGridEdge[];
  private doorNavigationEdges: StoryDoorGridEdge[];

  /**
   * Создает визуальные meshes для debug grid и hover-клетки.
   */
  public constructor(scene: Scene, grid: RectGrid, verticalOffset: number) {
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

    this.visionPool = this.createHighlightPool("grid-vision-highlight");
    this.patrolPool = this.createHighlightPool("grid-patrol-highlight");
    this.detectedPool = this.createHighlightPool("grid-detected-highlight");
    this.blockedNavigationPool = this.createHighlightPool("grid-navigation-blocked");
    this.moveRangePool = this.createHighlightPool("grid-combat-move-range");
    this.movePathPool = this.createHighlightPool("grid-combat-move-path");
    this.blockedEdgeMeshes = [];
    this.doorEdgeMeshes = [];

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
    this.blockedNavigationCells = [];
    this.blockedNavigationEdges = [];
    this.doorNavigationEdges = [];
  }

  public setDebugVisible(isVisible: boolean): void {
    this.isDebugVisible = isVisible;
    this.refreshGridVisibility();
    this.refreshHighlights();
  }

  /**
   * Задает клетки, видимые системой perception.
   */
  public setVisionCells(cells: readonly GridCell[]): void {
    this.visionCells = [...cells];
    this.refreshHighlights();
  }

  /**
   * Задает клетки patrol target подсветки.
   */
  public setPatrolTargetCells(cells: readonly GridCell[]): void {
    this.patrolTargetCells = [...cells];
    this.refreshHighlights();
  }

  /**
   * Задает клетки обнаружения с индивидуальным цветом/приоритетом.
   */
  public setDetectedCells(cells: readonly GridCellHighlightSpec[]): void {
    this.detectedCells = [...cells];
    this.refreshHighlights();
  }

  /**
   * Очищает transient debug-подсветки perception/patrol/detection.
   */
  public clearDebugHighlights(): void {
    this.visionCells = [];
    this.patrolTargetCells = [];
    this.detectedCells = [];
    this.refreshHighlights();
  }

  /**
   * Задает одноэтажный combat move range для legacy callers.
   */
  public setMoveRangeCells(cells: readonly GridCell[]): void {
    this.moveRangeCells = [...cells];
    this.moveRangeNavigationCells = [];
    this.refreshHighlights();
  }

  /**
   * Задает одноэтажный combat path для legacy callers.
   */
  public setMovePathCells(cells: readonly GridCell[]): void {
    this.movePathCells = [...cells];
    this.movePathNavigationCells = [];
    this.refreshHighlights();
  }

  /**
   * Задает многоэтажный combat move range.
   */
  public setMoveRangeNavigationCells(cells: readonly StoryGridCell[]): void {
    this.moveRangeCells = [];
    this.moveRangeNavigationCells = [...cells];
    this.refreshHighlights();
  }

  /**
   * Задает многоэтажный combat path.
   */
  public setMovePathNavigationCells(cells: readonly StoryGridCell[]): void {
    this.movePathCells = [];
    this.movePathNavigationCells = [...cells];
    this.refreshHighlights();
  }

  /**
   * Сбрасывает все combat preview highlights.
   */
  public clearCombatMovementPreview(): void {
    this.moveRangeCells = [];
    this.movePathCells = [];
    this.moveRangeNavigationCells = [];
    this.movePathNavigationCells = [];
    this.refreshHighlights();
  }

  /**
   * Фасад для старых вызовов: подсвечивает клетку на нулевом этаже.
   */
  public setHoveredCell(cell: GridCell): void {
    this.setHoveredNavigationCell(cell, 0);
  }

  /**
   * Подсвечивает наведенную navigation-клетку на конкретном этаже.
   */
  public setHoveredNavigationCell(cell: GridCell, storyIndex: number): void {
    if (!this.isCellOverlayAllowed(cell, storyIndex)) {
      this.hideHoveredCell();
      return;
    }

    const center = this.grid.cellToWorld(cell, this.getStoryY(storyIndex));
    this.hoverMesh.position.copyFrom(center);
    this.hoverMesh.position.y += this.verticalOffset * 1.2;
    this.hoverMesh.isVisible = true;
  }

  /**
   * Обновляет высоты этажей, используемые для вертикального размещения overlay.
   */
  public setStoryYByStory(storyYByStory: ReadonlyMap<number, number>): void {
    this.storyYByStory = new Map(storyYByStory);
    this.rebuildCurrentStoryGridMesh();
    this.refreshHighlights();
  }

  /**
   * Переключает этаж, для которого рисуется current-story grid.
   */
  public setCurrentStoryIndex(storyIndex: number): void {
    if (this.currentStoryIndex === storyIndex) {
      return;
    }

    this.currentStoryIndex = storyIndex;
    this.rebuildCurrentStoryGridMesh();
    this.refreshHighlights();
  }

  /**
   * Обновляет список walkable клеток и пересобирает сетку текущего этажа.
   */
  public setWalkableNavigationCells(cells: readonly StoryGridCell[]): void {
    this.walkableNavigationCells = [...cells];
    this.rebuildCurrentStoryGridMesh();
    this.refreshHighlights();
  }

  /**
   * Обновляет blocked-cell overlay.
   */
  public setBlockedNavigationCells(cells: readonly StoryGridCell[]): void {
    this.blockedNavigationCells = [...cells];
    this.refreshHighlights();
  }

  /**
   * Обновляет blocked-edge overlay.
   */
  public setBlockedNavigationEdges(edges: readonly StoryGridEdge[]): void {
    this.blockedNavigationEdges = [...edges];
    this.refreshHighlights();
  }

  /**
   * Обновляет door-edge overlay.
   */
  public setDoorNavigationEdges(edges: readonly StoryDoorGridEdge[]): void {
    this.doorNavigationEdges = [...edges];
    this.refreshHighlights();
  }

  /**
   * Скрывает hover mesh, когда pointer ушел с валидной navigation-клетки.
   */
  public hideHoveredCell(): void {
    this.hoverMesh.isVisible = false;
  }

  /**
   * Освобождает Babylon meshes/materials, созданные overlay.
   */
  public dispose(): void {
    this.gridMesh.dispose();
    this.currentStoryGridMesh?.dispose();
    this.hoverMesh.dispose();
    this.disposePool(this.visionPool);
    this.disposePool(this.patrolPool);
    this.disposePool(this.detectedPool);
    this.disposePool(this.blockedNavigationPool);
    this.disposePool(this.moveRangePool);
    this.disposePool(this.movePathPool);
    this.disposeEdgeMeshes(this.blockedEdgeMeshes);
    this.disposeEdgeMeshes(this.doorEdgeMeshes);
  }

  /**
   * Строит статический line mesh для всех клеток bounded grid.
   *
   * Ограничение: это fallback-сетка по прямоугольным bounds. Когда доступны
   * walkableNavigationCells, current-story mesh заменяет ее этажной сеткой.
   */
  private buildGridMesh(): LinesMesh {
    const lines: Vector3[][] = [];

    for (const cell of this.grid.getCellsWithinBounds()) {
      const points = this.buildRectPoints(cell, this.grid.getOrigin().y, this.verticalOffset);
      lines.push(points);
    }

    return MeshBuilder.CreateLineSystem("rect-grid-overlay", { lines, updatable: false }, this.scene);
  }

  private buildHoverMesh(): LinesMesh {
    const points = [
      new Vector3(-0.5, 0, -0.5),
      new Vector3(0.5, 0, -0.5),
      new Vector3(0.5, 0, 0.5),
      new Vector3(-0.5, 0, 0.5),
      new Vector3(-0.5, 0, -0.5)
    ];
    return MeshBuilder.CreateLines("grid-hover-overlay", { points, updatable: false }, this.scene);
  }

  /**
   * Строит контур клетки в мировых координатах.
   */
  private buildRectPoints(cell: GridCell, y: number, yOffset: number): Vector3[] {
    const bounds = this.grid.cellBounds(cell);
    const lineY = y + yOffset;
    return [
      new Vector3(bounds.minX, lineY, bounds.minZ),
      new Vector3(bounds.maxX, lineY, bounds.minZ),
      new Vector3(bounds.maxX, lineY, bounds.maxZ),
      new Vector3(bounds.minX, lineY, bounds.maxZ),
      new Vector3(bounds.minX, lineY, bounds.minZ)
    ];
  }

  /**
   * Создает pool для однотипных highlight meshes.
   */
  private createHighlightPool(name: string): GridHighlightPool {
    return {
      name,
      meshes: [],
    };
  }

  /**
   * Главная синхронизация всех highlight pools с текущим состоянием overlay.
   */
  private refreshHighlights(): void {
    if (!this.isDebugVisible) {
      this.setPoolVisibility(this.visionPool, 0);
      this.setPoolVisibility(this.patrolPool, 0);
      this.setPoolVisibility(this.detectedPool, 0);
      this.setPoolVisibility(this.blockedNavigationPool, 0);
      this.setEdgeMeshVisibility(this.blockedEdgeMeshes, false);
      this.setEdgeMeshVisibility(this.doorEdgeMeshes, false);
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
      this.updatePool(
        this.blockedNavigationPool,
        this.blockedNavigationCells
          .filter((entry) => entry.storyIndex === this.currentStoryIndex)
          .map((entry) => ({
            cell: entry.cell,
            storyIndex: entry.storyIndex,
            color: new Color4(1.0, 0.16, 0.12, 0.46),
          })),
        this.verticalOffset * 0.75,
        true
      );
      this.refreshEdgeMeshes();
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

  /**
   * Пересобирает визуализацию blocked/open door ребер текущего этажа.
   */
  private refreshEdgeMeshes(): void {
    const blockedEdges = this.blockedNavigationEdges.filter((entry) => entry.storyIndex === this.currentStoryIndex);
    const openDoorEdges = this.doorNavigationEdges.filter((entry) => entry.storyIndex === this.currentStoryIndex && entry.isOpen);

    this.ensureEdgeMeshCapacity(this.blockedEdgeMeshes, blockedEdges.length, "grid-blocked-edge", new Color3(1.0, 0.18, 0.14));
    this.ensureEdgeMeshCapacity(this.doorEdgeMeshes, openDoorEdges.length, "grid-door-edge", new Color3(0.96, 0.9, 0.24));

    for (let index = 0; index < blockedEdges.length; index += 1) {
      this.updateEdgeMesh(this.blockedEdgeMeshes[index], blockedEdges[index], this.verticalOffset * 1.35);
      this.blockedEdgeMeshes[index].isVisible = true;
    }
    for (let index = blockedEdges.length; index < this.blockedEdgeMeshes.length; index += 1) {
      this.blockedEdgeMeshes[index].isVisible = false;
    }

    for (let index = 0; index < openDoorEdges.length; index += 1) {
      this.updateEdgeMesh(this.doorEdgeMeshes[index], openDoorEdges[index], this.verticalOffset * 1.4);
      this.doorEdgeMeshes[index].isVisible = true;
    }
    for (let index = openDoorEdges.length; index < this.doorEdgeMeshes.length; index += 1) {
      this.doorEdgeMeshes[index].isVisible = false;
    }
  }

  /**
   * Доращивает pool edge meshes до нужного размера.
   */
  private ensureEdgeMeshCapacity(meshes: LinesMesh[], desiredSize: number, prefix: string, color: Color3): void {
    while (meshes.length < desiredSize) {
      const mesh = MeshBuilder.CreateLines(
        `${prefix}-${meshes.length}`,
        {
          points: [Vector3.Zero(), Vector3.Right()],
          updatable: true
        },
        this.scene
      );
      mesh.color = color;
      mesh.isPickable = false;
      mesh.isVisible = false;
      meshes.push(mesh);
    }
  }

  /**
   * Обновляет line mesh ребра так, чтобы линия лежала поперек границы клеток.
   */
  private updateEdgeMesh(mesh: LinesMesh, edge: StoryGridEdge, yOffset: number): void {
    const y = this.getStoryY(edge.storyIndex) + yOffset;
    const a = this.grid.cellToWorld(edge.a, y);
    const b = this.grid.cellToWorld(edge.b, y);
    const midpoint = Vector3.Center(a, b);
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const length = Math.sqrt(dx * dx + dz * dz);
    const nx = length > Number.EPSILON ? -dz / length : 0;
    const nz = length > Number.EPSILON ? dx / length : 0;
    const half = this.grid.getTileSize() * 0.5;
    const start = new Vector3(midpoint.x - nx * half, y, midpoint.z - nz * half);
    const end = new Vector3(midpoint.x + nx * half, y, midpoint.z + nz * half);
    MeshBuilder.CreateLines("", { points: [start, end], instance: mesh });
  }

  /**
   * Массово переключает видимость edge meshes.
   */
  private setEdgeMeshVisibility(meshes: readonly LinesMesh[], visible: boolean): void {
    for (const mesh of meshes) {
      mesh.isVisible = visible;
    }
  }

  /**
   * Освобождает edge meshes и очищает массив pool.
   */
  private disposeEdgeMeshes(meshes: LinesMesh[]): void {
    for (const mesh of meshes) {
      mesh.dispose();
    }
    meshes.length = 0;
  }

  /**
   * Обновляет pool плоских highlight meshes.
   */
  private updatePool(
    pool: GridHighlightPool,
    highlights: readonly GridCellHighlightSpec[],
    yOffset: number,
    allowOutsideWalkableCells = false
  ): void {
    const filteredHighlights = highlights.filter((highlight) =>
      allowOutsideWalkableCells || this.isCellOverlayAllowed(highlight.cell, highlight.storyIndex ?? this.currentStoryIndex)
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

  /**
   * Доращивает highlight pool без пересоздания уже существующих meshes.
   */
  private ensurePoolCapacity(pool: GridHighlightPool, desiredSize: number): void {
    while (pool.meshes.length < desiredSize) {
      const index = pool.meshes.length;
      const mesh = MeshBuilder.CreatePlane(
        `${pool.name}-${index}`,
        {
          size: this.grid.getTileSize() * 0.92,
          sideOrientation: Mesh.DOUBLESIDE
        },
        this.scene
      );
      mesh.rotation.x = Math.PI / 2;
      mesh.isPickable = false;
      mesh.isVisible = false;
      pool.meshes.push(mesh);
    }
  }

  /**
   * Создает или возвращает материал highlight mesh.
   */
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

  /**
   * Показывает первые visibleCount meshes pool и скрывает остальные.
   */
  private setPoolVisibility(pool: GridHighlightPool, visibleCount: number): void {
    for (let index = 0; index < pool.meshes.length; index += 1) {
      pool.meshes[index].isVisible = index < visibleCount;
    }
  }

  /**
   * Освобождает meshes/materials одного highlight pool.
   */
  private disposePool(pool: GridHighlightPool): void {
    for (const mesh of pool.meshes) {
      mesh.material?.dispose();
      mesh.dispose();
    }
    pool.meshes.length = 0;
  }

  /**
   * Возвращает Y этажа с fallback на origin сетки.
   */
  private getStoryY(storyIndex: number): number {
    return this.storyYByStory.get(storyIndex) ?? this.grid.getOrigin().y;
  }

  /**
   * Пересобирает line mesh только для walkable клеток текущего этажа.
   */
  private rebuildCurrentStoryGridMesh(): void {
    this.currentStoryGridMesh?.dispose();
    this.currentStoryGridMesh = null;

    if (this.walkableNavigationCells.length === 0) {
      this.refreshGridVisibility();
      return;
    }

    const lines = this.walkableNavigationCells
      .filter((entry) => entry.storyIndex === this.currentStoryIndex)
      .map((entry) => this.buildRectPoints(entry.cell, this.getStoryY(entry.storyIndex), this.verticalOffset));

    if (lines.length === 0) {
      this.refreshGridVisibility();
      return;
    }

    this.currentStoryGridMesh = MeshBuilder.CreateLineSystem(
      `grid-current-story-grid-overlay-${this.currentStoryIndex}`,
      { lines, updatable: false },
      this.scene
    );
    this.currentStoryGridMesh.color = new Color3(0.31, 0.73, 0.93);
    this.currentStoryGridMesh.isPickable = false;
    this.refreshGridVisibility();
  }

  /**
   * Синхронизирует видимость fallback/current-story сетки.
   */
  private refreshGridVisibility(): void {
    const hasWalkableCells = this.walkableNavigationCells.length > 0;
    this.gridMesh.isVisible = this.isDebugVisible && !hasWalkableCells;
    if (this.currentStoryGridMesh) {
      this.currentStoryGridMesh.isVisible = this.isDebugVisible;
    }
  }

  /**
   * Не дает overlay показывать клетки, которых нет в walkable navigation set.
   */
  private isCellOverlayAllowed(cell: GridCell, storyIndex: number): boolean {
    if (this.walkableNavigationCells.length === 0) {
      return true;
    }

    return this.walkableNavigationCells.some(
      (entry) => entry.storyIndex === storyIndex && entry.cell.equals(cell)
    );
  }
}
