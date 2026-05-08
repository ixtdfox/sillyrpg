import { Color4, Engine, Scene as BabylonScene, Vector3 } from "@babylonjs/core";
import { CharacterFactory } from "../../character/CharacterFactory";
import type { EntityManager } from "../../entity/EntityManager";
import { EntityPrefabFactory } from "../../entity/EntityPrefabFactory";
import type { Entity } from "../../entity/Entity";
import { GridPathMovementComponent } from "../../entity/components/GridPathMovementComponent";
import { GroundAttachmentComponent } from "../../entity/components/GroundAttachmentComponent";
import { GridPositionComponent } from "../../entity/components/GridPositionComponent";
import { LocalPlayerComponent } from "../../entity/components/LocalPlayerComponent";
import { RenderableComponent } from "../../entity/components/RenderableComponent";
import { TransformComponent } from "../../entity/components/TransformComponent";
import { Relations } from "../../entity/components/Relations";
import { RelationsComponent } from "../../entity/components/RelationsComponent";
import { RectGridRuntime } from "../../grid/RectGridRuntime";
import type { LangManager } from "../../lang/LangManager";
import { LocationManager } from "../../world/location/LocationManager";
import { DistrictSceneStreamingController } from "../../world/location/district/DistrictSceneStreamingController";
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

    const gridRuntime = new RectGridRuntime(scene, undefined, this.locationManager.getActiveDistrictMeshes());
    const locationTriggerSystem = new LocationTriggerSystem(
      scene,
      this.entityManager,
      this.locationManager,
      async (spawnPosition, localPlayer) => {
        this.cleanupLocationEntities(localPlayer);
        this.resetPlayerAfterLocationTransition(localPlayer, spawnPosition);
        this.tryRebuildRectGridRuntime(gridRuntime, scene);
        this.refreshPlayerGridPosition(localPlayer, gridRuntime);
      }
    );
    locationTriggerSystem.initialize();
    const streamingController = new DistrictSceneStreamingController(
      scene,
      this.entityManager,
      this.locationManager,
      defaultDistrict,
      () => {
        this.tryRebuildRectGridRuntime(gridRuntime, scene);
        const localPlayer = this.resolveLocalPlayer();
        if (localPlayer) {
          this.refreshPlayerGridPosition(localPlayer, gridRuntime, false);
        }
        locationTriggerSystem.refresh();
      }
    );
    const inGameTopPanelUi = new InGameTopPanelUi(scene, () => {
      const isEnabled = gridRuntime.toggleDebug();
      inGameTopPanelUi.setRectGridDebugEnabled(isEnabled);
    });
    attachInGameSceneRuntimeContext(scene, {
      gridRuntime,
      locationManager: this.locationManager,
      topPanelUi: inGameTopPanelUi,
      terrainSurfaceRegistry: gridRuntime.getTerrainSurfaceRegistry(),
      surfaceHeightResolver: gridRuntime.getSurfaceHeightResolver()
    });
    inGameTopPanelUi.setRectGridDebugEnabled(gridRuntime.getIsDebugEnabled());
    const triggerObserver = scene.onBeforeRenderObservable.add(() => {
      streamingController.update();
      locationTriggerSystem.update();
    });

    scene.onDisposeObservable.addOnce(() => {
      gridRuntime.dispose();
      inGameTopPanelUi.dispose();
      streamingController.dispose();
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

    const pathMovement = localPlayer.tryGetComponent(GridPathMovementComponent);
    pathMovement?.resetPathState();

    const gridPosition = localPlayer.tryGetComponent(GridPositionComponent);
    if (gridPosition) {
      gridPosition.targetCell = null;
      gridPosition.targetStoryIndex = null;
      gridPosition.currentStoryIndex = 0;
    }
  }

  private refreshPlayerGridPosition(localPlayer: Entity, gridRuntime: RectGridRuntime, alignToCell = true): void {
    const gridPosition = localPlayer.tryGetComponent(GridPositionComponent);
    const transform = localPlayer.getComponent(TransformComponent);

    if (!gridPosition) {
      return;
    }

    const grid = gridRuntime.getGrid();
    const cell = grid.worldToCell(transform.value);
    if (!grid.contains(cell)) {
      gridPosition.targetCell = null;
      gridPosition.targetStoryIndex = null;
      return;
    }

    gridPosition.currentCell = cell;
    gridPosition.currentStoryIndex = 0;
    gridPosition.targetCell = null;
    gridPosition.targetStoryIndex = null;
    if (alignToCell) {
      const groundAttachment = localPlayer.tryGetComponent(GroundAttachmentComponent);
      const basePosition = grid.cellToWorld(cell, transform.value.y);
      transform.value.copyFrom(gridRuntime.getSurfaceHeightResolver().resolveGroundedPosition({
        position: basePosition,
        cell,
        storyIndex: gridPosition.currentStoryIndex,
        fallbackY: transform.value.y,
        footOffset: groundAttachment?.footOffset ?? 0
      }));
    }

    const renderable = localPlayer.tryGetComponent(RenderableComponent);
    if (renderable && alignToCell) {
      renderable.binding.position.copyFrom(transform.value);
    }
  }

  private tryRebuildRectGridRuntime(gridRuntime: RectGridRuntime, scene: BabylonScene): void {
    const activeDistrictMeshes = this.locationManager.getActiveDistrictMeshes();

    try {
      gridRuntime.rebuild(scene, activeDistrictMeshes);
    } catch (error) {
      const candidateNames = activeDistrictMeshes.map((mesh) => `${mesh.name}(${mesh.id})`).join(", ");
      console.error(
        `[InGameScene] Failed to rebuild RectGridRuntime after transition. activeDistrictMeshCount=${activeDistrictMeshes.length} candidates=[${candidateNames}]`,
        error
      );
    }
  }

  private resolveLocalPlayer(): Entity | null {
    const candidates = this.entityManager.query(LocalPlayerComponent, TransformComponent);
    return candidates[0] ?? null;
  }
}
