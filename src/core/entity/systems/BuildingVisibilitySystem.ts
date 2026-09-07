import {
  AbstractMesh,
  InstancedMesh,
  Vector3,
  type Scene as BabylonScene,
  type Node,
} from "@babylonjs/core";
import type { Entity } from "../Entity";
import type { EntityManager } from "../EntityManager";
import type { System } from "../System";
import { LocalPlayerComponent } from "../components/LocalPlayerComponent";
import { TransformComponent } from "../components/TransformComponent";
import { GridPositionComponent } from "../components/GridPositionComponent";
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
  readonly isPickable: boolean;
  readonly layerMask: number;
}

interface PlayerBuildingState {
  readonly building: BuildingVisibilityBuildingRecord;
  readonly storyIndex: number;
}

interface DistanceHiddenMeshState {
  readonly isEnabled: boolean;
  readonly isVisible: boolean;
  readonly visibility: number;
  readonly isPickable: boolean;
}

interface ShadowProxyHiddenMeshState extends DistanceHiddenMeshState {
  readonly layerMask: number;
}

interface HaloMaterialTargetState {
  readonly mesh: AbstractMesh;
  readonly binding: WallHaloMaterialBinding;
}

const DEBUG_BUILDING_VISIBILITY = false;
const STORY_EPSILON = 0.25;
const STORY_HEIGHT_EPSILON = 0.75;
const ABOVE_PLAYER_EPSILON = 0.5;
const INTERIOR_SHOW_DISTANCE = 16;
const INTERIOR_HIDE_DISTANCE = 20;
const OVERHEAD_PART_PATTERN =
  /(roof|ceiling|slab|terrace|floor|border|band|railing)/i;

/**
 * Applies building-specific visibility rules for the local player.
 *
 * Babylon owns per-mesh frustum culling. Building interiors and LODs use player
 * distance, while authored inside volumes drive story cutaway state.
 */
export class BuildingVisibilitySystem implements System {
  private readonly entityManager: EntityManager;
  private readonly registry: BuildingVisibilityRegistry;
  private readonly hiddenMeshStates: Map<number, HiddenMeshState>;
  private readonly distanceHiddenMeshStates: Map<number, DistanceHiddenMeshState>;
  private readonly lodHiddenMeshStates: Map<number, DistanceHiddenMeshState>;
  private readonly shadowProxyHiddenMeshStates: Map<number, ShadowProxyHiddenMeshState>;
  private readonly interiorVisibilityByBuilding: Map<string, boolean>;
  private readonly fullLodVisibilityByBuilding: Map<string, boolean>;
  private readonly haloMaterialBindings: Map<number, HaloMaterialTargetState>;
  private readonly haloMaterialBindingsBySource: Map<number, WallHaloMaterialBinding>;
  private readonly renderableMeshesBySourceId: Map<number, readonly AbstractMesh[]>;
  private readonly activeInteriorBuildingIds: Set<string>;
  private readonly activeLodBuildingIds: Set<string>;
  private readonly haloSettings: WallHaloSettings;
  private scene: BabylonScene | null;
  private localPlayerEntity: Entity | null;
  private registeredBuildings: readonly BuildingVisibilityBuildingRecord[];
  private activeDistrictMeshesReference: readonly AbstractMesh[] | null;
  private activeDistrictNodesReference: readonly Node[] | null;
  private cachedPlayerBuildingStates: readonly PlayerBuildingState[];
  private cachedPlayerPosition: Vector3 | null;
  private cachedPlayerStoryIndex: number | null;
  private hasCachedPlayerBuildingState: boolean;
  private playerVisibilityStateChanged: boolean;
  private upperVisibilityPosition: Vector3 | null;
  private upperVisibilityStateKey: string;
  private upperVisibilityInitialized: boolean;
  private lastStateKey: string;

  public constructor(entityManager: EntityManager) {
    this.entityManager = entityManager;
    this.registry = new BuildingVisibilityRegistry();
    this.hiddenMeshStates = new Map();
    this.distanceHiddenMeshStates = new Map();
    this.lodHiddenMeshStates = new Map();
    this.shadowProxyHiddenMeshStates = new Map();
    this.interiorVisibilityByBuilding = new Map();
    this.fullLodVisibilityByBuilding = new Map();
    this.haloMaterialBindings = new Map();
    this.haloMaterialBindingsBySource = new Map();
    this.renderableMeshesBySourceId = new Map();
    this.activeInteriorBuildingIds = new Set();
    this.activeLodBuildingIds = new Set();
    this.haloSettings = {
      innerRadius: 1.15,
      outerRadius: 2.85,
      minAlpha: 0.16,
      shape: "sphere",
      insideBuilding: false,
    };
    this.scene = null;
    this.localPlayerEntity = null;
    this.registeredBuildings = [];
    this.activeDistrictMeshesReference = null;
    this.activeDistrictNodesReference = null;
    this.cachedPlayerBuildingStates = [];
    this.cachedPlayerPosition = null;
    this.cachedPlayerStoryIndex = null;
    this.hasCachedPlayerBuildingState = false;
    this.playerVisibilityStateChanged = false;
    this.upperVisibilityPosition = null;
    this.upperVisibilityStateKey = "";
    this.upperVisibilityInitialized = false;
    this.lastStateKey = "";
  }

  public setScene(scene: BabylonScene | null): void {
    this.restoreHiddenMeshes();
    this.restoreLodHiddenMeshes();
    this.restoreShadowProxyHiddenMeshes();
    this.restoreDistanceHiddenMeshes();
    this.restoreHaloMaterials();
    this.registry.rebuild([]);
    this.registeredBuildings = [];
    this.activeDistrictMeshesReference = null;
    this.activeDistrictNodesReference = null;
    this.renderableMeshesBySourceId.clear();
    this.activeInteriorBuildingIds.clear();
    this.activeLodBuildingIds.clear();
    this.interiorVisibilityByBuilding.clear();
    this.fullLodVisibilityByBuilding.clear();
    this.cachedPlayerBuildingStates = [];
    this.cachedPlayerPosition = null;
    this.cachedPlayerStoryIndex = null;
    this.hasCachedPlayerBuildingState = false;
    this.playerVisibilityStateChanged = false;
    this.upperVisibilityPosition = null;
    this.upperVisibilityStateKey = "";
    this.upperVisibilityInitialized = false;
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
      context.locationManager.getActiveDistrictNodes(),
    );

    const localPlayer =
      this.localPlayerEntity ?? this.resolveLocalPlayerEntity();
    if (!localPlayer) {
      return;
    }

    this.localPlayerEntity = localPlayer;
    const playerPosition = localPlayer.getComponent(TransformComponent).value;
    const playerGridPosition = localPlayer.tryGetComponent(GridPositionComponent);
    const logicalPlayerStoryIndex =
      playerGridPosition?.currentStoryIndex ?? null;
    const cameraPosition =
      this.scene.activeCamera?.globalPosition ?? playerPosition;
    const playerBuildingStates = this.resolvePlayerBuildingStates(
      playerPosition,
      logicalPlayerStoryIndex,
    );

    this.updateHaloMaterials(
      playerPosition,
      cameraPosition,
      playerBuildingStates.length > 0,
    );
    const interiorVisibilityChanged = this.playerVisibilityStateChanged
      ? this.updateInteriorVisibility(playerPosition)
      : false;
    const lodVisibilityChanged = this.playerVisibilityStateChanged
      ? this.updateLodVisibility(
        playerPosition,
        new Set(playerBuildingStates.map((state) => state.building.buildingId)),
      )
      : false;
    this.updateUpperMeshVisibility(playerPosition, playerBuildingStates);
    if (interiorVisibilityChanged || lodVisibilityChanged) {
      context.shadowRegistry?.synchronize();
    }
  }

  private rebuildIfDistrictMeshesChanged(
    activeDistrictMeshes: readonly AbstractMesh[],
    activeDistrictNodes: readonly Node[],
  ): void {
    if (
      activeDistrictMeshes === this.activeDistrictMeshesReference &&
      activeDistrictNodes === this.activeDistrictNodesReference
    ) {
      return;
    }

    this.restoreHiddenMeshes();
    this.restoreLodHiddenMeshes();
    this.restoreShadowProxyHiddenMeshes();
    this.restoreDistanceHiddenMeshes();
    this.interiorVisibilityByBuilding.clear();
    this.restoreHaloMaterials();
    this.registry.rebuild(activeDistrictMeshes, activeDistrictNodes);
    this.registeredBuildings = this.registry.getBuildings();
    this.activeDistrictMeshesReference = activeDistrictMeshes;
    this.activeDistrictNodesReference = activeDistrictNodes;
    this.fullLodVisibilityByBuilding.clear();
    this.renderableMeshesBySourceId.clear();
    this.activeInteriorBuildingIds.clear();
    this.activeLodBuildingIds.clear();
    this.cachedPlayerBuildingStates = [];
    this.cachedPlayerPosition = null;
    this.cachedPlayerStoryIndex = null;
    this.hasCachedPlayerBuildingState = false;
    this.playerVisibilityStateChanged = false;
    this.upperVisibilityPosition = null;
    this.upperVisibilityStateKey = "";
    this.upperVisibilityInitialized = false;
    this.hideShadowProxiesFromMainCamera();
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
    for (const building of this.registeredBuildings) {
      for (const record of building.haloMeshes) {
        if (record.role !== "wall_halo") {
          console.warn(
            "[BuildingVisibility] skipped non-wall halo candidate",
            this.describeRecord(record),
          );
          continue;
        }

        const materialOwner = resolveMaterialOwner(record.mesh);
        if (
          materialOwner.isDisposed() ||
          this.haloMaterialBindings.has(materialOwner.uniqueId)
        ) {
          continue;
        }

        const sourceMaterial = materialOwner.material;
        if (!sourceMaterial) {
          continue;
        }

        const sourceMaterialId = sourceMaterial.uniqueId;
        const binding = this.haloMaterialBindingsBySource.get(sourceMaterialId)
          ?? installWallHaloMaterial(sourceMaterial);
        if (!binding) {
          continue;
        }

        this.haloMaterialBindingsBySource.set(sourceMaterialId, binding);
        materialOwner.material = binding.haloMaterial;
        this.haloMaterialBindings.set(materialOwner.uniqueId, {
          mesh: materialOwner,
          binding,
        });
      }
    }
  }

  private hideShadowProxiesFromMainCamera(): void {
    for (const building of this.registeredBuildings) {
      for (const record of building.meshes) {
        if (record.lodRole === "shadow_proxy") {
          this.applyShadowProxyVisibility(record);
        }
      }
    }
  }

  private updateHaloMaterials(
    playerPosition: Vector3,
    cameraPosition: Vector3,
    insideBuilding: boolean,
  ): void {
    for (const binding of this.haloMaterialBindingsBySource.values()) {
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
    playerBuildingStates: readonly PlayerBuildingState[],
    ): void {
    const stateKey = playerBuildingStates
      .map((state) => `${state.building.buildingId}:${state.storyIndex}`)
      .join("|");
    if (
      this.upperVisibilityInitialized &&
      this.upperVisibilityPosition?.equals(playerPosition) &&
      this.upperVisibilityStateKey === stateKey
    ) {
      return;
    }

    if (!this.upperVisibilityPosition) {
      this.upperVisibilityPosition = playerPosition.clone();
    } else {
      this.upperVisibilityPosition.copyFrom(playerPosition);
    }
    this.upperVisibilityStateKey = stateKey;
    this.upperVisibilityInitialized = true;

    if (playerBuildingStates.length === 0) {
      this.restoreHiddenMeshes();
      return;
    }

    const recordsToHide = DEBUG_BUILDING_VISIBILITY
      ? [] as BuildingVisibilityMeshRecord[]
      : null;
    const renderableMeshesToHide = new Set<AbstractMesh>();

    for (const { building, storyIndex } of playerBuildingStates) {
      for (const record of building.meshes) {
        if (this.shouldHideRecordWhenInside(record, storyIndex, playerPosition)) {
          recordsToHide?.push(record);
          for (const mesh of this.collectRenderableMeshes(record.mesh)) {
            renderableMeshesToHide.add(mesh);
          }
        }
      }
    }

    this.applyHiddenMeshSet(renderableMeshesToHide);
    this.logVisibilityStateChange(playerPosition, playerBuildingStates, recordsToHide ?? []);
    for (const { building, storyIndex } of playerBuildingStates) {
      this.debugLogUnhiddenAboveMeshes(building, playerPosition, storyIndex, renderableMeshesToHide);
    }
  }

  private updateInteriorVisibility(playerPosition: Vector3): boolean {
    this.activeInteriorBuildingIds.clear();
    let visibilityChanged = false;

    for (const building of this.registeredBuildings) {
      if (building.interiorMeshes.length === 0) {
        continue;
      }

      this.activeInteriorBuildingIds.add(building.buildingId);
      const distance = getDistanceToBoundsXZ(building.footprintBounds, playerPosition);
      const hasPreviousState = this.interiorVisibilityByBuilding.has(building.buildingId);
      const wasVisible = this.interiorVisibilityByBuilding.get(building.buildingId) ?? false;
      // The two thresholds prevent interior meshes from toggling while walking on the edge.
      const isVisible = wasVisible
        ? distance <= INTERIOR_HIDE_DISTANCE
        : distance <= INTERIOR_SHOW_DISTANCE;
      if (hasPreviousState && wasVisible === isVisible) {
        continue;
      }

      visibilityChanged = true;
      this.interiorVisibilityByBuilding.set(building.buildingId, isVisible);
      this.applyInteriorVisibility(building.interiorMeshes, isVisible);
    }

    for (const buildingId of this.interiorVisibilityByBuilding.keys()) {
      if (!this.activeInteriorBuildingIds.has(buildingId)) {
        this.interiorVisibilityByBuilding.delete(buildingId);
        visibilityChanged = true;
      }
    }

    return visibilityChanged;
  }

  private applyInteriorVisibility(
    records: readonly BuildingVisibilityMeshRecord[],
    isVisible: boolean,
  ): void {
    for (const record of records) {
      for (const mesh of this.collectRenderableMeshes(record.mesh)) {
        if (mesh.isDisposed()) {
          continue;
        }

        if (isVisible) {
          const state = this.distanceHiddenMeshStates.get(mesh.uniqueId);
          if (state) {
            restoreDistanceHiddenMeshState(mesh, state);
            this.distanceHiddenMeshStates.delete(mesh.uniqueId);
          }
          continue;
        }

        if (!this.distanceHiddenMeshStates.has(mesh.uniqueId)) {
          this.distanceHiddenMeshStates.set(mesh.uniqueId, {
            isEnabled: mesh.isEnabled(false),
            isVisible: mesh.isVisible,
            visibility: mesh.visibility,
            isPickable: this.getBasePickability(mesh),
          });
        }

        mesh.setEnabled(false);
        mesh.isPickable = false;
      }
    }
  }

  private updateLodVisibility(
    playerPosition: Vector3,
    playerBuildingIds: ReadonlySet<string>,
  ): boolean {
    this.activeLodBuildingIds.clear();
    let visibilityChanged = false;

    for (const building of this.registeredBuildings) {
      if (!building.hasRenderableLodPair) {
        continue;
      }

      this.activeLodBuildingIds.add(building.buildingId);
      const distance = getDistanceToBoundsXZ(building.footprintBounds, playerPosition);
      const hasPreviousState = this.fullLodVisibilityByBuilding.has(building.buildingId);
      const wasFull = this.fullLodVisibilityByBuilding.get(building.buildingId) ?? false;
      const isFull = playerBuildingIds.has(building.buildingId) ||
        (wasFull ? distance <= INTERIOR_HIDE_DISTANCE : distance <= INTERIOR_SHOW_DISTANCE);
      if (hasPreviousState && wasFull === isFull) {
        continue;
      }

      visibilityChanged = true;
      this.fullLodVisibilityByBuilding.set(building.buildingId, isFull);
      this.applyLodVisibility(building.lodMeshes, isFull);
    }

    for (const buildingId of this.fullLodVisibilityByBuilding.keys()) {
      if (!this.activeLodBuildingIds.has(buildingId)) {
        this.fullLodVisibilityByBuilding.delete(buildingId);
        visibilityChanged = true;
      }
    }

    return visibilityChanged;
  }

  private applyLodVisibility(
    records: readonly BuildingVisibilityMeshRecord[],
    showFullLod: boolean,
  ): void {
    const targetLevel = showFullLod ? 0 : 1;
    for (const record of records) {
      // Interior geometry has its own distance gate. Keeping it out of this
      // state stack avoids one visibility controller restoring another one's
      // disabled state when LOD0 and the interior gate change together.
      if (record.isInterior) {
        continue;
      }

      if (record.lodRole === "shadow_proxy") {
        this.applyShadowProxyVisibility(record);
        continue;
      }

      const shouldEnable = record.lodLevel === targetLevel;
      for (const mesh of this.collectRenderableMeshes(record.mesh)) {
        if (mesh.isDisposed()) {
          continue;
        }

        if (shouldEnable) {
          const state = this.lodHiddenMeshStates.get(mesh.uniqueId);
          if (state) {
            restoreDistanceHiddenMeshState(mesh, state);
            this.lodHiddenMeshStates.delete(mesh.uniqueId);
          }
          continue;
        }

        if (!this.lodHiddenMeshStates.has(mesh.uniqueId)) {
          this.lodHiddenMeshStates.set(mesh.uniqueId, {
            isEnabled: mesh.isEnabled(false),
            isVisible: mesh.isVisible,
            visibility: mesh.visibility,
            isPickable: this.getBasePickability(mesh),
          });
        }

        mesh.setEnabled(false);
        mesh.isPickable = false;
      }
    }
  }

  private applyShadowProxyVisibility(record: BuildingVisibilityMeshRecord): void {
    for (const mesh of this.collectRenderableMeshes(record.mesh)) {
      if (mesh.isDisposed()) {
        continue;
      }

      if (!this.shadowProxyHiddenMeshStates.has(mesh.uniqueId)) {
        this.shadowProxyHiddenMeshStates.set(mesh.uniqueId, {
          isEnabled: mesh.isEnabled(false),
          isVisible: mesh.isVisible,
          visibility: mesh.visibility,
          isPickable: mesh.isPickable,
          layerMask: mesh.layerMask,
        });
      }

      // An explicit shadow render list ignores layer masks, while the main camera does not.
      mesh.setEnabled(true);
      mesh.isVisible = true;
      mesh.layerMask = 0;
      mesh.isPickable = false;
    }
  }

  private shouldHideRecordWhenInside(
    record: BuildingVisibilityMeshRecord,
    currentStory: number,
    playerPosition: Vector3,
  ): boolean {
    if (record.mesh.isDisposed() || record.isInsideVolume) {
      return false;
    }

    if (record.visibilityBehavior === "external_stair_connector") {
      const hidden = this.shouldHideExternalStairRecord(record, currentStory);
      if (DEBUG_BUILDING_VISIBILITY) {
        console.debug("[BuildingVisibility] external stair visibility", {
          meshName: record.mesh.name,
          currentStory,
          recordStory: record.storyIndex,
          fromStory: record.fromStory,
          toStory: record.toStory,
          behavior: record.visibilityBehavior,
          hidden,
        });
      }
      return hidden;
    }

    if (record.visibilityBehavior === "always_visible_when_building_visible") {
      return false;
    }

    if (record.isWallHalo && record.storyIndex <= currentStory) {
      return false;
    }

    const isStoryAbovePlayer = Number.isFinite(record.storyIndex) && record.storyIndex > currentStory;
    if (isStoryAbovePlayer) {
      return true;
    }

    const bounds = getWorldBounds(record.mesh);
    const isPhysicallyAbovePlayer = bounds.min.y > playerPosition.y + ABOVE_PLAYER_EPSILON;

    if (!isPhysicallyAbovePlayer) {
      return false;
    }

    return this.isOverheadPart(record);
  }

  private shouldHideExternalStairRecord(
    record: BuildingVisibilityMeshRecord,
    currentStory: number,
  ): boolean {
    const fromStory = isFiniteNumber(record.fromStory)
      ? record.fromStory
      : record.storyIndex;

    const toStory = isFiniteNumber(record.toStory)
      ? record.toStory
      : fromStory;

    if (!isFiniteNumber(fromStory) || !isFiniteNumber(toStory)) {
      return false;
    }

    const minStory = Math.min(fromStory, toStory);
    const maxStory = Math.max(fromStory, toStory);

    return !(maxStory >= currentStory - 1 && minStory <= currentStory + 1);
  }

  private isOverheadPart(record: BuildingVisibilityMeshRecord): boolean {
    return (
      OVERHEAD_PART_PATTERN.test(record.part) ||
      OVERHEAD_PART_PATTERN.test(record.mesh.name)
    );
  }

  private logRoofMetadata(): void {
    for (const building of this.registeredBuildings) {
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
    for (const [meshId, state] of this.hiddenMeshStates) {
      const mesh = this.findMeshByUniqueId(meshId);
      if (!mesh || mesh.isDisposed() || !meshesToHide.has(mesh)) {
        if (mesh && !mesh.isDisposed()) {
          restoreCutawayHiddenMeshState(mesh, state);
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
          isPickable: mesh.isPickable,
          layerMask: mesh.layerMask,
        });
      }

      applyCutawayHiddenMeshState(mesh);
      if (DEBUG_BUILDING_VISIBILITY) {
        console.debug("[BuildingVisibility] cutaway-hidden mesh keeps shadow caster", {
          meshName: mesh.name,
          meshId: mesh.id,
          uniqueId: mesh.uniqueId,
          enabled: mesh.isEnabled(),
          isVisible: mesh.isVisible,
          visibility: mesh.visibility,
          isPickable: mesh.isPickable,
        });
      }
    }
  }

  private collectRenderableMeshes(mesh: AbstractMesh): readonly AbstractMesh[] {
    const cachedMeshes = this.renderableMeshesBySourceId.get(mesh.uniqueId);
    if (cachedMeshes) {
      return cachedMeshes;
    }

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
    const result = renderableMeshes.filter((renderableMesh) => {
      if (
        renderableMesh.isDisposed() ||
        seenMeshIds.has(renderableMesh.uniqueId)
      ) {
        return false;
      }

      seenMeshIds.add(renderableMesh.uniqueId);
      return true;
    });
    this.renderableMeshesBySourceId.set(mesh.uniqueId, result);
    return result;
  }

  private getBasePickability(mesh: AbstractMesh): boolean {
    return this.hiddenMeshStates.get(mesh.uniqueId)?.isPickable ?? mesh.isPickable;
  }

  private restoreHiddenMeshes(): void {
    for (const [meshId, state] of this.hiddenMeshStates) {
      const mesh = this.findMeshByUniqueId(meshId);
      if (!mesh || mesh.isDisposed()) {
        continue;
      }

      restoreCutawayHiddenMeshState(mesh, state);
    }

    this.hiddenMeshStates.clear();
  }

  private restoreDistanceHiddenMeshes(): void {
    for (const [meshId, state] of this.distanceHiddenMeshStates) {
      const mesh = this.findMeshByUniqueId(meshId);
      if (!mesh || mesh.isDisposed()) {
        continue;
      }

      restoreDistanceHiddenMeshState(mesh, state);
    }

    this.distanceHiddenMeshStates.clear();
  }

  private restoreLodHiddenMeshes(): void {
    for (const [meshId, state] of this.lodHiddenMeshStates) {
      const mesh = this.findMeshByUniqueId(meshId);
      if (!mesh || mesh.isDisposed()) {
        continue;
      }

      restoreDistanceHiddenMeshState(mesh, state);
    }

    this.lodHiddenMeshStates.clear();
  }

  private restoreShadowProxyHiddenMeshes(): void {
    for (const [meshId, state] of this.shadowProxyHiddenMeshStates) {
      const mesh = this.findMeshByUniqueId(meshId);
      if (!mesh || mesh.isDisposed()) {
        continue;
      }

      restoreShadowProxyHiddenMeshState(mesh, state);
    }

    this.shadowProxyHiddenMeshStates.clear();
  }

  private restoreHaloMaterials(): void {
    const bindings = new Set<WallHaloMaterialBinding>();
    for (const target of this.haloMaterialBindings.values()) {
      if (
        !target.mesh.isDisposed() &&
        target.mesh.material === target.binding.haloMaterial
      ) {
        target.mesh.material = target.binding.originalMaterial;
      }

      bindings.add(target.binding);
    }

    for (const binding of bindings) {
      const disposableMaterial = binding.haloMaterial as {
        dispose: (
          forceDisposeEffect?: boolean,
          forceDisposeTextures?: boolean,
          forceDisposeChildren?: boolean,
        ) => void;
      };
      disposableMaterial.dispose(false, false, true);
    }

    this.haloMaterialBindings.clear();
    this.haloMaterialBindingsBySource.clear();
  }

  private findPlayerBuildingStates(
    playerPosition: Vector3,
    logicalPlayerStoryIndex: number | null,
  ): readonly PlayerBuildingState[] {
    const states: PlayerBuildingState[] = [];
    for (const building of this.registeredBuildings) {
      if (!this.isPlayerInsideBuilding(building, playerPosition)) {
        continue;
      }

      states.push({
        building,
        storyIndex: this.resolveCurrentStory(
          building,
          playerPosition,
          logicalPlayerStoryIndex,
        ),
      });
    }

    return states;
  }

  private resolvePlayerBuildingStates(
    playerPosition: Vector3,
    logicalPlayerStoryIndex: number | null,
  ): readonly PlayerBuildingState[] {
    if (
      this.hasCachedPlayerBuildingState &&
      this.cachedPlayerPosition?.equals(playerPosition) &&
      this.cachedPlayerStoryIndex === logicalPlayerStoryIndex
    ) {
      this.playerVisibilityStateChanged = false;
      return this.cachedPlayerBuildingStates;
    }

    if (!this.cachedPlayerPosition) {
      this.cachedPlayerPosition = playerPosition.clone();
    } else {
      this.cachedPlayerPosition.copyFrom(playerPosition);
    }
    this.cachedPlayerStoryIndex = logicalPlayerStoryIndex;
    this.cachedPlayerBuildingStates = this.findPlayerBuildingStates(
      playerPosition,
      logicalPlayerStoryIndex,
    );
    this.hasCachedPlayerBuildingState = true;
    this.playerVisibilityStateChanged = true;
    return this.cachedPlayerBuildingStates;
  }

  private isPlayerInsideBuilding(
    building: BuildingVisibilityBuildingRecord,
    playerPosition: Vector3,
  ): boolean {
    if (building.insideVolumes.length > 0) {
      return building.insideVolumes.some((record) =>
        containsPointInBounds(record.bounds, playerPosition, true),
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
    logicalPlayerStoryIndex: number | null,
  ): number {
    if (isFiniteNumber(logicalPlayerStoryIndex)) {
      return logicalPlayerStoryIndex;
    }

    const volumeStoryCandidates: number[] = [];
    for (const record of building.insideVolumes) {
      if (containsPointInBounds(record.bounds, playerPosition, true)) {
        volumeStoryCandidates.push(record.storyIndex);
      }
    }

    if (volumeStoryCandidates.length > 0) {
      return Math.max(...volumeStoryCandidates);
    }

    const containingStoryCandidates: number[] = [];
    let highestStoryBelowPlayer = Number.NEGATIVE_INFINITY;

    for (const [storyIndex, bounds] of building.storyBoundsByStory) {
      if (playerPosition.y >= bounds.min.y - STORY_EPSILON) {
        highestStoryBelowPlayer = Math.max(highestStoryBelowPlayer, storyIndex);
      }

      if (
        playerPosition.y >= bounds.min.y - STORY_EPSILON &&
        playerPosition.y <= bounds.max.y + STORY_HEIGHT_EPSILON
      ) {
        containingStoryCandidates.push(storyIndex);
      }
    }

    if (containingStoryCandidates.length > 0) {
      return Math.max(...containingStoryCandidates);
    }

    if (Number.isFinite(highestStoryBelowPlayer)) {
      return highestStoryBelowPlayer;
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
    playerBuildingStates: readonly PlayerBuildingState[],
    hiddenRecords: readonly BuildingVisibilityMeshRecord[],
  ): void {
    if (!DEBUG_BUILDING_VISIBILITY) {
      return;
    }

    const stateKey = playerBuildingStates.length > 0
      ? `${playerBuildingStates.map((state) => `${state.building.buildingId}:${state.storyIndex}`).join("|")}:${hiddenRecords.map((record) => record.mesh.uniqueId).join(",")}`
      : "outside";

    if (stateKey === this.lastStateKey) {
      return;
    }

    console.debug("[BuildingVisibility] state change", {
      playerPosition: {
        x: playerPosition.x,
        y: playerPosition.y,
        z: playerPosition.z,
      },
      inside: playerBuildingStates.length > 0,
      buildings: playerBuildingStates.map(({ building, storyIndex }) => ({
        buildingId: building.buildingId,
        storyIndex,
        registeredHaloMeshes: building.haloMeshes.length,
        registeredHideAboveMeshes: building.hideAboveMeshes.length,
      })),
      hiddenMeshes: hiddenRecords.map((record) => this.describeRecord(record)),
      haloMeshes: playerBuildingStates.flatMap(({ building }) =>
        building.haloMeshes.map((record) => this.describeRecord(record))
      ),
    });
    this.lastStateKey = stateKey;
  }

  private debugLogUnhiddenAboveMeshes(
    building: BuildingVisibilityBuildingRecord,
    playerPosition: Vector3,
    currentStory: number,
    hiddenMeshes: ReadonlySet<AbstractMesh>,
  ): void {
    if (!DEBUG_BUILDING_VISIBILITY) {
      return;
    }

    for (const record of building.meshes) {
      if (record.mesh.isDisposed() || record.isInsideVolume) {
        continue;
      }

      if (
        !this.shouldHideRecordWhenInside(record, currentStory, playerPosition) ||
        hiddenMeshes.has(record.mesh)
      ) {
        continue;
      }

      const bounds = getWorldBounds(record.mesh);
      console.warn("[BuildingVisibility] above but not hidden", {
        name: record.mesh.name,
        id: record.mesh.id,
        role: record.role,
        part: record.part,
        storyIndex: record.storyIndex,
        minY: bounds.min.y,
        maxY: bounds.max.y,
        rawMetadata: record.rawMetadata,
      });
    }
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

export function applyCutawayHiddenMeshState(mesh: {
  isPickable: boolean;
  layerMask: number;
}): void {
  // Explicit shadow render lists ignore layer masks, while the main camera does not.
  mesh.layerMask = 0;
  mesh.isPickable = false;
}

export function restoreCutawayHiddenMeshState(
  mesh: {
    isPickable: boolean;
    layerMask: number;
  },
  state: HiddenMeshState,
): void {
  mesh.isPickable = state.isPickable;
  mesh.layerMask = state.layerMask;
}

function containsPointInBounds(
  bounds: BuildingVisibilityBounds,
  point: Vector3,
  includeY: boolean,
): boolean {
  const xzContains =
    point.x >= bounds.min.x &&
    point.x <= bounds.max.x &&
    point.z >= bounds.min.z &&
    point.z <= bounds.max.z;
  if (!xzContains || !includeY) {
    return xzContains;
  }

  return (
    point.y >= bounds.min.y - STORY_EPSILON &&
    point.y <= bounds.max.y + STORY_EPSILON
  );
}

function getWorldBounds(mesh: AbstractMesh): BuildingVisibilityBounds {
  mesh.computeWorldMatrix(true);
  const boundingBox = mesh.getBoundingInfo().boundingBox;
  return {
    min: boundingBox.minimumWorld,
    max: boundingBox.maximumWorld,
  };
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

function getDistanceToBoundsXZ(
  bounds: BuildingVisibilityBounds | null,
  point: Vector3,
): number {
  if (!bounds) {
    return Number.POSITIVE_INFINITY;
  }

  const dx = Math.max(bounds.min.x - point.x, 0, point.x - bounds.max.x);
  const dz = Math.max(bounds.min.z - point.z, 0, point.z - bounds.max.z);
  return Math.sqrt(dx * dx + dz * dz);
}

function restoreDistanceHiddenMeshState(
  mesh: {
    setEnabled(enabled: boolean): void;
    isVisible: boolean;
    visibility: number;
    isPickable: boolean;
  },
  state: DistanceHiddenMeshState,
): void {
  mesh.setEnabled(state.isEnabled);
  mesh.isVisible = state.isVisible;
  mesh.visibility = state.visibility;
  mesh.isPickable = state.isPickable;
}

function restoreShadowProxyHiddenMeshState(
  mesh: {
    setEnabled(enabled: boolean): void;
    isVisible: boolean;
    visibility: number;
    isPickable: boolean;
    layerMask: number;
  },
  state: ShadowProxyHiddenMeshState,
): void {
  restoreDistanceHiddenMeshState(mesh, state);
  mesh.layerMask = state.layerMask;
}

function resolveMaterialOwner(mesh: AbstractMesh): AbstractMesh {
  return mesh instanceof InstancedMesh ? mesh.sourceMesh : mesh;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}
