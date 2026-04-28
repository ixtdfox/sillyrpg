import { Color4, Engine, Scene as BabylonScene, Vector3 } from "@babylonjs/core";
import { CharacterFactory } from "../../character/CharacterFactory";
import type { EntityManager } from "../../entity/EntityManager";
import { EntityPrefabFactory } from "../../entity/EntityPrefabFactory";
import type { Entity } from "../../entity/Entity";
import { HexPathMovementComponent } from "../../entity/components/HexPathMovementComponent";
import { HexPositionComponent } from "../../entity/components/HexPositionComponent";
import { LocalPlayerComponent } from "../../entity/components/LocalPlayerComponent";
import { RenderableComponent } from "../../entity/components/RenderableComponent";
import { TransformComponent } from "../../entity/components/TransformComponent";
import { Relations } from "../../entity/components/Relations";
import { RelationsComponent } from "../../entity/components/RelationsComponent";
import { HexGridRuntime } from "../../hex/HexGridRuntime";
import type { LangManager } from "../../lang/LangManager";
import { LocationManager } from "../../world/location/LocationManager";
import { InGameTopPanelUi } from "./ui/InGameTopPanelUi";
import { attachInGameSceneRuntimeContext } from "./InGameSceneRuntimeContext";
import type { Scene } from "../Scene";
import { LocationTriggerSystem } from "../../game/trigger/LocationTriggerSystem";

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

    const hexGridRuntime = new HexGridRuntime(scene, undefined, this.locationManager.getActiveDistrictMeshes());
    const locationTriggerSystem = new LocationTriggerSystem(
      scene,
      this.entityManager,
      this.locationManager,
      async (spawnPosition, localPlayer) => {
        this.cleanupLocationEntities(localPlayer);
        this.resetPlayerAfterLocationTransition(localPlayer, spawnPosition);
        this.tryRebuildHexGridRuntime(hexGridRuntime, scene);
        this.refreshPlayerHexPosition(localPlayer, hexGridRuntime);
      }
    );
    locationTriggerSystem.initialize();
    const inGameTopPanelUi = new InGameTopPanelUi(scene, () => {
      const isEnabled = hexGridRuntime.toggleDebug();
      inGameTopPanelUi.setHexGridDebugEnabled(isEnabled);
    });
    attachInGameSceneRuntimeContext(scene, { hexGridRuntime, locationManager: this.locationManager, topPanelUi: inGameTopPanelUi });
    inGameTopPanelUi.setHexGridDebugEnabled(hexGridRuntime.getIsDebugEnabled());
    const triggerObserver = scene.onBeforeRenderObservable.add(() => {
      locationTriggerSystem.update();
    });

    scene.onDisposeObservable.addOnce(() => {
      hexGridRuntime.dispose();
      inGameTopPanelUi.dispose();
      locationTriggerSystem.dispose();
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

  private cleanupLocationEntities(localPlayer: Entity): void {
    for (const entity of this.entityManager.getEntities()) {
      if (entity.getId() === localPlayer.getId() || entity.hasComponent(LocalPlayerComponent)) {
        continue;
      }

      const renderable = entity.tryGetComponent(RenderableComponent);
      if (renderable) {
        const disposableBinding = renderable.binding as unknown as { dispose?: () => void };
        disposableBinding.dispose?.();
      }

      this.entityManager.removeEntity(entity.getId());
    }
  }

  private resetPlayerAfterLocationTransition(localPlayer: Entity, spawnPosition: Vector3): void {
    const transform = localPlayer.getComponent(TransformComponent);
    transform.value.copyFrom(spawnPosition);

    const renderable = localPlayer.tryGetComponent(RenderableComponent);
    if (renderable) {
      renderable.binding.position.copyFrom(spawnPosition);
    }

    const pathMovement = localPlayer.tryGetComponent(HexPathMovementComponent);
    pathMovement?.resetPathState();

    const hexPosition = localPlayer.tryGetComponent(HexPositionComponent);
    if (hexPosition) {
      hexPosition.targetCell = null;
    }
  }

  private refreshPlayerHexPosition(localPlayer: Entity, hexGridRuntime: HexGridRuntime): void {
    const hexPosition = localPlayer.tryGetComponent(HexPositionComponent);
    const transform = localPlayer.getComponent(TransformComponent);

    if (!hexPosition) {
      return;
    }

    const grid = hexGridRuntime.getGrid();
    const cell = grid.worldToCell(transform.value);
    if (!grid.contains(cell)) {
      hexPosition.targetCell = null;
      return;
    }

    hexPosition.currentCell = cell;
    hexPosition.targetCell = null;
    transform.value.copyFrom(grid.cellToWorld(cell, transform.value.y));

    const renderable = localPlayer.tryGetComponent(RenderableComponent);
    if (renderable) {
      renderable.binding.position.copyFrom(transform.value);
    }
  }

  private tryRebuildHexGridRuntime(hexGridRuntime: HexGridRuntime, scene: BabylonScene): void {
    const activeDistrictMeshes = this.locationManager.getActiveDistrictMeshes();

    try {
      hexGridRuntime.rebuild(scene, activeDistrictMeshes);
    } catch (error) {
      const candidateNames = activeDistrictMeshes.map((mesh) => `${mesh.name}(${mesh.id})`).join(", ");
      console.error(
        `[InGameScene] Failed to rebuild HexGridRuntime after transition. activeDistrictMeshCount=${activeDistrictMeshes.length} candidates=[${candidateNames}]`,
        error
      );
    }
  }
}
