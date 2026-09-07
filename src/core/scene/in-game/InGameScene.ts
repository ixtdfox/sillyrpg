import { Engine, KeyboardEventTypes, Scene as BabylonScene, Vector3 } from "@babylonjs/core";
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
import { TerrainLodTuningPanelUi } from "./ui/TerrainLodTuningPanelUi";
import { attachInGameSceneRuntimeContext } from "./InGameSceneRuntimeContext";
import type { Scene } from "../Scene";
import { LocationTriggerSystem } from "../../game/trigger/LocationTriggerSystem";
import { SceneLightingController } from "../../lighting/SceneLightingController";
import { SceneShadowRegistry } from "../../lighting/SceneShadowRegistry";
import type { TerrainLodAnchor } from "../../world/terrain/lod/TerrainQuadtreeLodTypes";
import { RuntimePerformancePanelUi } from "./performance/RuntimePerformancePanelUi";
import { RuntimePerformanceSampler } from "./performance/RuntimePerformanceSampler";
import { mapLoadingProgress, type LoadingProgressReporter } from "../../game/LoadingProgress";

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

  /** Reports real scene construction stages to the app-level loading overlay. */
  private readonly reportLoadingProgress: LoadingProgressReporter | undefined;

  /**
   * Creates a new in-game scene controller.
   *
   * @param engine - Babylon engine instance.
   * @param langManager - Shared localization manager.
   * @param entityManager - Shared ECS entity registry.
   */
  public constructor(
    engine: Engine,
    langManager: LangManager,
    entityManager: EntityManager,
    reportLoadingProgress?: LoadingProgressReporter
  ) {
    this.engine = engine;
    this.langManager = langManager;
    this.entityManager = entityManager;
    this.locationManager = new LocationManager(this.langManager);
    this.characterFactory = new CharacterFactory(new EntityPrefabFactory());
    this.reportLoadingProgress = reportLoadingProgress;
  }

  /**
   * Creates gameplay Babylon scene and loads the default district model.
   *
   * @returns Promise resolving with initialized Babylon scene.
   */
  public async createScene(): Promise<BabylonScene> {
    const scene = new BabylonScene(this.engine);
    const lightingController = new SceneLightingController(scene);
    const shadowRegistry = new SceneShadowRegistry(lightingController);

    this.reportLoadingProgress?.({ progress: 0.07, message: "Loading location index" });
    await this.locationManager.loadLocations();
    this.reportLoadingProgress?.({ progress: 0.12, message: "Selecting starting district" });
    const defaultLocation = this.locationManager.createDefaultLocation();
    const [defaultDistrict] = defaultLocation.getDistricts();

    if (!defaultDistrict) {
      throw new Error("Default location has no districts.");
    }

    const districtScene = await this.locationManager.createDistrictScene(
      scene,
      defaultDistrict,
      mapLoadingProgress(this.reportLoadingProgress, 0.14, 0.82)
    );
    // The initial chunk owns scene-wide lighting for now; streaming chunks do not auto-change it.
    this.reportLoadingProgress?.({ progress: 0.84, message: "Configuring light and shadows" });
    shadowRegistry.setLighting(districtScene.lightingDescriptor);
    shadowRegistry.registerBatches(this.locationManager.getShadowMeshBatches());

    this.reportLoadingProgress?.({ progress: 0.88, message: "Preparing player" });
    const playerCharacter = await this.characterFactory.createPlayer(new Vector3(-8, 0, -8));
    this.reportLoadingProgress?.({ progress: 0.91, message: "Preparing inhabitants" });
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

    this.reportLoadingProgress?.({ progress: 0.94, message: "Building navigation grid" });
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
    let inGameTopPanelUi: InGameTopPanelUi;
    let performancePanel: RuntimePerformancePanelUi | null = null;
    let terrainLodTuningPanel: TerrainLodTuningPanelUi | null = null;
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
        shadowRegistry.registerBatches(this.locationManager.getShadowMeshBatches());
        locationTriggerSystem.refresh();
        const hasTerrainLodControllers = this.locationManager.hasTerrainLodControllers();
        inGameTopPanelUi.setTerrainLodDebugAvailable(hasTerrainLodControllers);
        inGameTopPanelUi.setTerrainPolygonWireDebugAvailable(hasTerrainLodControllers);
        inGameTopPanelUi.setTerrainLodTuningAvailable(hasTerrainLodControllers);
        if (!hasTerrainLodControllers) {
          terrainLodTuningPanel?.setVisible(false);
          inGameTopPanelUi.setTerrainPolygonWireDebugEnabled(false);
          inGameTopPanelUi.setTerrainLodTuningEnabled(false);
        }
        inGameTopPanelUi.setTerrainLodDebugEnabled(this.locationManager.getTerrainLodDebugEnabled());
        inGameTopPanelUi.setTerrainPolygonWireDebugEnabled(this.locationManager.getTerrainPolygonWireDebugEnabled());
      }
    );
    inGameTopPanelUi = new InGameTopPanelUi(scene, () => {
      const isEnabled = gridRuntime.toggleDebug();
      inGameTopPanelUi.setRectGridDebugEnabled(isEnabled);
    }, () => {
      if (!this.locationManager.hasTerrainLodControllers()) {
        console.info("[TerrainLOD] No terrain LOD controller is active for the current runtime scene.");
        return;
      }

      const isEnabled = this.locationManager.toggleTerrainLodDebug();
      inGameTopPanelUi.setTerrainLodDebugEnabled(isEnabled);
    }, () => {
      if (!this.locationManager.hasTerrainLodControllers()) {
        console.info("[TerrainWire] No terrain LOD controller is active for the current runtime scene.");
        return;
      }

      const isEnabled = this.locationManager.toggleTerrainPolygonWireDebug();
      inGameTopPanelUi.setTerrainPolygonWireDebugEnabled(isEnabled);
    }, () => {
      const isEnabled = terrainLodTuningPanel?.toggle() ?? false;
      inGameTopPanelUi.setTerrainLodTuningEnabled(isEnabled);
    }, () => {
      const isEnabled = performancePanel?.toggle() ?? false;
      inGameTopPanelUi.setPerformanceDebugEnabled(isEnabled);
    });
    const performanceSampler = new RuntimePerformanceSampler({
      engine: this.engine,
      scene,
      locationManager: this.locationManager,
      gridRuntime,
      shadowRegistry
    });
    performancePanel = new RuntimePerformancePanelUi(inGameTopPanelUi.getTexture(), performanceSampler);
    this.exposeRuntimePerformanceDebug(
      scene,
      performanceSampler,
      performancePanel,
      this.locationManager,
      shadowRegistry,
    );
    terrainLodTuningPanel = new TerrainLodTuningPanelUi(
      inGameTopPanelUi.getTexture(),
      this.locationManager.getTerrainLodRuntimeTuning(),
      (tuning) => {
        this.locationManager.setTerrainLodRuntimeTuning(tuning);
      }
    );
    attachInGameSceneRuntimeContext(scene, {
      gridRuntime,
      locationManager: this.locationManager,
      topPanelUi: inGameTopPanelUi,
      terrainSurfaceRegistry: gridRuntime.getTerrainSurfaceRegistry(),
      surfaceHeightResolver: gridRuntime.getSurfaceHeightResolver(),
      shadowRegistry
    });
    inGameTopPanelUi.setRectGridDebugEnabled(gridRuntime.getIsDebugEnabled());
    inGameTopPanelUi.setTerrainLodDebugAvailable(this.locationManager.hasTerrainLodControllers());
    inGameTopPanelUi.setTerrainPolygonWireDebugAvailable(this.locationManager.hasTerrainLodControllers());
    inGameTopPanelUi.setTerrainLodTuningAvailable(this.locationManager.hasTerrainLodControllers());
    inGameTopPanelUi.setTerrainLodDebugEnabled(this.locationManager.getTerrainLodDebugEnabled());
    inGameTopPanelUi.setTerrainPolygonWireDebugEnabled(this.locationManager.getTerrainPolygonWireDebugEnabled());
    inGameTopPanelUi.setTerrainLodTuningEnabled(false);
    inGameTopPanelUi.setPerformanceDebugEnabled(false);
    let isPerformanceToggleKeyDown = false;
    const performanceKeyboardObserver = scene.onKeyboardObservable.add((keyboardInfo) => {
      if (keyboardInfo.event.code !== "F3") {
        return;
      }

      keyboardInfo.event.preventDefault();
      if (keyboardInfo.type === KeyboardEventTypes.KEYUP) {
        isPerformanceToggleKeyDown = false;
        return;
      }

      if (keyboardInfo.type !== KeyboardEventTypes.KEYDOWN || isPerformanceToggleKeyDown) {
        return;
      }

      isPerformanceToggleKeyDown = true;
      const isEnabled = performancePanel?.toggle() ?? false;
      inGameTopPanelUi.setPerformanceDebugEnabled(isEnabled);
    });
    const triggerObserver = scene.onBeforeRenderObservable.add(() => {
      const deltaSeconds = scene.getEngine().getDeltaTime() / 1000;
      streamingController.update();
      locationTriggerSystem.update();
      const lodAnchor = this.resolveTerrainLodAnchor(scene);
      if (lodAnchor) {
        this.locationManager.updateTerrainLodControllers(deltaSeconds, lodAnchor);
      }
      performancePanel?.update(deltaSeconds);
    });

    scene.onDisposeObservable.addOnce(() => {
      terrainLodTuningPanel?.dispose();
      performancePanel?.dispose();
      shadowRegistry.dispose();
      lightingController.dispose();
      gridRuntime.dispose();
      inGameTopPanelUi.dispose();
      streamingController.dispose();
      locationTriggerSystem.dispose();
      if (performanceKeyboardObserver) {
        scene.onKeyboardObservable.remove(performanceKeyboardObserver);
      }
      if (triggerObserver) {
        scene.onBeforeRenderObservable.remove(triggerObserver);
      }
    });

    this.reportLoadingProgress?.({ progress: 0.96, message: "Finalizing game scene" });
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

  private resolveTerrainLodAnchor(scene: BabylonScene): TerrainLodAnchor | null {
    const localPlayer = this.resolveLocalPlayer();
    const playerTransform = localPlayer?.tryGetComponent(TransformComponent);
    if (playerTransform) {
      return {
        position: playerTransform.value.clone(),
        source: "player"
      };
    }

    const camera = scene.activeCamera;
    if (!camera) {
      return null;
    }

    return {
      position: camera.globalPosition?.clone() ?? camera.position.clone(),
      source: "camera-fallback"
    };
  }

  private exposeRuntimePerformanceDebug(
    scene: BabylonScene,
    performanceSampler: RuntimePerformanceSampler,
    performancePanel: RuntimePerformancePanelUi,
    locationManager: LocationManager,
    shadowRegistry: SceneShadowRegistry,
  ): void {
    if (!new URLSearchParams(window.location.search).has("runtimePerf")) {
      return;
    }

    const debugGlobal = globalThis as typeof globalThis & {
      __SILLYRPG_RUNTIME_DEBUG__?: {
        scene: BabylonScene;
        engine: Engine;
        performanceSampler: RuntimePerformanceSampler;
        performancePanel: RuntimePerformancePanelUi;
        locationManager: LocationManager;
        shadowRegistry: SceneShadowRegistry;
      };
    };
    const handle = {
      scene,
      engine: this.engine,
      performanceSampler,
      performancePanel,
      locationManager,
      shadowRegistry,
    };
    debugGlobal.__SILLYRPG_RUNTIME_DEBUG__ = handle;
    scene.onDisposeObservable.addOnce(() => {
      if (debugGlobal.__SILLYRPG_RUNTIME_DEBUG__?.scene === scene) {
        delete debugGlobal.__SILLYRPG_RUNTIME_DEBUG__;
      }
    });
  }
}
