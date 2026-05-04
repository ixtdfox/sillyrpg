import { Color3, MeshBuilder, type AbstractMesh, type LinesMesh, type Scene, Vector3 } from "@babylonjs/core";
import { HexGrid } from "../hex/HexGrid";
import {
  parseStairCheckpointMetadata,
  parseStairConnectorMetadata,
  type StairCheckpointMetadata,
  type StairConnectorMetadata
} from "./BuildingNavigationMetadata";
import type { StairNavigationConnector } from "./NavigationGraph";

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
  private showStairNavigationDebug: boolean;

  public constructor() {
    this.stairConnectors = [];
    this.storyYByStory = new Map();
    this.checkpointMeshes = new Set();
    this.debugLines = [];
    this.showStairNavigationDebug = false;
  }

  public rebuild(scene: Scene, grid: HexGrid): void {
    this.disposeDebugLines();
    this.stairConnectors.length = 0;
    this.storyYByStory.clear();
    this.checkpointMeshes.clear();

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
    }

    this.setDebugVisible(this.showStairNavigationDebug);
    this.logLoadedStairs();
  }

  public getStairConnectors(): StairNavigationConnector[] {
    return [...this.stairConnectors];
  }

  public getStoryYByStory(): ReadonlyMap<number, number> {
    return this.storyYByStory;
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
  }

  public dispose(): void {
    this.disposeDebugLines();
    this.checkpointMeshes.clear();
    this.stairConnectors.length = 0;
    this.storyYByStory.clear();
  }

  private tryBuildConnector(
    stairId: string,
    checkpoints: readonly StairCheckpointRecord[],
    rootMetadata: StairConnectorMetadata | undefined,
    grid: HexGrid
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
      console.warn(`[BuildingNavigationRegistry] stair '${stairId}' endpoint is outside hex grid bounds; pathfinding may not reach it.`);
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

  private disposeDebugLines(): void {
    for (const line of this.debugLines) {
      line.dispose();
    }

    this.debugLines.length = 0;
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
