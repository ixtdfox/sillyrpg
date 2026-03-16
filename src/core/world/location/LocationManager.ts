import { ArcRotateCamera, HemisphericLight, Scene as BabylonScene, SceneLoader, Vector3 } from "@babylonjs/core";
import { GameWorld } from "../GameWorld";
import type { World } from "../World";
import type { LangManager } from "../../lang/LangManager";
import type { DistrictDefinition } from "./district/DistrictDefinition";
import { GameDistrict } from "./district/GameDistrict";
import type { District } from "./district/District";
import type { Location } from "./Location";
import type { LocationDefinition } from "./LocationDefinition";
import { GameLocation } from "./GameLocation";

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

  /**
   * Creates a location manager.
   *
   * @param langManager - Shared language manager instance.
   */
  public constructor(langManager: LangManager) {
    this.langManager = langManager;
    this.locations = [];
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
    const modelPath = district.getSceneData().model;
    const { rootUrl, fileName } = this.resolveModelPath(modelPath);

    await SceneLoader.AppendAsync(rootUrl, fileName, scene);

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
