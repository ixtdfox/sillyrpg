import { Color4, Engine, Scene as BabylonScene } from "@babylonjs/core";
import { CharacterFactory } from "../../character/CharacterFactory";
import { CharacterManager } from "../../character/CharacterManager";
import type { EntityManager } from "../../entity/EntityManager";
import { Entity } from "../../entity/Entity";
import { HexGridRuntime } from "../../hex/HexGridRuntime";
import type { LangManager } from "../../lang/LangManager";
import { LocationManager } from "../../world/location/LocationManager";
import { InGameTopPanelUi } from "./ui/InGameTopPanelUi";
import { attachInGameSceneRuntimeContext } from "./InGameSceneRuntimeContext";
import type { Scene } from "../Scene";

/**
 * Implements the in-game scene that loads a default world location district.
 */
export class InGameScene implements Scene {
  /** Babylon engine used to create the scene. */
  private readonly engine: Engine;

  /** Shared language manager used by location runtime entities. */
  private readonly langManager: LangManager;

  /** Shared entity manager for runtime-created entities. */
  private readonly entityManager: EntityManager;

  /** Location manager responsible for world data and district setup. */
  private readonly locationManager: LocationManager;

  /** Character factory used to create runtime characters. */
  private readonly characterFactory: CharacterFactory;

  /**
   * Creates a new in-game scene controller.
   *
   * @param engine - Babylon engine instance.
   * @param langManager - Shared localization manager.
   * @param entityManager - Shared ECS entity registry.
   */
  public constructor(engine: Engine, langManager: LangManager, entityManager: EntityManager) {
    this.engine = engine;
    this.langManager = langManager;
    this.entityManager = entityManager;
    this.locationManager = new LocationManager(this.langManager);
    this.characterFactory = new CharacterFactory(new CharacterManager());
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

    const playerCharacter = await this.characterFactory.createPlayer();
    const golemCharacter = await this.characterFactory.createGolem();

    if (playerCharacter instanceof Entity) {
      this.entityManager.addEntity(playerCharacter);
    }

    if (golemCharacter instanceof Entity) {
      this.entityManager.addEntity(golemCharacter);
    }

    const hexGridRuntime = new HexGridRuntime(scene);
    attachInGameSceneRuntimeContext(scene, { hexGridRuntime });

    const inGameTopPanelUi = new InGameTopPanelUi(scene, () => {
      const isEnabled = hexGridRuntime.toggleDebug();
      inGameTopPanelUi.setHexGridDebugEnabled(isEnabled);
    });
    inGameTopPanelUi.setHexGridDebugEnabled(hexGridRuntime.getIsDebugEnabled());

    scene.onDisposeObservable.addOnce(() => {
      hexGridRuntime.dispose();
      inGameTopPanelUi.dispose();
    });

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
