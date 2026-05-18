import {
  Node,
  AnimationGroup,
  ArcRotateCamera,
  Scene as BabylonScene,
  Skeleton,
  TransformNode,
  Vector3,
  type AbstractMesh,
  type IParticleSystem
} from "@babylonjs/core";
import "@babylonjs/loaders/glTF";
import type { LangManager } from "../../lang/LangManager";
import { GameWorld } from "../GameWorld";
import type { World } from "../World";
import { GameLocation } from "./GameLocation";
import type { Location } from "./Location";
import type { LocationDefinition } from "./LocationDefinition";
import type {
  DistrictChunkSize,
  DistrictDefinition,
  DistrictSceneCoord,
  DistrictSceneDefinition,
  DistrictStreamingDefinition
} from "./district/DistrictDefinition";
import type { District } from "./district/District";
import type { DistrictModelData, DistrictSceneData } from "./district/DistrictModelData";
import { GameDistrict } from "./district/GameDistrict";
import { importSceneContent } from "../scene/SceneContentLoader";
import type { SceneLightingDescriptor } from "../../lighting/LightingTypes";
import type { ShadowMeshBatch } from "../../lighting/SceneShadowRegistry";
import type { TerrainQuadtreeLodController } from "../terrain/lod/TerrainQuadtreeLodController";
import {
  DEFAULT_TERRAIN_QUADTREE_LOD,
  type TerrainQuadtreeLodRuntimeTuning,
  type TerrainCanonicalMeshMode,
  type TerrainLodAnchor,
  type TerrainQuadtreeLodDebugMode
} from "../terrain/lod/TerrainQuadtreeLodTypes";

interface LoadedDistrictSceneContent {
  readonly sceneId: string;
  readonly coord: DistrictSceneCoord;
  readonly root: TransformNode;
  readonly meshes: AbstractMesh[];
  readonly renderableMeshes: AbstractMesh[];
  readonly terrainMeshes: AbstractMesh[];
  readonly terrainLodControllers: TerrainQuadtreeLodController[];
  readonly sceneObjectMeshes: AbstractMesh[];
  readonly transformNodes: TransformNode[];
  readonly skeletons: Skeleton[];
  readonly animationGroups: AnimationGroup[];
  readonly particleSystems: IParticleSystem[];
  readonly descriptorPath?: string;
  readonly terrainModelPath?: string;
  readonly lightingDescriptor: SceneLightingDescriptor;
  readonly objectCount: number;
}

export interface DistrictSceneInitializationResult {
  readonly lightingDescriptor: SceneLightingDescriptor;
}

export interface TerrainLodRuntimeDiagnostics {
  readonly controllerCount: number;
  readonly visibleLeafCount: number;
  readonly patchMeshEstimate: number;
  readonly activePatchMeshCount: number;
  readonly inactivePatchMeshCount: number;
  readonly totalPatchMeshCount: number;
  readonly cachedPatchMeshCount: number;
  readonly inactiveCachedPatchMeshCount: number;
  readonly activePatchVertices: number;
  readonly activePatchTriangles: number;
  readonly inactivePatchVertices: number;
  readonly inactivePatchTriangles: number;
  readonly totalPatchVertices: number;
  readonly totalPatchTriangles: number;
  readonly cachedPatchVertices: number;
  readonly cachedPatchTriangles: number;
  readonly patchesBuiltLastUpdate: number;
  readonly patchesReusedLastUpdate: number;
  readonly patchesDisabledLastUpdate: number;
  readonly patchesDisposedLastUpdate: number;
  readonly patchCacheEnabled: boolean;
  readonly activeDebugLineMeshCount: number;
  readonly approxVisibleTriangles: number;
  readonly sourceResolutionXMax: number | null;
  readonly sourceResolutionZMax: number | null;
  readonly sourceQuadCount: number;
  readonly canonicalMeshMode: TerrainCanonicalMeshMode | "mixed";
  readonly canonicalMeshVertexCount: number;
  readonly canonicalMeshTriangleCount: number;
  readonly hiddenPickOnlyTerrainVertexCount: number;
  readonly hiddenPickOnlyTerrainTriangleCount: number;
  readonly frustumCullingEnabled: boolean;
  readonly frustumTestedNodeCount: number;
  readonly frustumRejectedNodeCount: number;
  readonly frustumAcceptedNodeCount: number;
  readonly frustumKeptByNearAnchorCount: number;
  readonly maxDepth: number;
  readonly anchorSource: TerrainLodAnchor["source"] | "mixed" | null;
  readonly depthCounts: ReadonlyMap<number, number>;
  readonly sampleStepCounts: ReadonlyMap<number, number>;
  readonly buildSampleStepCounts: ReadonlyMap<number, number>;
  readonly approxTrianglesBySampleStep: ReadonlyMap<number, number>;
  readonly approxTrianglesByBuildSampleStep: ReadonlyMap<number, number>;
  readonly seamAdjustedPatchCount: number;
  readonly maxNeighborSampleStepRatio: number | null;
  readonly minLeafWorldSize: number | null;
  readonly maxLeafWorldSize: number | null;
  readonly minNearLeafWorldSize: number | null;
  readonly maxNearLeafWorldSize: number | null;
  readonly minDistanceToAnchor: number | null;
  readonly maxDistanceToAnchor: number | null;
  readonly sourceQuadSizeMin: number | null;
  readonly sourceQuadSizeMax: number | null;
  readonly desiredNearPatchWorldSizeMin: number | null;
  readonly desiredNearPatchWorldSizeMax: number | null;
  readonly debugMode: TerrainQuadtreeLodDebugMode | "mixed";
}

export interface DistrictRuntimeDiagnostics {
  readonly loadedChunkCount: number;
  readonly activeMeshCount: number;
  readonly activeRenderableMeshCount: number;
  readonly activeTerrainMeshCount: number;
  readonly activeSceneObjectMeshCount: number;
  readonly terrainLodControllerCount: number;
  readonly skeletonCount: number;
  readonly animationGroupCount: number;
  readonly particleSystemCount: number;
}

/**
 * Loads and manages world locations and district scene initialization.
 */
export class LocationManager {
  /** Relative JSON path containing location definitions. */
  private static readonly STORE_PATH = "/assets/data/locations/store.json";
  private static readonly LEGACY_STREAMING: DistrictStreamingDefinition = {
    enabled: false,
    loadMargin: 8,
    unloadDistance: 2
  };

  /** Shared language manager used by location and district entities. */
  private readonly langManager: LangManager;

  /** Runtime location list built from JSON definitions. */
  private locations: GameLocation[];

  /** Currently active authored district, if any. */
  private activeDistrict: District | null;

  /** Currently loaded district scene chunks keyed by chunk-space coord. */
  private readonly activeDistrictScenes: Map<string, LoadedDistrictSceneContent>;

  /** Global lighting descriptor from the district initial chunk. */
  private activeLightingDescriptor: SceneLightingDescriptor | null;
  private terrainLodDebugEnabled: boolean;
  private terrainPolygonWireDebugEnabled: boolean;
  private terrainLodRuntimeTuning: TerrainQuadtreeLodRuntimeTuning | null;

  /**
   * Creates a location manager.
   *
   * @param langManager - Shared language manager instance.
   */
  public constructor(langManager: LangManager) {
    this.langManager = langManager;
    this.locations = [];
    this.activeDistrict = null;
    this.activeDistrictScenes = new Map();
    this.activeLightingDescriptor = null;
    this.terrainLodDebugEnabled = false;
    this.terrainPolygonWireDebugEnabled = false;
    this.terrainLodRuntimeTuning = null;
  }

  /**
   * Loads and parses all location definitions from JSON.
   *
   * @returns Promise that resolves when locations are ready.
   */
  public async loadLocations(): Promise<void> {
    const response = await fetch(LocationManager.STORE_PATH);
    if (!response.ok) {
      throw new Error(`Failed to load locations store: ${response.status}`);
    }

    const rawDefinitions = (await response.json()) as unknown;
    this.locations = this.parseLocations(rawDefinitions);
  }

  /**
   * Creates a world object from loaded locations.
   *
   * @returns Runtime world containing loaded locations.
   */
  public createWorld(): World {
    return new GameWorld(this.getLocations());
  }

  /**
   * Returns loaded locations.
   *
   * @returns List of runtime locations.
   */
  public getLocations(): Location[] {
    return [...this.locations];
  }

  /**
   * Finds location by id.
   *
   * @param id - Location id.
   * @returns Location if found, otherwise undefined.
   */
  public getLocationById(id: string): Location | undefined {
    return this.locations.find((location) => location.getId() === id);
  }

  /**
   * Returns default location for initial gameplay.
   *
   * @returns Default loaded location.
   */
  public createDefaultLocation(): Location {
    const defaultLocation = this.locations[0];
    if (!defaultLocation) {
      throw new Error("No locations loaded. Call loadLocations() first.");
    }

    return defaultLocation;
  }

  /**
   * Initializes Babylon scene content for selected district.
   *
   * @param scene - Babylon scene to populate.
   * @param district - District runtime instance.
   * @returns Promise that resolves when district visuals and camera are ready.
   */
  public async createDistrictScene(scene: BabylonScene, district: District): Promise<DistrictSceneInitializationResult> {
    this.activeDistrict = district;
    this.disposeActiveDistrictScenes();
    const initialScene = district.getInitialScene();
    await this.loadDistrictSceneChunk(scene, district, initialScene.coord);
    const initialContent = this.activeDistrictScenes.get(this.createCoordKey(initialScene.coord));
    if (!initialContent) {
      throw new Error(`District '${district.getId()}' initial scene '${initialScene.id}' failed to load.`);
    }
    this.activeLightingDescriptor = initialContent.lightingDescriptor;

    const target = this.resolveActiveDistrictCenter();
    const camera = new ArcRotateCamera("in-game-camera", -Math.PI / 4, Math.PI / 3, 30, target, scene);
    camera.lowerRadiusLimit = 5;
    camera.upperRadiusLimit = 120;
    camera.attachControl(true);
    scene.activeCamera = camera;

    return {
      lightingDescriptor: initialContent.lightingDescriptor
    };
  }

  /**
   * Legacy transition entry-point kept only to fail loudly if outdated trigger code reaches it.
   *
   * @param scene - Active Babylon scene.
   * @param modelPath - Relative path to district model file.
   * @returns Center point of the loaded district used as spawn fallback.
   */
  public async transitionToDistrictModel(_scene: BabylonScene, modelPath: string): Promise<Vector3> {
    throw new Error(
      `Legacy district model transition '${modelPath}' is no longer supported. Use district scenes[].scene JSON descriptors instead.`
    );
  }

  /**
   * Loads one district scene chunk into the active Babylon scene.
   *
   * @param scene - Active Babylon scene.
   * @param district - District definition containing chunk metadata.
   * @param coord - Chunk-space X/Z coordinate.
   * @returns True when chunk is loaded or already present, false when missing from data.
   */
  public async loadDistrictSceneChunk(scene: BabylonScene, district: District, coord: DistrictSceneCoord): Promise<boolean> {
    const sceneData = district.getSceneByCoord(coord);
    if (!sceneData) {
      return false;
    }

    const coordKey = this.createCoordKey(coord);
    if (this.activeDistrictScenes.has(coordKey)) {
      return true;
    }

    console.info(`[DistrictStreaming] chunkLoad start coord=${coordKey} descriptor=${sceneData.scene}`);
    const content = await this.importDistrictSceneChunk(scene, district.getModelData(), sceneData);
    this.activeDistrictScenes.set(coordKey, content);
    console.info(
      `[DistrictStreaming] chunkLoad complete coord=${coordKey} descriptor=${content.descriptorPath ?? "none"} terrain=${content.terrainModelPath ?? "none"} objects=${content.objectCount} meshes=${content.meshes.length}`
    );
    return true;
  }

  /**
   * Disposes one loaded district chunk by its chunk-space coordinate.
   *
   * @param coord - Chunk-space X/Z coordinate.
   */
  public unloadDistrictSceneChunk(coord: DistrictSceneCoord): void {
    const coordKey = this.createCoordKey(coord);
    const content = this.activeDistrictScenes.get(coordKey);
    if (!content) {
      return;
    }

    this.disposeLoadedDistrictScene(content);
    this.activeDistrictScenes.delete(coordKey);
  }

  /**
   * Returns loaded district chunk coordinates.
   *
   * @returns Chunk coordinates currently loaded into the scene.
   */
  public getLoadedDistrictSceneCoords(): readonly DistrictSceneCoord[] {
    return Array.from(this.activeDistrictScenes.values(), (content) => content.coord);
  }

  /**
   * Returns meshes belonging to loaded district chunks.
   *
   * @returns Active district meshes across all loaded chunks.
   */
  public getActiveDistrictMeshes(): readonly AbstractMesh[] {
    return Array.from(this.activeDistrictScenes.values())
      .flatMap((content) => content.meshes)
      .filter((mesh) => !isTerrainVisualOnlyMesh(mesh));
  }

  public getActiveDistrictTerrainMeshes(): readonly AbstractMesh[] {
    return Array.from(this.activeDistrictScenes.values()).flatMap((content) => content.terrainMeshes);
  }

  public getActiveDistrictSceneObjectMeshes(): readonly AbstractMesh[] {
    return Array.from(this.activeDistrictScenes.values()).flatMap((content) => content.sceneObjectMeshes);
  }

  public getShadowMeshBatches(): readonly ShadowMeshBatch[] {
    return Array.from(this.activeDistrictScenes.values()).flatMap((content) => this.createShadowMeshBatches(content));
  }

  public getShadowMeshBatchesForCoord(coord: DistrictSceneCoord): readonly ShadowMeshBatch[] {
    const content = this.activeDistrictScenes.get(this.createCoordKey(coord));
    return content ? this.createShadowMeshBatches(content) : [];
  }

  /**
   * Returns global lighting descriptor captured from the initial district chunk.
   *
   * Streaming chunks intentionally do not change global lighting automatically; time-of-day
   * blending and cross-chunk lighting transitions belong to a later stage.
   *
   * @returns Active lighting descriptor or null before district scene initialization.
   */
  public getActiveLightingDescriptor(): SceneLightingDescriptor | null {
    return this.activeLightingDescriptor;
  }

  /**
   * Returns active district nodes used for trigger discovery.
   *
   * @returns Active district nodes including chunk roots, meshes and transform nodes.
   */
  public getActiveDistrictNodes(): readonly Node[] {
    return Array.from(this.activeDistrictScenes.values()).flatMap((content) => [
      content.root,
      ...content.meshes.filter((mesh) => !isTerrainVisualOnlyMesh(mesh)),
      ...content.transformNodes
    ]);
  }

  public updateTerrainLodControllers(deltaSeconds: number, anchor: TerrainLodAnchor): void {
    for (const content of this.activeDistrictScenes.values()) {
      for (const controller of content.terrainLodControllers) {
        controller.update(deltaSeconds, anchor);
      }
    }
  }

  public hasTerrainLodControllers(): boolean {
    return Array.from(this.activeDistrictScenes.values()).some((content) => content.terrainLodControllers.length > 0);
  }

  public toggleTerrainLodDebug(): boolean {
    this.terrainLodDebugEnabled = !this.terrainLodDebugEnabled;
    for (const content of this.activeDistrictScenes.values()) {
      for (const controller of content.terrainLodControllers) {
        controller.setDebugEnabled(this.terrainLodDebugEnabled);
      }
    }
    return this.terrainLodDebugEnabled;
  }

  public getTerrainLodDebugEnabled(): boolean {
    return this.terrainLodDebugEnabled;
  }

  public toggleTerrainPolygonWireDebug(): boolean {
    this.terrainPolygonWireDebugEnabled = !this.terrainPolygonWireDebugEnabled;
    for (const content of this.activeDistrictScenes.values()) {
      for (const controller of content.terrainLodControllers) {
        controller.setPolygonWireDebugEnabled(this.terrainPolygonWireDebugEnabled);
      }
    }
    return this.terrainPolygonWireDebugEnabled;
  }

  public getTerrainPolygonWireDebugEnabled(): boolean {
    return this.terrainPolygonWireDebugEnabled;
  }

  public setTerrainLodRuntimeTuning(tuning: TerrainQuadtreeLodRuntimeTuning): void {
    this.terrainLodRuntimeTuning = this.normalizeTerrainLodRuntimeTuning(tuning);
    for (const content of this.activeDistrictScenes.values()) {
      for (const controller of content.terrainLodControllers) {
        controller.setRuntimeLodTuning(this.terrainLodRuntimeTuning);
      }
    }
  }

  public getTerrainLodRuntimeTuning(): TerrainQuadtreeLodRuntimeTuning {
    if (this.terrainLodRuntimeTuning) {
      return this.terrainLodRuntimeTuning;
    }

    for (const content of this.activeDistrictScenes.values()) {
      const controller = content.terrainLodControllers[0];
      if (controller) {
        return controller.getRuntimeLodTuning();
      }
    }

    return this.normalizeTerrainLodRuntimeTuning({
      lod0Distance: DEFAULT_TERRAIN_QUADTREE_LOD.nearFullResolutionRadius,
      lod1Distance: DEFAULT_TERRAIN_QUADTREE_LOD.lodRings[1]?.distance ??
        (DEFAULT_TERRAIN_QUADTREE_LOD.nearFullResolutionRadius * 2)
    });
  }

  public getTerrainLodDiagnostics(): TerrainLodRuntimeDiagnostics {
    const depthCounts = new Map<number, number>();
    const sampleStepCounts = new Map<number, number>();
    const buildSampleStepCounts = new Map<number, number>();
    const approxTrianglesBySampleStep = new Map<number, number>();
    const approxTrianglesByBuildSampleStep = new Map<number, number>();
    let controllerCount = 0;
    let visibleLeafCount = 0;
    let patchMeshEstimate = 0;
    let activePatchMeshCount = 0;
    let inactivePatchMeshCount = 0;
    let totalPatchMeshCount = 0;
    let cachedPatchMeshCount = 0;
    let inactiveCachedPatchMeshCount = 0;
    let activePatchVertices = 0;
    let activePatchTriangles = 0;
    let inactivePatchVertices = 0;
    let inactivePatchTriangles = 0;
    let totalPatchVertices = 0;
    let totalPatchTriangles = 0;
    let cachedPatchVertices = 0;
    let cachedPatchTriangles = 0;
    let patchesBuiltLastUpdate = 0;
    let patchesReusedLastUpdate = 0;
    let patchesDisabledLastUpdate = 0;
    let patchesDisposedLastUpdate = 0;
    let patchCacheEnabled = false;
    let activeDebugLineMeshCount = 0;
    let approxVisibleTriangles = 0;
    let sourceResolutionXMax: number | null = null;
    let sourceResolutionZMax: number | null = null;
    let sourceQuadCount = 0;
    let canonicalMeshMode: TerrainLodRuntimeDiagnostics["canonicalMeshMode"] | null = null;
    let canonicalMeshVertexCount = 0;
    let canonicalMeshTriangleCount = 0;
    let hiddenPickOnlyTerrainVertexCount = 0;
    let hiddenPickOnlyTerrainTriangleCount = 0;
    let frustumCullingEnabled = false;
    let frustumTestedNodeCount = 0;
    let frustumRejectedNodeCount = 0;
    let frustumAcceptedNodeCount = 0;
    let frustumKeptByNearAnchorCount = 0;
    let seamAdjustedPatchCount = 0;
    let maxNeighborSampleStepRatio: number | null = null;
    let maxDepth = 0;
    let anchorSource: TerrainLodRuntimeDiagnostics["anchorSource"] = null;
    let minLeafWorldSize: number | null = null;
    let maxLeafWorldSize: number | null = null;
    let minNearLeafWorldSize: number | null = null;
    let maxNearLeafWorldSize: number | null = null;
    let minDistanceToAnchor: number | null = null;
    let maxDistanceToAnchor: number | null = null;
    let sourceQuadSizeMin: number | null = null;
    let sourceQuadSizeMax: number | null = null;
    let desiredNearPatchWorldSizeMin: number | null = null;
    let desiredNearPatchWorldSizeMax: number | null = null;
    let debugMode: TerrainLodRuntimeDiagnostics["debugMode"] | null = null;

    for (const content of this.activeDistrictScenes.values()) {
      for (const controller of content.terrainLodControllers) {
        const diagnostics = controller.getDiagnostics();
        controllerCount += 1;
        visibleLeafCount += diagnostics.visibleLeafCount;
        patchMeshEstimate += diagnostics.activePatchMeshCount;
        activePatchMeshCount += diagnostics.activePatchMeshCount;
        inactivePatchMeshCount += diagnostics.inactivePatchMeshCount;
        totalPatchMeshCount += diagnostics.totalPatchMeshCount;
        cachedPatchMeshCount += diagnostics.cachedPatchMeshCount;
        inactiveCachedPatchMeshCount += diagnostics.inactiveCachedPatchMeshCount;
        activePatchVertices += diagnostics.activePatchVertices;
        activePatchTriangles += diagnostics.activePatchTriangles;
        inactivePatchVertices += diagnostics.inactivePatchVertices;
        inactivePatchTriangles += diagnostics.inactivePatchTriangles;
        totalPatchVertices += diagnostics.totalPatchVertices;
        totalPatchTriangles += diagnostics.totalPatchTriangles;
        cachedPatchVertices += diagnostics.cachedPatchVertices;
        cachedPatchTriangles += diagnostics.cachedPatchTriangles;
        patchesBuiltLastUpdate += diagnostics.patchesBuiltLastUpdate;
        patchesReusedLastUpdate += diagnostics.patchesReusedLastUpdate;
        patchesDisabledLastUpdate += diagnostics.patchesDisabledLastUpdate;
        patchesDisposedLastUpdate += diagnostics.patchesDisposedLastUpdate;
        patchCacheEnabled = patchCacheEnabled || diagnostics.patchCacheEnabled;
        activeDebugLineMeshCount += diagnostics.activeDebugLineMeshCount;
        approxVisibleTriangles += diagnostics.approxVisibleTriangles;
        sourceResolutionXMax = this.maxNullable(sourceResolutionXMax, diagnostics.sourceResolutionX);
        sourceResolutionZMax = this.maxNullable(sourceResolutionZMax, diagnostics.sourceResolutionZ);
        sourceQuadCount += diagnostics.sourceQuadCount;
        canonicalMeshMode = this.mergeTerrainCanonicalMeshMode(canonicalMeshMode, diagnostics.canonicalMeshMode);
        canonicalMeshVertexCount += diagnostics.canonicalMeshVertexCount;
        canonicalMeshTriangleCount += diagnostics.canonicalMeshTriangleCount;
        hiddenPickOnlyTerrainVertexCount += diagnostics.hiddenPickOnlyTerrainVertexCount;
        hiddenPickOnlyTerrainTriangleCount += diagnostics.hiddenPickOnlyTerrainTriangleCount;
        frustumCullingEnabled = frustumCullingEnabled || diagnostics.frustumCulling.enabled;
        frustumTestedNodeCount += diagnostics.frustumCulling.testedNodeCount;
        frustumRejectedNodeCount += diagnostics.frustumCulling.rejectedNodeCount;
        frustumAcceptedNodeCount += diagnostics.frustumCulling.acceptedNodeCount;
        frustumKeptByNearAnchorCount += diagnostics.frustumCulling.keptByNearAnchorCount;
        seamAdjustedPatchCount += diagnostics.seamAdjustedPatchCount;
        maxNeighborSampleStepRatio = this.maxNullable(maxNeighborSampleStepRatio, diagnostics.maxNeighborSampleStepRatio);
        maxDepth = Math.max(maxDepth, diagnostics.maxDepth);
        anchorSource = this.mergeTerrainLodAnchorSource(anchorSource, diagnostics.anchorSource);
        debugMode = this.mergeTerrainLodDebugMode(debugMode, diagnostics.debugMode);
        this.mergeCountMap(depthCounts, diagnostics.depthCounts);
        this.mergeCountMap(sampleStepCounts, diagnostics.sampleStepCounts);
        this.mergeCountMap(buildSampleStepCounts, diagnostics.buildSampleStepCounts);
        this.mergeCountMap(approxTrianglesBySampleStep, diagnostics.approxTrianglesBySampleStep);
        this.mergeCountMap(approxTrianglesByBuildSampleStep, diagnostics.approxTrianglesByBuildSampleStep);
        minLeafWorldSize = this.minNullable(minLeafWorldSize, diagnostics.minLeafWorldSize);
        maxLeafWorldSize = this.maxNullable(maxLeafWorldSize, diagnostics.maxLeafWorldSize);
        minNearLeafWorldSize = this.minNullable(minNearLeafWorldSize, diagnostics.minNearLeafWorldSize);
        maxNearLeafWorldSize = this.maxNullable(maxNearLeafWorldSize, diagnostics.maxNearLeafWorldSize);
        minDistanceToAnchor = this.minNullable(minDistanceToAnchor, diagnostics.minDistanceToAnchor);
        maxDistanceToAnchor = this.maxNullable(maxDistanceToAnchor, diagnostics.maxDistanceToAnchor);
        sourceQuadSizeMin = this.minNullable(sourceQuadSizeMin, diagnostics.sourceQuadSize);
        sourceQuadSizeMax = this.maxNullable(sourceQuadSizeMax, diagnostics.sourceQuadSize);
        desiredNearPatchWorldSizeMin = this.minNullable(
          desiredNearPatchWorldSizeMin,
          diagnostics.desiredNearPatchWorldSize
        );
        desiredNearPatchWorldSizeMax = this.maxNullable(
          desiredNearPatchWorldSizeMax,
          diagnostics.desiredNearPatchWorldSize
        );
      }
    }

    return {
      controllerCount,
      visibleLeafCount,
      patchMeshEstimate,
      activePatchMeshCount,
      inactivePatchMeshCount,
      totalPatchMeshCount,
      cachedPatchMeshCount,
      inactiveCachedPatchMeshCount,
      activePatchVertices,
      activePatchTriangles,
      inactivePatchVertices,
      inactivePatchTriangles,
      totalPatchVertices,
      totalPatchTriangles,
      cachedPatchVertices,
      cachedPatchTriangles,
      patchesBuiltLastUpdate,
      patchesReusedLastUpdate,
      patchesDisabledLastUpdate,
      patchesDisposedLastUpdate,
      patchCacheEnabled,
      activeDebugLineMeshCount,
      approxVisibleTriangles,
      sourceResolutionXMax,
      sourceResolutionZMax,
      sourceQuadCount,
      canonicalMeshMode: canonicalMeshMode ?? "OFF",
      canonicalMeshVertexCount,
      canonicalMeshTriangleCount,
      hiddenPickOnlyTerrainVertexCount,
      hiddenPickOnlyTerrainTriangleCount,
      frustumCullingEnabled,
      frustumTestedNodeCount,
      frustumRejectedNodeCount,
      frustumAcceptedNodeCount,
      frustumKeptByNearAnchorCount,
      maxDepth,
      anchorSource,
      depthCounts,
      sampleStepCounts,
      buildSampleStepCounts,
      approxTrianglesBySampleStep,
      approxTrianglesByBuildSampleStep,
      seamAdjustedPatchCount,
      maxNeighborSampleStepRatio,
      minLeafWorldSize,
      maxLeafWorldSize,
      minNearLeafWorldSize,
      maxNearLeafWorldSize,
      minDistanceToAnchor,
      maxDistanceToAnchor,
      sourceQuadSizeMin,
      sourceQuadSizeMax,
      desiredNearPatchWorldSizeMin,
      desiredNearPatchWorldSizeMax,
      debugMode: debugMode ?? "off"
    };
  }

  public getDistrictRuntimeDiagnostics(): DistrictRuntimeDiagnostics {
    let activeMeshCount = 0;
    let activeRenderableMeshCount = 0;
    let activeTerrainMeshCount = 0;
    let activeSceneObjectMeshCount = 0;
    let terrainLodControllerCount = 0;
    let skeletonCount = 0;
    let animationGroupCount = 0;
    let particleSystemCount = 0;

    for (const content of this.activeDistrictScenes.values()) {
      activeMeshCount += content.meshes.length;
      activeRenderableMeshCount += content.renderableMeshes.length;
      activeTerrainMeshCount += content.terrainMeshes.length;
      activeSceneObjectMeshCount += content.sceneObjectMeshes.length;
      terrainLodControllerCount += content.terrainLodControllers.length;
      skeletonCount += content.skeletons.length;
      animationGroupCount += content.animationGroups.length;
      particleSystemCount += content.particleSystems.length;
    }

    return {
      loadedChunkCount: this.activeDistrictScenes.size,
      activeMeshCount,
      activeRenderableMeshCount,
      activeTerrainMeshCount,
      activeSceneObjectMeshCount,
      terrainLodControllerCount,
      skeletonCount,
      animationGroupCount,
      particleSystemCount
    };
  }

  /**
   * Returns currently active authored district, if one was created by createDistrictScene.
   *
   * @returns Active district or null for legacy ad-hoc transitions.
   */
  public getActiveDistrict(): District | null {
    return this.activeDistrict;
  }

  /**
   * Returns world-space center of currently loaded district content.
   *
   * @returns Center point based on combined loaded chunk bounds.
   */
  public resolveActiveDistrictCenter(): Vector3 {
    const districtMeshes = this.getActiveDistrictMeshes();
    const visibleMeshes = districtMeshes.filter((mesh) => mesh.isVisible && mesh.isEnabled());
    const sourceMeshes = visibleMeshes.length > 0 ? visibleMeshes : districtMeshes;

    if (sourceMeshes.length === 0) {
      return Vector3.Zero();
    }

    let minX = Number.POSITIVE_INFINITY;
    let minY = Number.POSITIVE_INFINITY;
    let minZ = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY;
    let maxY = Number.NEGATIVE_INFINITY;
    let maxZ = Number.NEGATIVE_INFINITY;

    for (const mesh of sourceMeshes) {
      const bounds = mesh.getBoundingInfo().boundingBox;
      const min = bounds.minimumWorld;
      const max = bounds.maximumWorld;
      minX = Math.min(minX, min.x);
      minY = Math.min(minY, min.y);
      minZ = Math.min(minZ, min.z);
      maxX = Math.max(maxX, max.x);
      maxY = Math.max(maxY, max.y);
      maxZ = Math.max(maxZ, max.z);
    }

    if (![minX, minY, minZ, maxX, maxY, maxZ].every((value) => Number.isFinite(value))) {
      return Vector3.Zero();
    }

    return new Vector3((minX + maxX) * 0.5, minY, (minZ + maxZ) * 0.5);
  }

  /**
   * Creates stable string key for chunk-space coordinate.
   *
   * @param coord - Chunk-space X/Z coordinate.
   * @returns Stable map key.
   */
  public createCoordKey(coord: DistrictSceneCoord): string {
    return `${coord[0]}:${coord[1]}`;
  }

  /**
   * Parses untyped JSON payload into runtime locations.
   *
   * @param payload - Raw JSON value.
   * @returns Parsed location list.
   */
  private parseLocations(payload: unknown): GameLocation[] {
    if (!Array.isArray(payload)) {
      throw new Error("Location store payload must be an array.");
    }

    return payload.map((item) => this.createLocation(item));
  }

  /**
   * Creates one runtime location from raw JSON object.
   *
   * @param value - Raw JSON object value.
   * @returns Runtime game location.
   */
  private createLocation(value: unknown): GameLocation {
    const definition = this.parseLocationDefinition(value);
    const districts = definition.districts.map((district) => new GameDistrict(district, this.langManager));
    return new GameLocation(definition.id, definition.title, districts, this.langManager);
  }

  /**
   * Validates and converts unknown value into location definition.
   *
   * @param value - Raw unknown value.
   * @returns Typed location definition.
   */
  private parseLocationDefinition(value: unknown): LocationDefinition {
    if (!value || typeof value !== "object") {
      throw new Error("Invalid location definition.");
    }

    const record = value as Record<string, unknown>;
    const { id, title, districts } = record;

    if (typeof id !== "string" || typeof title !== "string" || !Array.isArray(districts)) {
      throw new Error("Location definition contains invalid fields.");
    }

    return {
      id,
      title,
      districts: districts.map((district) => this.parseDistrictDefinition(district))
    };
  }

  /**
   * Validates and converts unknown value into district definition.
   *
   * @param value - Raw unknown value.
   * @returns Typed district definition.
   */
  private parseDistrictDefinition(value: unknown): DistrictDefinition {
    if (!value || typeof value !== "object") {
      throw new Error("Invalid district definition.");
    }

    const record = value as Record<string, unknown>;
    const id = this.requireString(record.id, "District definition id must be a string.");
    const title = this.requireString(record.title, `District '${id}' title must be a string.`);
    const legacyModel = record.model;
    if (typeof legacyModel === "string") {
      throw new Error(`District '${id}' uses legacy model loading. Use scenes[].scene JSON descriptor instead.`);
    }

    const chunkSize = this.parseChunkSize(record.chunkSize, id);
    const streaming = this.parseStreaming(record.streaming, id);
    const rawScenes = record.scenes;
    if (!Array.isArray(rawScenes) || rawScenes.length === 0) {
      throw new Error(`District '${id}' must define a non-empty scenes array.`);
    }

    const seenCoordKeys = new Set<string>();
    const scenes = rawScenes.map((scene, index) => {
      const parsedScene = this.parseDistrictSceneDefinition(scene, id, index);
      const coordKey = this.createCoordKey(parsedScene.coord);
      if (seenCoordKeys.has(coordKey)) {
        throw new Error(`District '${id}' contains duplicate scene coord '${coordKey}'.`);
      }

      seenCoordKeys.add(coordKey);
      return parsedScene;
    });

    return { id, title, chunkSize, streaming, scenes };
  }

  private parseChunkSize(value: unknown, districtId: string): DistrictChunkSize {
    if (!value || typeof value !== "object") {
      throw new Error(`District '${districtId}' chunkSize must be an object.`);
    }

    const record = value as Record<string, unknown>;
    const x = this.requirePositiveNumber(record.x, `District '${districtId}' chunkSize.x must be a positive number.`);
    const z = this.requirePositiveNumber(record.z, `District '${districtId}' chunkSize.z must be a positive number.`);
    return { x, z };
  }

  private parseStreaming(value: unknown, districtId: string): DistrictStreamingDefinition {
    if (value == null) {
      return { ...LocationManager.LEGACY_STREAMING };
    }

    if (typeof value !== "object") {
      throw new Error(`District '${districtId}' streaming must be an object.`);
    }

    const record = value as Record<string, unknown>;
    const enabled = this.requireBoolean(record.enabled, `District '${districtId}' streaming.enabled must be a boolean.`);
    const loadMargin = this.requireNonNegativeNumber(
      record.loadMargin,
      `District '${districtId}' streaming.loadMargin must be a non-negative number.`
    );
    const unloadDistance = this.requireNonNegativeNumber(
      record.unloadDistance,
      `District '${districtId}' streaming.unloadDistance must be a non-negative number.`
    );
    return { enabled, loadMargin, unloadDistance };
  }

  private parseDistrictSceneDefinition(value: unknown, districtId: string, index: number): DistrictSceneDefinition {
    if (!value || typeof value !== "object") {
      throw new Error(`District '${districtId}' scene at index ${index} must be an object.`);
    }

    const record = value as Record<string, unknown>;
    const id = this.requireString(record.id, `District '${districtId}' scene at index ${index} must have a string id.`);
    const model = this.optionalString(record.model, `District '${districtId}' scene '${id}' model must be a string path.`);
    if (model) {
      throw new Error(`District '${districtId}' scene '${id}' uses legacy model loading. Use scene: 'assets/data/scenes/...json'.`);
    }
    const scene = this.requireString(record.scene, `District '${districtId}' scene '${id}' scene must be a string path.`);

    const coord = this.parseDistrictSceneCoord(record.coord, districtId, id);
    return { id, coord, scene };
  }

  private parseDistrictSceneCoord(value: unknown, districtId: string, sceneId: string): DistrictSceneCoord {
    if (!Array.isArray(value) || value.length !== 2) {
      throw new Error(`District '${districtId}' scene '${sceneId}' coord must be a [x, z] tuple.`);
    }

    const [rawX, rawZ] = value;
    if (!Number.isInteger(rawX) || !Number.isFinite(rawX)) {
      throw new Error(`District '${districtId}' scene '${sceneId}' coord[0] must be a finite integer.`);
    }

    if (!Number.isInteger(rawZ) || !Number.isFinite(rawZ)) {
      throw new Error(`District '${districtId}' scene '${sceneId}' coord[1] must be a finite integer.`);
    }

    return [rawX, rawZ];
  }

  private requireString(value: unknown, errorMessage: string): string {
    if (typeof value !== "string") {
      throw new Error(errorMessage);
    }

    return value;
  }

  private optionalString(value: unknown, errorMessage: string): string | undefined {
    if (value === undefined) {
      return undefined;
    }

    if (typeof value !== "string") {
      throw new Error(errorMessage);
    }

    return value;
  }

  private requireBoolean(value: unknown, errorMessage: string): boolean {
    if (typeof value !== "boolean") {
      throw new Error(errorMessage);
    }

    return value;
  }

  private requirePositiveNumber(value: unknown, errorMessage: string): number {
    if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
      throw new Error(errorMessage);
    }

    return value;
  }

  private requireNonNegativeNumber(value: unknown, errorMessage: string): number {
    if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
      throw new Error(errorMessage);
    }

    return value;
  }

  private mergeCountMap(target: Map<number, number>, source: ReadonlyMap<number, number>): void {
    for (const [key, value] of source) {
      target.set(key, (target.get(key) ?? 0) + value);
    }
  }

  private minNullable(current: number | null, value: number | null): number | null {
    if (value === null) {
      return current;
    }

    return current === null ? value : Math.min(current, value);
  }

  private maxNullable(current: number | null, value: number | null): number | null {
    if (value === null) {
      return current;
    }

    return current === null ? value : Math.max(current, value);
  }

  private mergeTerrainLodAnchorSource(
    current: TerrainLodRuntimeDiagnostics["anchorSource"],
    next: TerrainLodAnchor["source"] | null
  ): TerrainLodRuntimeDiagnostics["anchorSource"] {
    if (next === null) {
      return current;
    }

    if (current === null || current === next) {
      return next;
    }

    return "mixed";
  }

  private mergeTerrainLodDebugMode(
    current: TerrainLodRuntimeDiagnostics["debugMode"] | null,
    next: TerrainQuadtreeLodDebugMode
  ): TerrainLodRuntimeDiagnostics["debugMode"] {
    if (current === null) {
      return next;
    }

    if (current === next) {
      return next;
    }

    return "mixed";
  }

  private mergeTerrainCanonicalMeshMode(
    current: TerrainLodRuntimeDiagnostics["canonicalMeshMode"] | null,
    next: TerrainCanonicalMeshMode
  ): TerrainLodRuntimeDiagnostics["canonicalMeshMode"] {
    if (current === null || current === next) {
      return next;
    }

    return "mixed";
  }

  /**
   * Disposes previously loaded district scene resources.
   */
  private disposeActiveDistrictScenes(): void {
    for (const content of this.activeDistrictScenes.values()) {
      this.disposeLoadedDistrictScene(content);
    }

    this.activeDistrictScenes.clear();
    this.activeLightingDescriptor = null;
  }

  private disposeLoadedDistrictScene(content: LoadedDistrictSceneContent): void {
    for (const controller of content.terrainLodControllers) {
      controller.dispose();
    }

    for (const animationGroup of content.animationGroups) {
      animationGroup.dispose();
    }

    for (const particleSystem of content.particleSystems) {
      particleSystem.dispose();
    }

    for (const skeleton of content.skeletons) {
      skeleton.dispose();
    }

    if (!content.root.isDisposed()) {
      content.root.dispose(false);
    }

    for (const transformNode of content.transformNodes) {
      if (!transformNode.isDisposed()) {
        transformNode.dispose(false);
      }
    }

    for (const mesh of content.meshes) {
      if (!mesh.isDisposed()) {
        mesh.dispose(false, true);
      }
    }
  }

  private async importDistrictSceneChunk(
    scene: BabylonScene,
    districtModelData: DistrictModelData,
    sceneData: DistrictSceneData
  ): Promise<LoadedDistrictSceneContent> {
    const root = new TransformNode(`district-scene-root:${sceneData.id}`, scene);
    root.position.x = sceneData.coord[0] * districtModelData.chunkSize.x;
    root.position.z = sceneData.coord[1] * districtModelData.chunkSize.z;

    const importedContent = await importSceneContent({
      scene,
      sceneId: sceneData.id,
      root,
      rootNamePrefix: "district",
      descriptorPath: sceneData.scene,
      generatedTerrainLodEnabled: true
    });
    for (const controller of importedContent.terrainLodControllers) {
      controller.setDebugEnabled(this.terrainLodDebugEnabled);
      controller.setPolygonWireDebugEnabled(this.terrainPolygonWireDebugEnabled);
      if (this.terrainLodRuntimeTuning) {
        controller.setRuntimeLodTuning(this.terrainLodRuntimeTuning);
      }
    }

    return {
      sceneId: sceneData.id,
      coord: sceneData.coord,
      root,
      meshes: [...importedContent.meshes],
      renderableMeshes: [...importedContent.renderableMeshes],
      terrainMeshes: [...importedContent.terrainMeshes],
      terrainLodControllers: [...importedContent.terrainLodControllers],
      sceneObjectMeshes: importedContent.sceneObjects.flatMap((object) => object.renderableMeshes),
      transformNodes: [...importedContent.transformNodes],
      skeletons: [...importedContent.skeletons],
      animationGroups: [...importedContent.animationGroups],
      particleSystems: [...importedContent.particleSystems],
      descriptorPath: importedContent.summary.descriptorPath,
      terrainModelPath:
        importedContent.terrainDescriptor?.kind === "model" ? importedContent.terrainDescriptor.model : undefined,
      lightingDescriptor: importedContent.lightingDescriptor,
      objectCount: importedContent.summary.objectCount
    };
  }

  private createShadowMeshBatches(content: LoadedDistrictSceneContent): readonly ShadowMeshBatch[] {
    const coordKey = this.createCoordKey(content.coord);
    const batches: ShadowMeshBatch[] = [];

    if (content.terrainMeshes.length > 0) {
      batches.push({
        ownerId: `district:${coordKey}:terrain`,
        source: "terrain",
        meshes: content.terrainMeshes
      });
    }

    if (content.sceneObjectMeshes.length > 0) {
      batches.push({
        ownerId: `district:${coordKey}:sceneObjects`,
        source: "sceneObject",
        meshes: content.sceneObjectMeshes
      });
    }

    return batches;
  }

  private normalizeTerrainLodRuntimeTuning(tuning: TerrainQuadtreeLodRuntimeTuning): TerrainQuadtreeLodRuntimeTuning {
    const lod0Distance = Math.max(0.0001, tuning.lod0Distance);
    const lod1Distance = Math.max(lod0Distance + 0.0001, tuning.lod1Distance);
    return {
      lod0Distance,
      lod1Distance
    };
  }
}

function isTerrainVisualOnlyMesh(mesh: AbstractMesh): boolean {
  return (mesh.metadata as { terrainVisualOnly?: unknown } | null | undefined)?.terrainVisualOnly === true;
}
