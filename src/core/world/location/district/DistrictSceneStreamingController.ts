import type { Scene as BabylonScene } from "@babylonjs/core";
import type { Entity } from "../../../entity/Entity";
import type { EntityManager } from "../../../entity/EntityManager";
import { LocalPlayerComponent } from "../../../entity/components/LocalPlayerComponent";
import { TransformComponent } from "../../../entity/components/TransformComponent";
import type { LocationManager } from "../LocationManager";
import type { District } from "./District";
import type { DistrictSceneCoord } from "./DistrictDefinition";

/**
 * Streams neighbor district chunks based on local player position near chunk edges.
 */
export class DistrictSceneStreamingController {
  private readonly scene: BabylonScene;
  private readonly entityManager: EntityManager;
  private readonly locationManager: LocationManager;
  private readonly district: District;
  private readonly onChunksChanged: () => void | Promise<void>;
  private readonly loadingKeys: Set<string>;
  private readonly missingKeys: Set<string>;
  private isDisposed: boolean;

  public constructor(
    scene: BabylonScene,
    entityManager: EntityManager,
    locationManager: LocationManager,
    district: District,
    onChunksChanged: () => void | Promise<void>
  ) {
    this.scene = scene;
    this.entityManager = entityManager;
    this.locationManager = locationManager;
    this.district = district;
    this.onChunksChanged = onChunksChanged;
    this.loadingKeys = new Set();
    this.missingKeys = new Set();
    this.isDisposed = false;
  }

  public update(): void {
    if (this.isDisposed) {
      return;
    }

    if (this.locationManager.getActiveDistrict() !== this.district) {
      return;
    }

    const player = this.resolveLocalPlayerEntity();
    if (!player) {
      return;
    }

    const playerPosition = player.getComponent(TransformComponent).value;
    const modelData = this.district.getModelData();
    const { chunkSize, streaming } = modelData;
    const chunkX = Math.floor(playerPosition.x / chunkSize.x);
    const chunkZ = Math.floor(playerPosition.z / chunkSize.z);
    const playerChunk: DistrictSceneCoord = [chunkX, chunkZ];
    const loadedText = this.locationManager
      .getLoadedDistrictSceneCoords()
      .map((coord) => this.createCoordKey(coord))
      .sort()
      .join(",");

    void this.ensureChunkLoaded(playerChunk, chunkX, chunkZ, loadedText, "current");

    if (!streaming.enabled) {
      return;
    }

    const localX = playerPosition.x - chunkX * chunkSize.x;
    const localZ = playerPosition.z - chunkZ * chunkSize.z;
    const nearLeft = localX <= streaming.loadMargin;
    const nearRight = localX >= chunkSize.x - streaming.loadMargin;
    const nearBottom = localZ <= streaming.loadMargin;
    const nearTop = localZ >= chunkSize.z - streaming.loadMargin;

    if (nearRight) {
      void this.ensureChunkLoaded([chunkX + 1, chunkZ], chunkX, chunkZ, loadedText, "right");
    }
    if (nearLeft) {
      void this.ensureChunkLoaded([chunkX - 1, chunkZ], chunkX, chunkZ, loadedText, "left");
    }
    if (nearTop) {
      void this.ensureChunkLoaded([chunkX, chunkZ + 1], chunkX, chunkZ, loadedText, "top");
    }
    if (nearBottom) {
      void this.ensureChunkLoaded([chunkX, chunkZ - 1], chunkX, chunkZ, loadedText, "bottom");
    }
  }

  public dispose(): void {
    this.isDisposed = true;
    this.loadingKeys.clear();
    this.missingKeys.clear();
  }

  private async ensureChunkLoaded(
    coord: DistrictSceneCoord,
    playerChunkX: number,
    playerChunkZ: number,
    loadedText: string,
    nearLabel: string
  ): Promise<void> {
    const coordKey = this.createCoordKey(coord);
    if (this.loadingKeys.has(coordKey)) {
      return;
    }

    const alreadyLoaded = this.locationManager
      .getLoadedDistrictSceneCoords()
      .some((loadedCoord) => loadedCoord[0] === coord[0] && loadedCoord[1] === coord[1]);
    if (alreadyLoaded) {
      return;
    }

    const sceneData = this.district.getSceneByCoord(coord);
    if (!sceneData) {
      if (!this.missingKeys.has(coordKey)) {
        this.missingKeys.add(coordKey);
        console.debug(`[DistrictStreaming] chunk missing coord=${coordKey} district=${this.district.getId()}`);
      }
      return;
    }

    console.debug(
      `[DistrictStreaming] playerChunk=${playerChunkX}:${playerChunkZ} loaded=${loadedText} near=${nearLabel} request=${coordKey}`
    );
    this.loadingKeys.add(coordKey);

    try {
      const loaded = await this.locationManager.loadDistrictSceneChunk(this.scene, this.district, coord);
      if (loaded && !this.isDisposed) {
        console.info("[DistrictStreaming] chunks changed; rebuilding grid/triggers");
        await this.onChunksChanged();
      }
    } finally {
      this.loadingKeys.delete(coordKey);
    }
  }

  private createCoordKey(coord: DistrictSceneCoord): string {
    return `${coord[0]}:${coord[1]}`;
  }

  private resolveLocalPlayerEntity(): Entity | null {
    const candidates = this.entityManager.query(LocalPlayerComponent, TransformComponent);

    if (candidates.length === 0) {
      return null;
    }

    if (candidates.length > 1) {
      throw new Error(`DistrictSceneStreamingController requires exactly one local player, found ${candidates.length}.`);
    }

    return candidates[0];
  }
}
