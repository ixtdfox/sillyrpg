import {
  Node,
  AnimationGroup,
  ArcRotateCamera,
  HemisphericLight,
  MeshBuilder,
  Scene as BabylonScene,
  SceneLoader,
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
import { resolveSceneAssetPath } from "../../model/SceneAssetPath";

interface LoadedDistrictSceneContent {
  readonly sceneId: string;
  readonly coord: DistrictSceneCoord;
  readonly root: TransformNode;
  readonly meshes: AbstractMesh[];
  readonly transformNodes: TransformNode[];
  readonly skeletons: Skeleton[];
  readonly animationGroups: AnimationGroup[];
  readonly particleSystems: IParticleSystem[];
}

/**
 * Loads and manages world locations and district scene initialization.
 */
export class LocationManager {
  /** Relative JSON path containing location definitions. */
  private static readonly STORE_PATH = "/assets/data/locations/store.json";
  private static readonly LEGACY_CHUNK_SIZE: DistrictChunkSize = { x: 40, z: 40 };
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
  public async createDistrictScene(scene: BabylonScene, district: District): Promise<void> {
    this.activeDistrict = district;
    this.disposeActiveDistrictScenes();
    await this.loadDistrictSceneChunk(scene, district, district.getInitialScene().coord);

    const target = this.resolveActiveDistrictCenter();
    const camera = new ArcRotateCamera("in-game-camera", -Math.PI / 4, Math.PI / 3, 30, target, scene);
    camera.lowerRadiusLimit = 5;
    camera.upperRadiusLimit = 120;
    camera.attachControl(true);
    scene.activeCamera = camera;

    const light = new HemisphericLight("in-game-light", new Vector3(0, 1, 0), scene);
    light.intensity = 1;
  }

  /**
   * Legacy transition entry-point used by trigger metadata with a direct model path.
   *
   * @param scene - Active Babylon scene.
   * @param modelPath - Relative path to district model file.
   * @returns Center point of the loaded district used as spawn fallback.
   */
  public async transitionToDistrictModel(scene: BabylonScene, modelPath: string): Promise<Vector3> {
    this.activeDistrict = null;
    this.disposeActiveDistrictScenes();
    await this.loadStandaloneDistrictModel(scene, modelPath);
    return this.resolveActiveDistrictCenter();
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

    console.info(`[DistrictStreaming] chunkLoad start coord=${coordKey} model=${sceneData.model}`);
    const content = await this.importDistrictSceneChunk(scene, district.getModelData(), sceneData);
    this.activeDistrictScenes.set(coordKey, content);
    console.info(`[DistrictStreaming] chunkLoad complete coord=${coordKey} meshes=${content.meshes.length}`);
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
    return Array.from(this.activeDistrictScenes.values()).flatMap((content) => content.meshes);
  }

  /**
   * Returns active district nodes used for trigger discovery.
   *
   * @returns Active district nodes including chunk roots, meshes and transform nodes.
   */
  public getActiveDistrictNodes(): readonly Node[] {
    return Array.from(this.activeDistrictScenes.values()).flatMap((content) => [
      content.root,
      ...content.meshes,
      ...content.transformNodes
    ]);
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
   * Legacy single-model districts are upgraded into one-scene definitions at [0, 0].
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
      return {
        id,
        title,
        chunkSize: { ...LocationManager.LEGACY_CHUNK_SIZE },
        streaming: { ...LocationManager.LEGACY_STREAMING },
        scenes: [{ id: `${id}-0-0`, coord: [0, 0], model: legacyModel }]
      };
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
    const model = this.requireString(
      record.model,
      `District '${districtId}' scene '${id}' must have a string model path.`
    );
    const coord = this.parseDistrictSceneCoord(record.coord, districtId, id);
    return { id, coord, model };
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

  /**
   * Disposes previously loaded district scene resources.
   */
  private disposeActiveDistrictScenes(): void {
    for (const content of this.activeDistrictScenes.values()) {
      this.disposeLoadedDistrictScene(content);
    }

    this.activeDistrictScenes.clear();
  }

  private disposeLoadedDistrictScene(content: LoadedDistrictSceneContent): void {
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

  private async loadStandaloneDistrictModel(scene: BabylonScene, modelPath: string): Promise<void> {
    const sceneData: DistrictSceneData = {
      id: "legacy-transition-0-0",
      coord: [0, 0],
      model: modelPath
    };
    const modelData: DistrictModelData = {
      chunkSize: { ...LocationManager.LEGACY_CHUNK_SIZE },
      streaming: { ...LocationManager.LEGACY_STREAMING },
      scenes: [sceneData]
    };
    const content = await this.importDistrictSceneChunk(scene, modelData, sceneData);
    this.activeDistrictScenes.set(this.createCoordKey(sceneData.coord), content);
  }

  private async importDistrictSceneChunk(
    scene: BabylonScene,
    districtModelData: DistrictModelData,
    sceneData: DistrictSceneData
  ): Promise<LoadedDistrictSceneContent> {
    const root = new TransformNode(`district-scene-root:${sceneData.id}`, scene);
    root.position.x = sceneData.coord[0] * districtModelData.chunkSize.x;
    root.position.z = sceneData.coord[1] * districtModelData.chunkSize.z;

    const extension = this.getFileExtension(sceneData.model);
    const hasLoader = SceneLoader.IsPluginForExtensionAvailable(extension);

    if (!hasLoader) {
      console.warn(`No Babylon loader plugin found for '${extension}'. Creating fallback district chunk geometry.`);
      return this.createFallbackDistrictGeometry(scene, sceneData, root);
    }

    const { rootUrl, fileName } = resolveSceneAssetPath(sceneData.model);

    try {
      const importResult = await SceneLoader.ImportMeshAsync(undefined, rootUrl, fileName, scene);

      // Chunks are authored local-to-chunk-origin. We offset the chunk root in world space here,
      // so future Blender exports must avoid baking world-space chunk offsets into the GLB itself.
      for (const transformNode of importResult.transformNodes) {
        if (transformNode === root || transformNode.parent) {
          continue;
        }

        transformNode.setParent(root, true);
      }

      for (const mesh of importResult.meshes) {
        if (mesh.parent) {
          continue;
        }

        mesh.setParent(root, true);
      }

      return {
        sceneId: sceneData.id,
        coord: sceneData.coord,
        root,
        meshes: importResult.meshes,
        transformNodes: importResult.transformNodes,
        skeletons: importResult.skeletons,
        animationGroups: importResult.animationGroups,
        particleSystems: importResult.particleSystems
      };
    } catch (error) {
      console.warn(`Unable to load district model '${sceneData.model}'. Creating fallback district chunk geometry.`, error);
      return this.createFallbackDistrictGeometry(scene, sceneData, root);
    }
  }

  /**
   * Creates a fallback district geometry to keep in-game scene functional.
   *
   * @param scene - Scene where placeholder meshes are created.
   * @param sceneData - District chunk definition.
   * @param root - Chunk root carrying world chunk offset.
   * @returns Loaded content record compatible with imported chunks.
   */
  private createFallbackDistrictGeometry(
    scene: BabylonScene,
    sceneData: DistrictSceneData,
    root: TransformNode
  ): LoadedDistrictSceneContent {
    const ground = MeshBuilder.CreateGround(`ground:${sceneData.id}`, { width: 40, height: 40 }, scene);
    ground.metadata = { ...(ground.metadata as Record<string, unknown> | undefined), isGround: true };
    ground.setParent(root, true);

    const marker = MeshBuilder.CreateBox(`district-marker:${sceneData.id}`, { size: 2 }, scene);
    marker.position = new Vector3(0, 1, 0);
    marker.setParent(root, true);

    return {
      sceneId: sceneData.id,
      coord: sceneData.coord,
      root,
      meshes: [ground, marker],
      transformNodes: [],
      skeletons: [],
      animationGroups: [],
      particleSystems: []
    };
  }

  /**
   * Returns lowercase extension with leading dot from file path.
   *
   * @param filePath - Source file path.
   * @returns Path extension including leading dot.
   */
  private getFileExtension(filePath: string): string {
    const dotIndex = filePath.lastIndexOf(".");
    if (dotIndex === -1) {
      return "";
    }

    return filePath.slice(dotIndex).toLowerCase();
  }

}
