import {
  Color3,
  MeshBuilder,
  StandardMaterial,
  type AbstractMesh,
  type LinesMesh,
  type Scene,
  Vector3
} from "@babylonjs/core";
import { RectGrid } from "../grid/RectGrid";
import {
  parseStairCheckpointMetadata,
  parseStairConnectorMetadata,
  type StairCheckpointMetadata,
  type StairConnectorMetadata
} from "./BuildingNavigationMetadata";
import type { StairNavigationConnector } from "./NavigationGraph";
import type { GridCell } from "../grid/GridCell";
import {
  mapGridNavigationContractsToRuntime,
  type GridNavigationContract,
  type GridNavigationStair
} from "./GridNavigationContract";

const DEFAULT_EXTERNAL_STAIR_COMBAT_COST = 2;
const DEFAULT_INTERNAL_STAIR_COMBAT_COST = 2;
const MAX_REASONABLE_ONE_STORY_STAIR_COMBAT_COST = 6;

interface StairCheckpointRecord {
  readonly mesh: AbstractMesh;
  readonly metadata: StairCheckpointMetadata;
  readonly worldPosition: Vector3;
}

export class BuildingNavigationRegistry {
  private readonly stairConnectors: StairNavigationConnector[];
  private readonly storyYByStory: Map<number, number>;
  private readonly checkpointMeshes: Set<AbstractMesh>;
  private readonly debugLines: LinesMesh[];
  private readonly pickProxyMeshes: AbstractMesh[];
  private pickProxyMaterial: StandardMaterial | null;
  private stairHoverLine: LinesMesh | null;
  private stairHoverMarker: AbstractMesh | null;
  private stairHoverMaterial: StandardMaterial | null;
  private activeScene: Scene | null;
  private hoveredStairId: string | null;
  private showStairNavigationDebug: boolean;

  public constructor() {
    this.stairConnectors = [];
    this.storyYByStory = new Map();
    this.checkpointMeshes = new Set();
    this.debugLines = [];
    this.pickProxyMeshes = [];
    this.pickProxyMaterial = null;
    this.stairHoverLine = null;
    this.stairHoverMarker = null;
    this.stairHoverMaterial = null;
    this.activeScene = null;
    this.hoveredStairId = null;
    this.showStairNavigationDebug = false;
  }

  public rebuild(scene: Scene, grid: RectGrid): void {
    this.disposeDebugLines();
    this.disposePickProxies();
    this.disposeHoverAffordance();
    this.activeScene = scene;
    this.hoveredStairId = null;
    this.stairConnectors.length = 0;
    this.storyYByStory.clear();
    this.checkpointMeshes.clear();

    const contractConnectors = this.buildContractStairConnectors(scene, grid);
    if (contractConnectors.length > 0) {
      for (const connector of contractConnectors) {
        this.stairConnectors.push(connector);
        this.recordStoryY(connector.fromStoryIndex, connector.traversalPathWorld[0]);
        this.recordStoryY(connector.toStoryIndex, connector.traversalPathWorld[connector.traversalPathWorld.length - 1]);
        this.createDebugLine(scene, connector);
        this.createPickProxies(scene, connector);
      }
      console.info(`[BuildingNavigationRegistry] using ${contractConnectors.length} v3 contract stair connectors.`);
    } else {
      const connectorMetadataByStairId = new Map<string, StairConnectorMetadata>();
      const checkpointsByStairId = new Map<string, StairCheckpointRecord[]>();

      for (const mesh of scene.meshes) {
        if (mesh.isDisposed()) {
          continue;
        }

        const checkpointMetadata = parseStairCheckpointMetadata(mesh);
        if (checkpointMetadata) {
          this.checkpointMeshes.add(mesh);
          const record: StairCheckpointRecord = {
            mesh,
            metadata: checkpointMetadata,
            worldPosition: mesh.getAbsolutePosition().clone()
          };
          mesh.setEnabled(this.showStairNavigationDebug);
          const checkpoints = checkpointsByStairId.get(checkpointMetadata.stair_id) ?? [];
          checkpoints.push(record);
          checkpointsByStairId.set(checkpointMetadata.stair_id, checkpoints);
          continue;
        }

        const connectorMetadata = parseStairConnectorMetadata(mesh);
        if (connectorMetadata) {
          connectorMetadataByStairId.set(connectorMetadata.stair_id, connectorMetadata);
        }
      }

      for (const [stairId, checkpoints] of checkpointsByStairId) {
        const connector = this.tryBuildConnector(stairId, checkpoints, connectorMetadataByStairId.get(stairId), grid);
        if (!connector) {
          continue;
        }

        this.stairConnectors.push(connector);
        this.recordStoryY(connector.fromStoryIndex, connector.traversalPathWorld[0]);
        this.recordStoryY(connector.toStoryIndex, connector.traversalPathWorld[connector.traversalPathWorld.length - 1]);
        this.createDebugLine(scene, connector);
        this.createPickProxies(scene, connector);
      }
    }

    this.setDebugVisible(this.showStairNavigationDebug);
    this.logLoadedStairs();
    console.info(`BuildingNavigationRegistry: created stair pick proxies count=${this.pickProxyMeshes.length}`);
  }

  private buildContractStairConnectors(scene: Scene, grid: RectGrid): StairNavigationConnector[] {
    const contracts = mapGridNavigationContractsToRuntime(scene, grid);
    if (contracts.length === 0) {
      return [];
    }

    const connectors: StairNavigationConnector[] = [];
    const seenConnectorIds = new Set<string>();
    let totalContractStairs = 0;
    const storyYByStory = this.collectStoryYByStory(contracts);

    for (const contract of contracts) {
      for (const story of contract.stories) {
        for (const stair of story.stairs) {
          totalContractStairs += 1;
          const connector = this.createContractStairConnector(stair, grid, storyYByStory);
          if (!connector) {
            continue;
          }
          const connectorKey = `${connector.stairId}:${connector.fromStoryIndex}:${connector.fromCell.x}:${connector.fromCell.z}->${connector.toStoryIndex}:${connector.toCell.x}:${connector.toCell.z}`;
          if (seenConnectorIds.has(connectorKey)) {
            continue;
          }
          seenConnectorIds.add(connectorKey);
          connectors.push(connector);
        }
      }
    }

    if (totalContractStairs === 0) {
      console.warn("[BuildingNavigationRegistry] v3 contracts found but stairs=0. Falling back to stair checkpoint metadata.");
      return [];
    }

    if (connectors.length !== totalContractStairs) {
      console.warn(
        `[BuildingNavigationRegistry] contract stairs deduplicated: declared=${totalContractStairs} unique=${connectors.length}`
      );
    }

    return connectors;
  }

  private collectStoryYByStory(contracts: readonly GridNavigationContract[]): ReadonlyMap<number, number> {
    const storyYByStory = new Map<number, number>();
    for (const contract of contracts) {
      for (const story of contract.stories) {
        if (!storyYByStory.has(story.storyIndex)) {
          storyYByStory.set(story.storyIndex, story.storyY);
        }
      }
    }
    return storyYByStory;
  }

  private createContractStairConnector(
    stair: GridNavigationStair,
    grid: RectGrid,
    storyYByStory: ReadonlyMap<number, number>
  ): StairNavigationConnector | null {
    const fromStoryY = storyYByStory.get(stair.from.storyIndex) ?? this.storyYByStory.get(stair.from.storyIndex) ?? grid.getOrigin().y;
    const toStoryY = storyYByStory.get(stair.to.storyIndex) ?? this.storyYByStory.get(stair.to.storyIndex) ?? grid.getOrigin().y;
    const fromCell = stair.from.cell;
    const toCell = stair.to.cell;
    const traversalPathWorld = this.resolveContractStairPath(stair, grid, fromStoryY, toStoryY);
    const kind = stair.kind ?? "internal";
    const defaultCost = resolveDefaultStairCombatCost(kind, stair.from.storyIndex, stair.to.storyIndex);
    const cost = normalizeStairTacticalCost(stair.cost, defaultCost, stair);
    const bidirectional = stair.bidirectional ?? true;

    if (!grid.contains(fromCell) || !grid.contains(toCell)) {
      console.warn(
        `[BuildingNavigationRegistry] contract stair '${stair.id}' endpoint outside grid bounds: from=${fromCell.x}:${fromCell.z}@${stair.from.storyIndex} to=${toCell.x}:${toCell.z}@${stair.to.storyIndex}`
      );
    }

    if (isStairNavigationDebugEnabled(this.showStairNavigationDebug)) {
      console.debug(
        `[StairNav] connector stair=${stair.id} kind=${kind} ` +
        `from=${stair.from.storyIndex}:${fromCell.x}:${fromCell.z} to=${stair.to.storyIndex}:${toCell.x}:${toCell.z} ` +
        `cost=${cost} rawCost=${stair.cost ?? "n/a"} pathPoints=${traversalPathWorld.path.length} ` +
        `synthetic=${traversalPathWorld.synthetic}`
      );
    }

    return {
      stairId: stair.id,
      fromStoryIndex: stair.from.storyIndex,
      toStoryIndex: stair.to.storyIndex,
      fromCell,
      toCell,
      kind,
      cost,
      bidirectional,
      traversalPathWorld: traversalPathWorld.path,
      isSynthetic: traversalPathWorld.synthetic
    };
  }

  private resolveContractStairPath(
    stair: GridNavigationStair,
    grid: RectGrid,
    fromStoryY: number,
    toStoryY: number
  ): { readonly path: Vector3[]; readonly synthetic: boolean } {
    const contractPath = stair.traversalPathWorld?.filter((point) => isValidVector3(point)).map((point) => point.clone()) ?? [];
    if (contractPath.length >= 2) {
      if ((stair.kind ?? "internal") === "external" && contractPath.length <= 3) {
        console.warn(
          `[BuildingNavigationRegistry] External stair '${stair.id}' traversal_path_world has only ${contractPath.length} points; switchback stairs should provide a detailed polyline.`
        );
      }
      return { path: contractPath, synthetic: false };
    }

    console.warn(
      `[BuildingNavigationRegistry] Stair '${stair.id}' has no traversal_path_world; using synthetic direct path. This is invalid for external switchback stairs.`
    );
    const fromPoint = grid.cellToWorld(stair.from.cell, fromStoryY);
    const toPoint = grid.cellToWorld(stair.to.cell, toStoryY);
    const midpoint = Vector3.Center(fromPoint, toPoint);
    midpoint.y = (fromStoryY + toStoryY) * 0.5;
    return { path: [fromPoint, midpoint, toPoint], synthetic: true };
  }

  public getStairConnectors(): StairNavigationConnector[] {
    return [...this.stairConnectors];
  }

  public getStairConnectorById(stairId: string): StairNavigationConnector | null {
    return this.stairConnectors.find((connector) => connector.stairId === stairId) ?? null;
  }

  public findNearestStairConnectorToPoint(input: {
    readonly point: Vector3;
    readonly currentStoryIndex?: number;
    readonly maxDistance?: number;
  }): {
    readonly connector: StairNavigationConnector;
    readonly distance: number;
    readonly direction: "forward" | "reverse";
  } | null {
    const maxDistance = input.maxDistance ?? 2.5;
    let best:
      | {
          connector: StairNavigationConnector;
          distance: number;
          rank: number;
          direction: "forward" | "reverse";
        }
      | null = null;

    for (const connector of this.stairConnectors) {
      const direction = this.resolveDirectionForStory(connector, input.currentStoryIndex);
      if (!direction) {
        continue;
      }

      const distance = distanceToPolyline(input.point, connector.traversalPathWorld);
      if (distance > maxDistance) {
        continue;
      }

      const storyPenalty = input.currentStoryIndex === undefined || isStoryConnectedToConnector(connector, input.currentStoryIndex)
        ? 0
        : 2.5;
      const rank = distance + storyPenalty;
      if (!best || rank < best.rank) {
        best = { connector, distance, rank, direction };
      }
    }

    return best ? { connector: best.connector, distance: best.distance, direction: best.direction } : null;
  }

  public resolveStairInteractionTarget(input: {
    readonly stairId?: string;
    readonly pickedPoint?: Vector3;
    readonly currentStoryIndex: number;
  }): {
    readonly targetCell: GridCell;
    readonly targetStoryIndex: number;
    readonly connector: StairNavigationConnector;
    readonly direction: "forward" | "reverse";
    readonly resolvedByNearest: boolean;
    readonly distance?: number;
  } | null {
    const connectorById = input.stairId
      ? this.resolveStairConnectorForInteraction(input.stairId, input.currentStoryIndex, input.pickedPoint)
      : null;
    const nearest = input.pickedPoint
      ? this.findNearestStairConnectorToPoint({
          point: input.pickedPoint,
          currentStoryIndex: input.currentStoryIndex
        })
      : null;
    const connector = connectorById ?? nearest?.connector ?? null;
    if (!connector) {
      return null;
    }

    if (input.currentStoryIndex === connector.fromStoryIndex) {
      return {
        targetCell: connector.toCell,
        targetStoryIndex: connector.toStoryIndex,
        connector,
        direction: "forward",
        resolvedByNearest: !connectorById,
        distance: nearest?.distance
      };
    }

    if (input.currentStoryIndex === connector.toStoryIndex && connector.bidirectional) {
      return {
        targetCell: connector.fromCell,
        targetStoryIndex: connector.fromStoryIndex,
        connector,
        direction: "reverse",
        resolvedByNearest: !connectorById,
        distance: nearest?.distance
      };
    }

    const fallbackTarget = this.resolveNearestEndpointFallback(connector, input.pickedPoint);
    console.warn(
      `[BuildingNavigationRegistry] Stair '${connector.stairId}' does not directly connect current story ${input.currentStoryIndex}; using nearest endpoint fallback.`
    );
    return {
      ...fallbackTarget,
      connector,
      resolvedByNearest: !connectorById,
      distance: nearest?.distance
    };
  }

  public getStoryYByStory(): ReadonlyMap<number, number> {
    return this.storyYByStory;
  }

  private resolveStairConnectorForInteraction(
    stairId: string,
    currentStoryIndex: number,
    pickedPoint: Vector3 | undefined
  ): StairNavigationConnector | null {
    const matchingConnectors = this.stairConnectors.filter((connector) => connector.stairId === stairId);
    if (matchingConnectors.length === 0) {
      return null;
    }

    const storyConnectors = matchingConnectors.filter((connector) => isStoryConnectedToConnector(connector, currentStoryIndex));
    const candidates = storyConnectors.length > 0 ? storyConnectors : matchingConnectors;
    if (!pickedPoint) {
      return candidates[0] ?? null;
    }

    return [...candidates].sort((first, second) => {
      return distanceToPolyline(pickedPoint, first.traversalPathWorld) - distanceToPolyline(pickedPoint, second.traversalPathWorld);
    })[0] ?? null;
  }

  public getShowStairNavigationDebug(): boolean {
    return this.showStairNavigationDebug;
  }

  public setDebugVisible(isVisible: boolean): void {
    this.showStairNavigationDebug = isVisible;

    for (const mesh of this.checkpointMeshes) {
      if (!mesh.isDisposed()) {
        mesh.setEnabled(isVisible);
      }
    }

    for (const line of this.debugLines) {
      if (!line.isDisposed()) {
        line.setEnabled(isVisible);
      }
    }

    this.refreshPickProxyVisibility();
  }

  public setHoveredStairConnector(stairId: string | null, currentStoryIndex: number): void {
    if (!stairId) {
      this.hoveredStairId = null;
      this.hideHoverAffordance();
      this.refreshPickProxyVisibility();
      return;
    }

    const connector = this.resolveStairConnectorForInteraction(stairId, currentStoryIndex, undefined);
    if (!connector || !this.activeScene) {
      this.hoveredStairId = null;
      this.hideHoverAffordance();
      this.refreshPickProxyVisibility();
      return;
    }

    this.hoveredStairId = connector.stairId;
    this.showHoverAffordance(connector, currentStoryIndex);
    this.refreshPickProxyVisibility();
  }

  public dispose(): void {
    this.disposeDebugLines();
    this.disposePickProxies();
    this.disposeHoverAffordance();
    this.checkpointMeshes.clear();
    this.stairConnectors.length = 0;
    this.storyYByStory.clear();
  }

  private tryBuildConnector(
    stairId: string,
    checkpoints: readonly StairCheckpointRecord[],
    rootMetadata: StairConnectorMetadata | undefined,
    grid: RectGrid
  ): StairNavigationConnector | null {
    if (!stairId) {
      console.warn("[BuildingNavigationRegistry] skipped stair checkpoint group with missing stair_id.");
      return null;
    }

    if (checkpoints.length < 2) {
      console.warn(`[BuildingNavigationRegistry] skipped stair '${stairId}': expected at least 2 checkpoints.`);
      return null;
    }

    const sorted = [...checkpoints].sort((first, second) => first.metadata.checkpoint_index - second.metadata.checkpoint_index);
    const indices = new Set<number>();
    for (const checkpoint of sorted) {
      if (indices.has(checkpoint.metadata.checkpoint_index)) {
        console.warn(`[BuildingNavigationRegistry] skipped stair '${stairId}': duplicate checkpoint_index ${checkpoint.metadata.checkpoint_index}.`);
        return null;
      }

      indices.add(checkpoint.metadata.checkpoint_index);
    }

    const first = sorted[0];
    const last = sorted[sorted.length - 1];
    const fromStoryIndex = rootMetadata?.from_story ?? first.metadata.from_story;
    const toStoryIndex = rootMetadata?.to_story ?? first.metadata.to_story;
    const traversalPathWorld = sorted.map((checkpoint) => checkpoint.worldPosition.clone());

    if (!traversalPathWorld.every((point) => isValidVector3(point))) {
      console.warn(`[BuildingNavigationRegistry] skipped stair '${stairId}': traversal path contains invalid world positions.`);
      return null;
    }

    const fromCell = grid.worldToCell(first.worldPosition);
    const toCell = grid.worldToCell(last.worldPosition);
    if (!grid.contains(fromCell) || !grid.contains(toCell)) {
      console.warn(`[BuildingNavigationRegistry] stair '${stairId}' endpoint is outside grid grid bounds; pathfinding may not reach it.`);
    }

    const kind = rootMetadata?.stair_kind ?? first.metadata.stair_kind ?? "internal";
    const defaultCost = kind === "external" ? 4 : 2;

    return {
      stairId,
      fromStoryIndex,
      toStoryIndex,
      fromCell,
      toCell,
      kind,
      cost: rootMetadata?.cost ?? first.metadata.cost ?? defaultCost,
      bidirectional: rootMetadata?.bidirectional ?? first.metadata.bidirectional ?? true,
      traversalPathWorld
    };
  }

  private recordStoryY(storyIndex: number, point: Vector3 | undefined): void {
    if (!point || !Number.isFinite(point.y)) {
      return;
    }

    if (!this.storyYByStory.has(storyIndex)) {
      this.storyYByStory.set(storyIndex, point.y);
    }
  }

  private createDebugLine(scene: Scene, connector: StairNavigationConnector): void {
    if (connector.traversalPathWorld.length < 2) {
      return;
    }

    const line = MeshBuilder.CreateLines(
      `stair-navigation-debug-${connector.stairId}`,
      { points: connector.traversalPathWorld.map((point) => point.clone()) },
      scene
    );
    line.color = connector.kind === "external" ? Color3.FromHexString("#f97316") : Color3.FromHexString("#38bdf8");
    line.isPickable = false;
    line.setEnabled(this.showStairNavigationDebug);
    this.debugLines.push(line);
  }

  private createPickProxies(scene: Scene, connector: StairNavigationConnector): void {
    const material = this.getOrCreatePickProxyMaterial(scene);
    const proxyPoints = collectProxyPoints(connector.traversalPathWorld);

    for (let index = 0; index < proxyPoints.length; index += 1) {
      const proxy = MeshBuilder.CreateSphere(
        `stair-pick-proxy-${connector.stairId}-${index}`,
        { diameter: 1.2, segments: 8 },
        scene
      );
      proxy.position.copyFrom(proxyPoints[index]);
      proxy.metadata = {
        nav_kind: "stair_pick_proxy",
        stair_id: connector.stairId
      };
      proxy.material = material;
      proxy.isPickable = true;
      proxy.visibility = this.showStairNavigationDebug ? 0.35 : 0.01;
      this.pickProxyMeshes.push(proxy);
    }
  }

  private getOrCreatePickProxyMaterial(scene: Scene): StandardMaterial {
    if (this.pickProxyMaterial) {
      return this.pickProxyMaterial;
    }

    const material = new StandardMaterial("stair-pick-proxy-material", scene);
    material.diffuseColor = Color3.FromHexString("#22d3ee");
    material.emissiveColor = Color3.FromHexString("#22d3ee");
    material.alpha = 0.35;
    this.pickProxyMaterial = material;
    return material;
  }

  private disposeDebugLines(): void {
    for (const line of this.debugLines) {
      line.dispose();
    }

    this.debugLines.length = 0;
  }

  private disposePickProxies(): void {
    for (const proxy of this.pickProxyMeshes) {
      proxy.dispose();
    }

    this.pickProxyMeshes.length = 0;
    this.pickProxyMaterial?.dispose();
    this.pickProxyMaterial = null;
  }

  private showHoverAffordance(connector: StairNavigationConnector, currentStoryIndex: number): void {
    if (!this.activeScene) {
      return;
    }

    this.rebuildHoverLine(connector);
    const marker = this.getOrCreateHoverMarker(this.activeScene);
    const midpoint = computePathMidpoint(connector.traversalPathWorld);
    marker.position.copyFrom(midpoint);
    marker.position.y += 1.1;
    marker.rotation.set(0, 0, 0);

    if (currentStoryIndex === connector.toStoryIndex) {
      marker.rotation.x = Math.PI;
    }

    marker.isVisible = true;
    console.debug(
      `[BuildingNavigationRegistry] Stair affordance ${this.describeStairAction(connector, currentStoryIndex)} stairId='${connector.stairId}'`
    );
  }

  private rebuildHoverLine(connector: StairNavigationConnector): void {
    if (!this.activeScene || connector.traversalPathWorld.length < 2) {
      return;
    }

    this.stairHoverLine?.dispose();
    this.stairHoverLine = MeshBuilder.CreateLines(
      `stair-hover-affordance-${connector.stairId}`,
      { points: connector.traversalPathWorld.map((point) => point.clone()) },
      this.activeScene
    );
    this.stairHoverLine.color = Color3.FromHexString("#facc15");
    this.stairHoverLine.isPickable = false;
    this.stairHoverLine.isVisible = true;
  }

  private getOrCreateHoverMarker(scene: Scene): AbstractMesh {
    if (this.stairHoverMarker && !this.stairHoverMarker.isDisposed()) {
      return this.stairHoverMarker;
    }

    const marker = MeshBuilder.CreateCylinder(
      "stair-hover-arrow-marker",
      {
        diameterTop: 0,
        diameterBottom: 0.7,
        height: 1,
        tessellation: 3
      },
      scene
    );
    marker.material = this.getOrCreateHoverMaterial(scene);
    marker.isPickable = false;
    marker.isVisible = false;
    this.stairHoverMarker = marker;
    return marker;
  }

  private getOrCreateHoverMaterial(scene: Scene): StandardMaterial {
    if (this.stairHoverMaterial) {
      return this.stairHoverMaterial;
    }

    const material = new StandardMaterial("stair-hover-affordance-material", scene);
    material.diffuseColor = Color3.FromHexString("#facc15");
    material.emissiveColor = Color3.FromHexString("#facc15");
    material.alpha = 0.92;
    this.stairHoverMaterial = material;
    return material;
  }

  private hideHoverAffordance(): void {
    if (this.stairHoverLine) {
      this.stairHoverLine.isVisible = false;
    }

    if (this.stairHoverMarker) {
      this.stairHoverMarker.isVisible = false;
    }
  }

  private disposeHoverAffordance(): void {
    this.stairHoverLine?.dispose();
    this.stairHoverLine = null;
    this.stairHoverMarker?.dispose();
    this.stairHoverMarker = null;
    this.stairHoverMaterial?.dispose();
    this.stairHoverMaterial = null;
  }

  private refreshPickProxyVisibility(): void {
    for (const proxy of this.pickProxyMeshes) {
      if (proxy.isDisposed()) {
        continue;
      }

      const metadata = proxy.metadata as { stair_id?: unknown } | null | undefined;
      const stairId = typeof metadata?.stair_id === "string" ? metadata.stair_id : null;
      if (stairId && stairId === this.hoveredStairId) {
        proxy.visibility = 0.32;
        continue;
      }

      proxy.visibility = this.showStairNavigationDebug ? 0.35 : 0.01;
    }
  }

  private describeStairAction(connector: StairNavigationConnector, currentStoryIndex: number): string {
    if (currentStoryIndex === connector.fromStoryIndex) {
      return "Подняться";
    }

    if (currentStoryIndex === connector.toStoryIndex) {
      return "Спуститься";
    }

    return "Лестница";
  }

  private resolveDirectionForStory(
    connector: StairNavigationConnector,
    currentStoryIndex: number | undefined
  ): "forward" | "reverse" | null {
    if (currentStoryIndex === undefined || currentStoryIndex === connector.fromStoryIndex) {
      return "forward";
    }

    if (currentStoryIndex === connector.toStoryIndex) {
      return connector.bidirectional ? "reverse" : null;
    }

    return connector.bidirectional ? "forward" : null;
  }

  private resolveNearestEndpointFallback(
    connector: StairNavigationConnector,
    pickedPoint: Vector3 | undefined
  ): {
    readonly targetCell: GridCell;
    readonly targetStoryIndex: number;
    readonly direction: "forward" | "reverse";
  } {
    if (!pickedPoint) {
      return {
        targetCell: connector.fromCell,
        targetStoryIndex: connector.fromStoryIndex,
        direction: "forward"
      };
    }

    const firstPoint = connector.traversalPathWorld[0];
    const lastPoint = connector.traversalPathWorld[connector.traversalPathWorld.length - 1];
    const fromDistance = firstPoint ? Vector3.DistanceSquared(pickedPoint, firstPoint) : Number.POSITIVE_INFINITY;
    const toDistance = lastPoint ? Vector3.DistanceSquared(pickedPoint, lastPoint) : Number.POSITIVE_INFINITY;

    if (fromDistance <= toDistance || !connector.bidirectional) {
      return {
        targetCell: connector.fromCell,
        targetStoryIndex: connector.fromStoryIndex,
        direction: "forward"
      };
    }

    return {
      targetCell: connector.toCell,
      targetStoryIndex: connector.toStoryIndex,
      direction: "reverse"
    };
  }

  private logLoadedStairs(): void {
    console.info(`BuildingNavigationRegistry: loaded ${this.stairConnectors.length} stair connectors`);
    for (const connector of this.stairConnectors) {
      console.info(
        `- ${connector.stairId} ${connector.kind} ${connector.fromStoryIndex} -> ${connector.toStoryIndex} checkpoints=${connector.traversalPathWorld.length} cost=${connector.cost}`
      );
    }
  }
}

function isValidVector3(point: Vector3): boolean {
  return Number.isFinite(point.x) && Number.isFinite(point.y) && Number.isFinite(point.z);
}

function resolveDefaultStairCombatCost(kind: "internal" | "external", fromStoryIndex: number, toStoryIndex: number): number {
  const storyDelta = Math.max(1, Math.abs(toStoryIndex - fromStoryIndex));
  const adjacentStoryCost = kind === "external" ? DEFAULT_EXTERNAL_STAIR_COMBAT_COST : DEFAULT_INTERNAL_STAIR_COMBAT_COST;
  return adjacentStoryCost * storyDelta;
}

export function normalizeStairTacticalCost(
  rawCost: number | undefined,
  defaultCost: number,
  stair: Pick<GridNavigationStair, "id" | "kind" | "from" | "to">
): number {
  if (rawCost === undefined || !Number.isFinite(rawCost) || rawCost <= 0) {
    return defaultCost;
  }

  const storyDelta = Math.max(1, Math.abs(stair.to.storyIndex - stair.from.storyIndex));
  const maxReasonableCost = MAX_REASONABLE_ONE_STORY_STAIR_COMBAT_COST * storyDelta;
  if (rawCost > maxReasonableCost) {
    console.warn(
      `[StairNav] stair=${stair.id} kind=${stair.kind ?? "internal"} rawCost=${rawCost} exceeds tactical limit ${maxReasonableCost}; ` +
      `using default combat cost ${defaultCost}. Exporter may have used traversal path length as movement cost.`
    );
    return defaultCost;
  }

  return rawCost;
}

function isStairNavigationDebugEnabled(showStairNavigationDebug: boolean): boolean {
  if (showStairNavigationDebug) {
    return true;
  }
  const g = globalThis as { readonly __RECT_NAV_DEBUG__?: unknown; readonly location?: { readonly search?: string } };
  const raw = typeof g.__RECT_NAV_DEBUG__ === "string" ? g.__RECT_NAV_DEBUG__.toLowerCase() : "";
  if (raw === "1" || raw === "true") {
    return true;
  }
  const query = g.location?.search ?? "";
  return query.includes("rectNavDebug=1") || query.includes("rectNavDebug=true");
}

function isStoryConnectedToConnector(connector: StairNavigationConnector, storyIndex: number): boolean {
  return storyIndex === connector.fromStoryIndex || storyIndex === connector.toStoryIndex;
}

function collectProxyPoints(path: readonly Vector3[]): Vector3[] {
  const points: Vector3[] = [];

  for (let index = 0; index < path.length; index += 1) {
    points.push(path[index].clone());

    const nextPoint = path[index + 1];
    if (nextPoint) {
      points.push(Vector3.Center(path[index], nextPoint));
    }
  }

  return points;
}

function computePathMidpoint(path: readonly Vector3[]): Vector3 {
  if (path.length === 0) {
    return Vector3.Zero();
  }

  if (path.length === 1) {
    return path[0].clone();
  }

  const midIndex = Math.floor((path.length - 1) / 2);
  return Vector3.Center(path[midIndex], path[midIndex + 1] ?? path[midIndex]);
}

function distanceToPolyline(point: Vector3, path: readonly Vector3[]): number {
  if (path.length === 0) {
    return Number.POSITIVE_INFINITY;
  }

  if (path.length === 1) {
    return Vector3.Distance(point, path[0]);
  }

  let bestDistanceSquared = Number.POSITIVE_INFINITY;

  for (let index = 0; index < path.length - 1; index += 1) {
    bestDistanceSquared = Math.min(bestDistanceSquared, distanceSquaredToSegment(point, path[index], path[index + 1]));
  }

  return Math.sqrt(bestDistanceSquared);
}

function distanceSquaredToSegment(point: Vector3, segmentStart: Vector3, segmentEnd: Vector3): number {
  const segment = segmentEnd.subtract(segmentStart);
  const segmentLengthSquared = segment.lengthSquared();
  if (segmentLengthSquared <= Number.EPSILON) {
    return Vector3.DistanceSquared(point, segmentStart);
  }

  const t = Math.max(0, Math.min(1, Vector3.Dot(point.subtract(segmentStart), segment) / segmentLengthSquared));
  const closestPoint = segmentStart.add(segment.scale(t));
  return Vector3.DistanceSquared(point, closestPoint);
}
