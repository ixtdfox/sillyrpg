import {
  AbstractMesh,
  Vector3,
  type Scene as BabylonScene,
} from "@babylonjs/core";
import type { Entity } from "../Entity";
import type { EntityManager } from "../EntityManager";
import type { System } from "../System";
import { LocalPlayerComponent } from "../components/LocalPlayerComponent";
import { TransformComponent } from "../components/TransformComponent";
import { getInGameSceneRuntimeContext } from "../../scene/in-game/InGameSceneRuntimeContext";
import {
  BuildingVisibilityRegistry,
  type BuildingVisibilityBounds,
  type BuildingVisibilityBuildingRecord,
} from "../../scene/visibility/BuildingVisibilityRegistry";
import type { BuildingVisibilityMeshRecord } from "../../scene/visibility/BuildingVisibilityMetadata";
import {
  installWallHaloMaterial,
  updateWallHaloPlugins,
  type WallHaloMaterialBinding,
  type WallHaloSettings,
} from "../../scene/visibility/WallHaloMaterialPlugin";

interface HiddenMeshState {
  readonly isEnabled: boolean;
  readonly isVisible: boolean;
  readonly visibility: number;
}

interface PlayerBuildingState {
  readonly building: BuildingVisibilityBuildingRecord;
  readonly storyIndex: number;
}

const DEBUG_BUILDING_VISIBILITY = false;
const STORY_EPSILON = 0.25;
const ABOVE_PLAYER_EPSILON = 0.5;
const OVERHEAD_PART_PATTERN =
  /(roof|ceiling|slab|terrace|floor|border|band|railing|stair)/i;

/**
 * Applies building-specific wall halo materials and hides upper-story meshes while the local player is inside.
 */
export class BuildingVisibilitySystem implements System {
  private readonly entityManager: EntityManager;
  private readonly registry: BuildingVisibilityRegistry;
  private readonly hiddenMeshStates: Map<number, HiddenMeshState>;
  private readonly haloMaterialBindings: Map<number, WallHaloMaterialBinding>;
  private readonly haloSettings: WallHaloSettings;
  private scene: BabylonScene | null;
  private localPlayerEntity: Entity | null;
  private activeMeshSignature: string;
  private lastStateKey: string;

  public constructor(entityManager: EntityManager) {
    this.entityManager = entityManager;
    this.registry = new BuildingVisibilityRegistry();
    this.hiddenMeshStates = new Map();
    this.haloMaterialBindings = new Map();
    this.haloSettings = {
      innerRadius: 1.15,
      outerRadius: 2.85,
      minAlpha: 0.16,
      shape: "sphere",
      insideBuilding: false,
    };
    this.scene = null;
    this.localPlayerEntity = null;
    this.activeMeshSignature = "";
    this.lastStateKey = "";
  }

  public setScene(scene: BabylonScene | null): void {
    this.restoreHiddenMeshes();
    this.restoreHaloMaterials();
    this.registry.rebuild([]);
    this.activeMeshSignature = "";
    this.lastStateKey = "";
    this.scene = scene;
    this.localPlayerEntity = scene ? this.resolveLocalPlayerEntity() : null;
  }

  public update(_deltaSeconds: number): void {
    if (!this.scene) {
      return;
    }

    const context = getInGameSceneRuntimeContext(this.scene);
    if (!context) {
      return;
    }

    this.rebuildIfDistrictMeshesChanged(
      context.locationManager.getActiveDistrictMeshes(),
    );

    const localPlayer =
      this.localPlayerEntity ?? this.resolveLocalPlayerEntity();
    if (!localPlayer) {
      return;
    }

    this.localPlayerEntity = localPlayer;
    const playerPosition = localPlayer.getComponent(TransformComponent).value;
    const cameraPosition =
      this.scene.activeCamera?.globalPosition ?? playerPosition;
    const playerBuildingState = this.findPlayerBuildingState(playerPosition);

    this.updateHaloMaterials(
      playerPosition,
      cameraPosition,
      playerBuildingState !== null,
    );
    this.updateUpperMeshVisibility(playerPosition, playerBuildingState);
  }

  private rebuildIfDistrictMeshesChanged(
    activeDistrictMeshes: readonly AbstractMesh[],
  ): void {
    const meshSignature =
      BuildingVisibilityRegistry.createMeshSignature(activeDistrictMeshes);
    if (meshSignature === this.activeMeshSignature) {
      return;
    }

    this.restoreHiddenMeshes();
    this.restoreHaloMaterials();
    this.registry.rebuild(activeDistrictMeshes);
    this.activeMeshSignature = this.registry.getMeshSignature();
    this.installHaloMaterials();

    if (DEBUG_BUILDING_VISIBILITY) {
      const stats = this.registry.getStats();
      console.debug(
        `[BuildingVisibility] registered buildings=${stats.buildingCount} haloMeshes=${stats.haloMeshCount} hideAboveMeshes=${stats.hideAboveMeshCount} insideVolumes=${stats.insideVolumeCount}`,
      );
      this.logHaloMaterialTargets();
      this.logRoofMetadata();
    }
  }

  private installHaloMaterials(): void {
    for (const building of this.registry.getBuildings()) {
      for (const record of building.haloMeshes) {
        if (record.role !== "wall_halo") {
          console.warn(
            "[BuildingVisibility] skipped non-wall halo candidate",
            this.describeRecord(record),
          );
          continue;
        }

        if (
          record.mesh.isDisposed() ||
          this.haloMaterialBindings.has(record.mesh.uniqueId)
        ) {
          continue;
        }

        const binding = installWallHaloMaterial(record.mesh.material);
        if (!binding) {
          continue;
        }

        record.mesh.material = binding.haloMaterial;
        this.haloMaterialBindings.set(record.mesh.uniqueId, binding);
      }
    }
  }

  private updateHaloMaterials(
    playerPosition: Vector3,
    cameraPosition: Vector3,
    insideBuilding: boolean,
  ): void {
    for (const binding of this.haloMaterialBindings.values()) {
      updateWallHaloPlugins(
        binding.haloPlugins,
        playerPosition,
        cameraPosition,
        {
          ...this.haloSettings,
          insideBuilding,
        },
      );
    }
  }

  private updateUpperMeshVisibility(
    playerPosition: Vector3,
    playerBuildingState: PlayerBuildingState | null,
  ): void {
    if (!playerBuildingState) {
      this.restoreHiddenMeshes();
      return;
    }

    const { building, storyIndex } = playerBuildingState;
    const recordsToHide: BuildingVisibilityMeshRecord[] = [];
    const renderableMeshesToHide = new Set<AbstractMesh>();

    for (const record of building.hideAboveMeshes) {
      if (record.mesh.isDisposed() || record.isInsideVolume) {
        continue;
      }

      if (this.shouldHideRecord(record, storyIndex, playerPosition)) {
        recordsToHide.push(record);
        for (const mesh of this.collectRenderableMeshes(record.mesh)) {
          renderableMeshesToHide.add(mesh);
        }
      }
    }

    for (const record of building.haloMeshes) {
      if (record.mesh.isDisposed() || record.storyIndex <= storyIndex) {
        continue;
      }

      recordsToHide.push(record);
      for (const mesh of this.collectRenderableMeshes(record.mesh)) {
        renderableMeshesToHide.add(mesh);
      }
    }

    this.applyHiddenMeshSet(renderableMeshesToHide);
  }

  private shouldHideRecord(
    record: BuildingVisibilityMeshRecord,
    currentStory: number,
    playerPosition: Vector3,
  ): boolean {
    if (!record.hideWhenAbovePlayer) {
      return false;
    }

    if (record.storyIndex > currentStory) {
      return true;
    }

    record.mesh.computeWorldMatrix(true);
    const boundingBox = record.mesh.getBoundingInfo().boundingBox;
    const minY = boundingBox.minimumWorld.y;
    return minY > playerPosition.y + ABOVE_PLAYER_EPSILON;
  }

  private isOverheadPart(record: BuildingVisibilityMeshRecord): boolean {
    return (
      OVERHEAD_PART_PATTERN.test(record.part) ||
      OVERHEAD_PART_PATTERN.test(record.mesh.name)
    );
  }

  private logRoofMetadata(): void {
    for (const building of this.registry.getBuildings()) {
      for (const record of building.meshes) {
        if (!this.isOverheadPart(record)) {
          continue;
        }

        record.mesh.computeWorldMatrix(true);
        const boundingBox = record.mesh.getBoundingInfo().boundingBox;
        console.info("[BuildingVisibility] roof/ceiling metadata", {
          meshName: record.mesh.name,
          meshId: record.mesh.id,
          buildingId: record.buildingId,
          storyIndex: record.storyIndex,
          part: record.part,
          role: record.role,
          hideWhenAbovePlayer: record.hideWhenAbovePlayer,
          rawMetadata: record.rawMetadata,
          bounds: {
            minY: boundingBox.minimumWorld.y,
            maxY: boundingBox.maximumWorld.y,
          },
        });
      }
    }
  }

  private logHaloMaterialTargets(): void {
    const haloTargets = this.registry
      .getBuildings()
      .flatMap((building) =>
        building.haloMeshes.map((record) => this.describeRecord(record)),
      );
    console.debug("[BuildingVisibility] halo material targets", haloTargets);
  }

  private applyHiddenMeshSet(meshesToHide: ReadonlySet<AbstractMesh>): void {
    for (const [meshId, state] of [...this.hiddenMeshStates]) {
      const mesh = this.findMeshByUniqueId(meshId);
      if (!mesh || mesh.isDisposed() || !meshesToHide.has(mesh)) {
        if (mesh && !mesh.isDisposed()) {
          mesh.setEnabled(state.isEnabled);
          mesh.isVisible = state.isVisible;
          mesh.visibility = state.visibility;
        }
        this.hiddenMeshStates.delete(meshId);
      }
    }

    for (const mesh of meshesToHide) {
      if (mesh.isDisposed()) {
        continue;
      }

      if (!this.hiddenMeshStates.has(mesh.uniqueId)) {
        this.hiddenMeshStates.set(mesh.uniqueId, {
          isEnabled: mesh.isEnabled(),
          isVisible: mesh.isVisible,
          visibility: mesh.visibility,
        });
      }

      if (mesh.isVisible) {
        mesh.isVisible = false;
        mesh.visibility = 0;
        mesh.setEnabled(false);
      }
    }
  }

  private collectRenderableMeshes(mesh: AbstractMesh): AbstractMesh[] {
    const renderableMeshes = [mesh];
    const childMeshResolver = mesh as {
      getChildMeshes?: (directDescendantsOnly?: boolean) => AbstractMesh[];
    };

    if (typeof childMeshResolver.getChildMeshes === "function") {
      renderableMeshes.push(...childMeshResolver.getChildMeshes(false));
    }

    const instancedMeshSource = mesh as { instances?: AbstractMesh[] };
    if (Array.isArray(instancedMeshSource.instances)) {
      renderableMeshes.push(...instancedMeshSource.instances);
    }

    const seenMeshIds = new Set<number>();
    return renderableMeshes.filter((renderableMesh) => {
      if (
        renderableMesh.isDisposed() ||
        seenMeshIds.has(renderableMesh.uniqueId)
      ) {
        return false;
      }

      seenMeshIds.add(renderableMesh.uniqueId);
      return true;
    });
  }

  private restoreHiddenMeshes(): void {
    for (const [meshId, state] of this.hiddenMeshStates) {
      const mesh = this.findMeshByUniqueId(meshId);
      if (!mesh || mesh.isDisposed()) {
        continue;
      }

      mesh.setEnabled(state.isEnabled);
      mesh.isVisible = state.isVisible;
      mesh.visibility = state.visibility;
    }

    this.hiddenMeshStates.clear();
  }

  private restoreHaloMaterials(): void {
    for (const [meshId, binding] of this.haloMaterialBindings) {
      const mesh = this.findMeshByUniqueId(meshId);
      const haloMaterial = binding.haloMaterial;

      if (mesh && !mesh.isDisposed() && mesh.material === haloMaterial) {
        mesh.material = binding.originalMaterial;
      }

      const disposableMaterial = haloMaterial as {
        dispose: (
          forceDisposeEffect?: boolean,
          forceDisposeTextures?: boolean,
          forceDisposeChildren?: boolean,
        ) => void;
      };
      disposableMaterial.dispose(false, false, true);
    }

    this.haloMaterialBindings.clear();
  }

  private findPlayerBuildingState(
    playerPosition: Vector3,
  ): PlayerBuildingState | null {
    for (const building of this.registry.getBuildings()) {
      if (!this.isPlayerInsideBuilding(building, playerPosition)) {
        continue;
      }

      return {
        building,
        storyIndex: this.resolveCurrentStory(building, playerPosition),
      };
    }

    return null;
  }

  private isPlayerInsideBuilding(
    building: BuildingVisibilityBuildingRecord,
    playerPosition: Vector3,
  ): boolean {
    if (building.insideVolumes.length > 0) {
      return building.insideVolumes.some((record) =>
        containsPoint(record.mesh, playerPosition, true),
      );
    }

    if (!building.footprintBounds) {
      return false;
    }

    return containsPointInXz(building.footprintBounds, playerPosition);
  }

  private resolveCurrentStory(
    building: BuildingVisibilityBuildingRecord,
    playerPosition: Vector3,
  ): number {
    let resolvedStory = Number.NEGATIVE_INFINITY;

    for (const [storyIndex, bounds] of building.storyBoundsByStory) {
      if (playerPosition.y >= bounds.min.y - STORY_EPSILON) {
        resolvedStory = Math.max(resolvedStory, storyIndex);
      }
    }

    if (Number.isFinite(resolvedStory)) {
      return resolvedStory;
    }

    return Math.min(...building.meshes.map((record) => record.storyIndex), 0);
  }

  private findMeshByUniqueId(uniqueId: number): AbstractMesh | null {
    if (!this.scene) {
      return null;
    }

    return this.scene.meshes.find((mesh) => mesh.uniqueId === uniqueId) ?? null;
  }

  private resolveLocalPlayerEntity(): Entity | null {
    const localPlayerEntities = this.entityManager.query(
      LocalPlayerComponent,
      TransformComponent,
    );

    if (localPlayerEntities.length === 0) {
      return null;
    }

    if (localPlayerEntities.length > 1) {
      throw new Error(
        `BuildingVisibilitySystem requires exactly one local player entity, but found ${localPlayerEntities.length}.`,
      );
    }

    return localPlayerEntities[0];
  }

  private logVisibilityStateChange(
    playerPosition: Vector3,
    playerBuildingState: PlayerBuildingState | null,
    hiddenRecords: readonly BuildingVisibilityMeshRecord[],
  ): void {
    const stateKey = playerBuildingState
      ? `${playerBuildingState.building.buildingId}:${playerBuildingState.storyIndex}:${hiddenRecords.map((record) => record.mesh.uniqueId).join(",")}`
      : "outside";

    if (!DEBUG_BUILDING_VISIBILITY || stateKey === this.lastStateKey) {
      return;
    }

    const building = playerBuildingState?.building ?? null;
    console.debug("[BuildingVisibility] state change", {
      playerPosition: {
        x: playerPosition.x,
        y: playerPosition.y,
        z: playerPosition.z,
      },
      inside: playerBuildingState !== null,
      buildingId: building?.buildingId ?? null,
      storyIndex: playerBuildingState?.storyIndex ?? null,
      registeredHaloMeshes: building?.haloMeshes.length ?? 0,
      registeredHideAboveMeshes: building?.hideAboveMeshes.length ?? 0,
      hiddenMeshes: hiddenRecords.map((record) => this.describeRecord(record)),
      haloMeshes:
        building?.haloMeshes.map((record) => this.describeRecord(record)) ?? [],
    });
    this.lastStateKey = stateKey;
  }

  private describeRecord(
    record: BuildingVisibilityMeshRecord,
  ): Record<string, unknown> {
    record.mesh.computeWorldMatrix(true);
    const boundingBox = record.mesh.getBoundingInfo().boundingBox;

    return {
      name: record.mesh.name,
      id: record.mesh.id,
      role: record.role,
      part: record.part,
      storyIndex: record.storyIndex,
      minY: boundingBox.minimumWorld.y,
      maxY: boundingBox.maximumWorld.y,
    };
  }
}

function containsPoint(
  mesh: AbstractMesh,
  point: Vector3,
  includeY: boolean,
): boolean {
  mesh.computeWorldMatrix(true);
  const boundingBox = mesh.getBoundingInfo().boundingBox;
  const min = boundingBox.minimumWorld;
  const max = boundingBox.maximumWorld;

  const xzContains =
    point.x >= min.x &&
    point.x <= max.x &&
    point.z >= min.z &&
    point.z <= max.z;
  if (!xzContains || !includeY) {
    return xzContains;
  }

  return point.y >= min.y - STORY_EPSILON && point.y <= max.y + STORY_EPSILON;
}

function containsPointInXz(
  bounds: BuildingVisibilityBounds,
  point: Vector3,
): boolean {
  return (
    point.x >= bounds.min.x &&
    point.x <= bounds.max.x &&
    point.z >= bounds.min.z &&
    point.z <= bounds.max.z
  );
}
