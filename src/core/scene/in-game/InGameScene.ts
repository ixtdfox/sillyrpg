import { Color4, Engine, Scene as BabylonScene } from "@babylonjs/core";
import type { LangManager } from "../../lang/LangManager";
import type { Scene } from "../Scene";
import { LocationManager } from "../../world/location/LocationManager";

/**
 * Implements the in-game scene that loads a default world location district.
 */
export class InGameScene implements Scene {
  /** Babylon engine used to create the scene. */
  private readonly engine: Engine;

  /** Shared language manager used by location runtime entities. */
  private readonly langManager: LangManager;

  /** Location manager responsible for world data and district setup. */
  private readonly locationManager: LocationManager;

  /**
   * Creates a new in-game scene controller.
   *
   * @param engine - Babylon engine instance.
   * @param langManager - Shared localization manager.
   */
  public constructor(engine: Engine, langManager: LangManager) {
    this.engine = engine;
    this.langManager = langManager;
    this.locationManager = new LocationManager(this.langManager);
  }

  /**
   * Creates gameplay Babylon scene and loads the default district model.
   *
   * @returns Promise resolving with initialized Babylon scene.
   */
  public async createScene(): Promise<BabylonScene> {
    const scene = new BabylonScene(this.engine);
    scene.clearColor = new Color4(0.04, 0.06, 0.1, 1.0);

    await this.locationManager.loadLocations();
    const defaultLocation = this.locationManager.createDefaultLocation();
    const [defaultDistrict] = defaultLocation.getDistricts();

    if (!defaultDistrict) {
      throw new Error("Default location has no districts.");
    }

    await this.locationManager.createDistrictScene(scene, defaultDistrict);
    return scene;
  }

  /**
   * Processes in-game command inputs.
   *
   * @param input - Command string.
   */
  public processInput(input: string): void {
    console.log(`In-game input received: ${input}`);
  }
}
