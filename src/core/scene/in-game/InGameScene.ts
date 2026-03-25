import { Color4, Engine, Scene as BabylonScene, Vector3 } from "@babylonjs/core";
import { CharacterFactory } from "../../character/CharacterFactory";
import type { EntityManager } from "../../entity/EntityManager";
import { EntityPrefabFactory } from "../../entity/EntityPrefabFactory";
import { Relations } from "../../entity/components/Relations";
import { RelationsComponent } from "../../entity/components/RelationsComponent";
import { HexGridRuntime } from "../../hex/HexGridRuntime";
import type { LangManager } from "../../lang/LangManager";
import { LocationManager } from "../../world/location/LocationManager";
import { InGameTopPanelUi } from "./ui/InGameTopPanelUi";
import { attachInGameSceneRuntimeContext } from "./InGameSceneRuntimeContext";
import type { Scene } from "../Scene";
import { SceneTriggerSystem } from "./trigger/SceneTriggerSystem";

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
    this.characterFactory = new CharacterFactory(new EntityPrefabFactory());
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

    const playerCharacter = await this.characterFactory.createPlayer(new Vector3(-8, 0, -8));
    const golemCharacter = await this.characterFactory.createGolem(new Vector3(8, 0, 8), new Vector3(0, -Math.PI * 0.75, 0));

    this.entityManager.addEntity(playerCharacter);
    this.entityManager.addEntity(golemCharacter);

    const golemRelations = golemCharacter.getComponent(RelationsComponent);
    const hostileToPlayer = new Relations();
    hostileToPlayer.hate = 100;
    golemRelations.relationships[playerCharacter.getId()] = hostileToPlayer;

    const playerRelations = playerCharacter.getComponent(RelationsComponent);
    const hostileToGolem = new Relations();
    hostileToGolem.hate = 100;
    playerRelations.relationships[golemCharacter.getId()] = hostileToGolem;

    const hexGridRuntime = new HexGridRuntime(scene);
    const sceneTriggerSystem = new SceneTriggerSystem(scene, this.entityManager, this.locationManager);
    sceneTriggerSystem.initialize();
    const inGameTopPanelUi = new InGameTopPanelUi(scene, () => {
      const isEnabled = hexGridRuntime.toggleDebug();
      inGameTopPanelUi.setHexGridDebugEnabled(isEnabled);
    });
    attachInGameSceneRuntimeContext(scene, { hexGridRuntime, topPanelUi: inGameTopPanelUi });
    inGameTopPanelUi.setHexGridDebugEnabled(hexGridRuntime.getIsDebugEnabled());
    const triggerObserver = scene.onBeforeRenderObservable.add(() => {
      sceneTriggerSystem.update();
    });

    scene.onDisposeObservable.addOnce(() => {
      hexGridRuntime.dispose();
      inGameTopPanelUi.dispose();
      if (triggerObserver) {
        scene.onBeforeRenderObservable.remove(triggerObserver);
      }
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
