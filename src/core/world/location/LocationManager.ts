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
import type { LangManager } from "../../lang/LangManager";
import { GameWorld } from "../GameWorld";
import type { World } from "../World";
import { GameLocation } from "./GameLocation";
import type { Location } from "./Location";
import type { LocationDefinition } from "./LocationDefinition";
import type { District } from "./district/District";
import type { DistrictDefinition } from "./district/DistrictDefinition";
import { GameDistrict } from "./district/GameDistrict";

/**
 * Loads and manages world locations and district scene initialization.
 */
export class LocationManager {
  /** Relative JSON path containing location definitions. */
  private static readonly STORE_PATH = "/assets/data/locations/store.json";

  /** Shared language manager used by location and district entities. */
  private readonly langManager: LangManager;

  /** Runtime location list built from JSON definitions. */
  private locations: GameLocation[];

  /** Currently loaded district model resources. */
  private activeDistrictContent: {
    meshes: AbstractMesh[];
    transformNodes: TransformNode[];
    skeletons: Skeleton[];
    animationGroups: AnimationGroup[];
    particleSystems: IParticleSystem[];
  } | null;

  /**
   * Creates a location manager.
   *
   * @param langManager - Shared language manager instance.
   */
  public constructor(langManager: LangManager) {
    this.langManager = langManager;
    this.locations = [];
    this.activeDistrictContent = null;
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
    await this.loadDistrictModel(scene, district.getModelData().model);

    const target = this.resolveGroundCenter(scene);
    const camera = new ArcRotateCamera("in-game-camera", -Math.PI / 4, Math.PI / 3, 30, target, scene);
    camera.lowerRadiusLimit = 5;
    camera.upperRadiusLimit = 120;
    camera.attachControl(true);
    scene.activeCamera = camera;

    const light = new HemisphericLight("in-game-light", new Vector3(0, 1, 0), scene);
    light.intensity = 1;
  }

  /**
   * Replaces currently loaded district content with model from the target path.
   *
   * @param scene - Active Babylon scene.
   * @param modelPath - Relative path to district model file.
   * @returns Center point of the loaded district used as spawn fallback.
   */
  public async transitionToDistrictModel(scene: BabylonScene, modelPath: string): Promise<Vector3> {
    await this.loadDistrictModel(scene, modelPath);
    return this.resolveActiveDistrictCenter();
  }

  /**
   * Returns meshes belonging to currently loaded district model.
   *
   * @returns Active district meshes.
   */
  public getActiveDistrictMeshes(): readonly AbstractMesh[] {
    return this.activeDistrictContent?.meshes ?? [];
  }

  /**
   * Returns active district nodes used for trigger discovery.
   *
   * @returns Active district nodes including meshes and transform nodes.
   */
  public getActiveDistrictNodes(): readonly Node[] {
    if (!this.activeDistrictContent) {
      return [];
    }

    return [...this.activeDistrictContent.meshes, ...this.activeDistrictContent.transformNodes];
  }

  /**
   * Appends district model into the target scene.
   * If GLTF/GLB loader is unavailable, it falls back to a simple generated scene.
   *
   * @param scene - Scene where district content is appended.
   * @param modelPath - Relative path to district model file.
   * @returns Promise resolved when load or fallback generation is done.
   */
  private async loadDistrictModel(scene: BabylonScene, modelPath: string): Promise<void> {
    this.disposeActiveDistrictContent();

    const extension = this.getFileExtension(modelPath);
    const hasLoader = SceneLoader.IsPluginForExtensionAvailable(extension);

    if (!hasLoader) {
      console.warn(`No Babylon loader plugin found for '${extension}'. Creating fallback district geometry.`);
      this.createFallbackDistrictGeometry(scene);
      return;
    }

    const { rootUrl, fileName } = this.resolveModelPath(modelPath);

    try {
      const importResult = await SceneLoader.ImportMeshAsync(undefined, rootUrl, fileName, scene);
      this.activeDistrictContent = {
        meshes: importResult.meshes,
        transformNodes: importResult.transformNodes,
        skeletons: importResult.skeletons,
        animationGroups: importResult.animationGroups,
        particleSystems: importResult.particleSystems
      };
    } catch (error) {
      console.warn(`Unable to load district model '${modelPath}'. Creating fallback district geometry.`, error);
      this.createFallbackDistrictGeometry(scene);
    }
  }

  /**
   * Creates a fallback district geometry to keep in-game scene functional.
   *
   * @param scene - Scene where placeholder meshes are created.
   * @returns No return value.
   */
  private createFallbackDistrictGeometry(scene: BabylonScene): void {
    const ground = MeshBuilder.CreateGround("ground", { width: 40, height: 40 }, scene);
    ground.position = Vector3.Zero();

    const marker = MeshBuilder.CreateBox("district-marker", { size: 2 }, scene);
    marker.position = new Vector3(0, 1, 0);

    this.activeDistrictContent = {
      meshes: [ground, marker],
      transformNodes: [],
      skeletons: [],
      animationGroups: [],
      particleSystems: []
    };
  }

  /**
   * Computes an approximate center point of loaded district geometry.
   *
   * @returns Center world position.
   */
  private resolveActiveDistrictCenter(): Vector3 {
    const districtMeshes = this.activeDistrictContent?.meshes ?? [];
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
   * Disposes previously loaded district resources.
   */
  private disposeActiveDistrictContent(): void {
    if (!this.activeDistrictContent) {
      return;
    }

    for (const animationGroup of this.activeDistrictContent.animationGroups) {
      animationGroup.dispose();
    }

    for (const particleSystem of this.activeDistrictContent.particleSystems) {
      particleSystem.dispose();
    }

    for (const skeleton of this.activeDistrictContent.skeletons) {
      skeleton.dispose();
    }

    for (const transformNode of this.activeDistrictContent.transformNodes) {
      if (!transformNode.isDisposed()) {
        transformNode.dispose();
      }
    }

    for (const mesh of this.activeDistrictContent.meshes) {
      if (!mesh.isDisposed()) {
        mesh.dispose(false, true);
      }
    }

    this.activeDistrictContent = null;
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
    const { id, title, model } = record;

    if (typeof id !== "string" || typeof title !== "string" || typeof model !== "string") {
      throw new Error("District definition contains invalid fields.");
    }

    return { id, title, model };
  }

  /**
   * Resolves model path into root URL and filename parts.
   *
   * @param modelPath - Relative model path.
   * @returns Object containing root URL and file name.
   */
  private resolveModelPath(modelPath: string): { rootUrl: string; fileName: string } {
    const normalizedPath = modelPath.startsWith("/") ? modelPath : `/${modelPath}`;
    const lastSlashIndex = normalizedPath.lastIndexOf("/");

    return {
      rootUrl: normalizedPath.slice(0, lastSlashIndex + 1),
      fileName: normalizedPath.slice(lastSlashIndex + 1)
    };
  }

  /**
   * Resolves camera target from center of mesh named ground.
   *
   * @param scene - Babylon scene containing district meshes.
   * @returns Target vector for camera focus.
   */
  private resolveGroundCenter(scene: BabylonScene): Vector3 {
    const groundMesh = scene.getMeshByName("ground");
    if (!groundMesh) {
      return Vector3.Zero();
    }

    return groundMesh.getBoundingInfo().boundingBox.centerWorld.clone();
  }
}
