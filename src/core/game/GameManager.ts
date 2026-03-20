import { Engine, Scene as BabylonScene } from "@babylonjs/core";
import { LangManager } from "../lang/LangManager";
import { EntityManager } from "../entity/EntityManager";
import { InGameScene } from "../scene/in-game/InGameScene";
import { MovementSystem } from "../entity/systems/MovementSystem";
import { RenderSyncSystem } from "../entity/systems/RenderSyncSystem";
import { CharacterSpawnerSystem } from "../entity/systems/CharacterSpawnerSystem";
import { LocalPlayerSystem } from "../entity/systems/LocalPlayerSystem";
import { LocalPlayerInputSystem } from "../entity/systems/LocalPlayerInputSystem";
import { AnimationSystem } from "../entity/systems/AnimationSystem";
import { HexSpatialIndexSystem } from "../entity/systems/hex/HexSpatialIndexSystem";
import { VisionDetectionSystem } from "../entity/systems/VisionDetectionSystem";
import { PatrolSystem } from "../entity/systems/PatrolSystem";
import { PerceptionDebugOverlaySystem } from "../entity/systems/PerceptionDebugOverlaySystem";
import { HexSpatialIndex } from "../entity/systems/hex/HexSpatialIndex";
import { WorldModeController } from "./WorldModeController";
import { TurnBasedCombatState } from "./TurnBasedCombatState";
import { HexMovementCostResolver } from "../entity/systems/hex/HexMovementCostResolver";
import { CombatParticipantResolver } from "../entity/systems/combat/CombatParticipantResolver";
import { CombatEncounterCoordinator } from "../entity/systems/combat/CombatEncounterCoordinator";
import { TurnBasedCombatSystem } from "../entity/systems/TurnBasedCombatSystem";
import { HoveredCombatTargetSystem } from "../entity/systems/combat/HoveredCombatTargetSystem";
import { CombatHudSystem } from "../entity/systems/combat/CombatHudSystem";
import { CombatBannerSystem } from "../entity/systems/combat/CombatBannerSystem";
import type { System } from "../entity/System";
import { MainMenuScene } from "../scene/main-menu/MainMenuScene";
import type { Scene } from "../scene/Scene";
import { GameState } from "./GameState";
import { WorldMode } from "./WorldMode";
import { CombatInputController } from "./CombatInputController";
import { CombatAttackTargetingService } from "../entity/systems/combat/CombatAttackTargetingService";
import { BasicCombatAiService } from "../entity/systems/combat/BasicCombatAiService";
import { CombatMovementPreviewSystem } from "../entity/systems/combat/CombatMovementPreviewSystem";
import { CombatHoverHighlightSystem } from "../entity/systems/combat/CombatHoverHighlightSystem";

/**
 * Owns game flow state and active scene lifecycle.
 * It creates scenes based on the current state and exposes the rendered scene
 * to the application bootstrap for the render loop.
 */
export class GameManager {
  /** Babylon engine used by scenes. */
  private readonly engine: Engine;

  /** Canvas element used by scenes and input systems. */
  private readonly canvas: HTMLCanvasElement;

  /** Shared localization service. */
  private readonly langManager: LangManager;

  /** Shared ECS entity registry for runtime-created entities. */
  private readonly entityManager: EntityManager;
  /** Shared world mode state for runtime and turn-based combat. */
  private readonly worldModeController: WorldModeController;
  /** Shared active turn-based encounter state. */
  private readonly turnBasedCombatState: TurnBasedCombatState;
  /** Shared player input mode state for turn-based combat. */
  private readonly combatInputController: CombatInputController;

  /** Ordered ECS systems executed each runtime tick. */
  private readonly systems: readonly System[];

  /** ECS system that spawns character models in the active scene. */
  private readonly characterSpawnerSystem: CharacterSpawnerSystem;

  /** ECS system that keeps camera focused on local player. */
  private readonly localPlayerSystem: LocalPlayerSystem;
  /** ECS system that writes local-player movement intent from clicks. */
  private readonly localPlayerInputSystem: LocalPlayerInputSystem;
  /** ECS system that advances path-based movement. */
  private readonly movementSystem: MovementSystem;

  /** ECS system that keeps the hex-cell broad-phase spatial index in sync. */
  private readonly hexSpatialIndexSystem: HexSpatialIndexSystem;

  /** ECS system that assigns local patrol destinations to idle AI entities. */
  private readonly patrolSystem: PatrolSystem;

  /** ECS system that performs hostile vision detection. */
  private readonly visionDetectionSystem: VisionDetectionSystem;

  /** ECS system that pushes perception debug data into the hex overlay. */
  private readonly perceptionDebugOverlaySystem: PerceptionDebugOverlaySystem;
  /** ECS system that drives turn sequencing and encounter ending. */
  private readonly turnBasedCombatSystem: TurnBasedCombatSystem;
  /** Shared AI turn service used by turn-based combat system. */
  private readonly basicCombatAiService: BasicCombatAiService;
  /** ECS system that renders reachable move area and hovered move path in combat. */
  private readonly combatMovementPreviewSystem: CombatMovementPreviewSystem;
  /** ECS system that resolves hovered hostile target for HUD. */
  private readonly hoveredCombatTargetSystem: HoveredCombatTargetSystem;
  /** ECS system that highlights currently hovered hostile combat target. */
  private readonly combatHoverHighlightSystem: CombatHoverHighlightSystem;
  /** ECS system that renders combat HUD cards and actions. */
  private readonly combatHudSystem: CombatHudSystem;
  /** ECS system that reflects combat mode state in top panel banner. */
  private readonly combatBannerSystem: CombatBannerSystem;

  /** Current finite game state. */
  private currentState: GameState;

  /** Active scene object implementing scene behavior contract. */
  private currentSceneController: Scene | null;

  /** Active Babylon scene rendered each frame. */
  private currentBabylonScene: BabylonScene | null;

  /**
   * Creates a new game manager with explicit runtime dependencies.
   *
   * @param engine - Babylon rendering engine.
   * @param canvas - HTML canvas attached to Babylon.
   * @param langManager - Shared language service.
   */
  public constructor(engine: Engine, canvas: HTMLCanvasElement, langManager: LangManager) {
    this.engine = engine;
    this.canvas = canvas;
    this.langManager = langManager;
    this.entityManager = new EntityManager();
    this.worldModeController = new WorldModeController(WorldMode.RUNTIME);
    this.turnBasedCombatState = new TurnBasedCombatState(this.worldModeController);
    this.combatInputController = new CombatInputController();
    const movementCostResolver = new HexMovementCostResolver();
    this.characterSpawnerSystem = new CharacterSpawnerSystem(this.entityManager);
    this.localPlayerSystem = new LocalPlayerSystem(this.entityManager);
    const hexSpatialIndex = new HexSpatialIndex();
    const attackTargetingService = new CombatAttackTargetingService(this.entityManager);
    this.basicCombatAiService = new BasicCombatAiService(
      this.entityManager,
      attackTargetingService,
      hexSpatialIndex,
      movementCostResolver
    );
    this.localPlayerInputSystem = new LocalPlayerInputSystem(
      this.entityManager,
      this.worldModeController,
      this.turnBasedCombatState,
      this.combatInputController,
      hexSpatialIndex,
      attackTargetingService
    );
    this.movementSystem = new MovementSystem(
      this.entityManager,
      this.worldModeController,
      this.turnBasedCombatState,
      movementCostResolver,
      hexSpatialIndex
    );
    this.patrolSystem = new PatrolSystem(this.entityManager, this.worldModeController);
    this.hexSpatialIndexSystem = new HexSpatialIndexSystem(this.entityManager, hexSpatialIndex);
    const combatParticipantResolver = new CombatParticipantResolver(this.entityManager);
    const combatEncounterCoordinator = new CombatEncounterCoordinator(
      this.worldModeController,
      this.turnBasedCombatState,
      combatParticipantResolver,
      this.entityManager
    );
    this.visionDetectionSystem = new VisionDetectionSystem(this.entityManager, hexSpatialIndex, combatEncounterCoordinator);
    this.perceptionDebugOverlaySystem = new PerceptionDebugOverlaySystem(this.entityManager, this.worldModeController);
    this.turnBasedCombatSystem = new TurnBasedCombatSystem(
      this.entityManager,
      this.worldModeController,
      this.turnBasedCombatState,
      this.combatInputController,
      this.basicCombatAiService
    );
    this.combatMovementPreviewSystem = new CombatMovementPreviewSystem(
      this.entityManager,
      this.worldModeController,
      this.turnBasedCombatState,
      this.combatInputController,
      hexSpatialIndex,
      movementCostResolver
    );
    this.hoveredCombatTargetSystem = new HoveredCombatTargetSystem(
      this.entityManager,
      hexSpatialIndex,
      this.worldModeController,
      this.turnBasedCombatState
    );
    this.combatHoverHighlightSystem = new CombatHoverHighlightSystem(
      this.entityManager,
      this.worldModeController,
      this.turnBasedCombatState
    );
    this.combatHudSystem = new CombatHudSystem(
      this.entityManager,
      this.worldModeController,
      this.turnBasedCombatState,
      this.combatInputController,
      this.turnBasedCombatSystem
    );
    this.combatBannerSystem = new CombatBannerSystem(this.worldModeController);
    this.systems = [
      this.characterSpawnerSystem,
      this.localPlayerInputSystem,
      this.turnBasedCombatSystem,
      this.patrolSystem,
      this.movementSystem,
      this.hexSpatialIndexSystem,
      this.combatMovementPreviewSystem,
      this.hoveredCombatTargetSystem,
      this.combatHoverHighlightSystem,
      this.visionDetectionSystem,
      this.perceptionDebugOverlaySystem,
      this.combatHudSystem,
      this.combatBannerSystem,
      new AnimationSystem(this.entityManager),
      this.localPlayerSystem,
      new RenderSyncSystem(this.entityManager),
    ];
    this.currentState = GameState.MAIN_MENU;
    this.currentSceneController = null;
    this.currentBabylonScene = null;
  }

  /**
   * Starts the game flow by loading the scene for the current state.
   *
   * @returns Promise that resolves when the first scene is created.
   */
  public async start(): Promise<void> {
    await this.loadSceneForState(this.currentState);
  }

  /**
   * Updates runtime ECS systems for the current frame.
   *
   * @param deltaSeconds - Frame delta time in seconds.
   */
  public update(deltaSeconds: number): void {
    for (const system of this.systems) {
      system.update(deltaSeconds);
    }
  }

  /**
   * Returns the currently active Babylon scene.
   *
   * @returns Current Babylon scene or null before initialization.
   */
  public getCurrentScene(): BabylonScene | null {
    return this.currentBabylonScene;
  }

  public getWorldMode(): WorldMode {
    return this.worldModeController.getMode();
  }

  /**
   * Changes game state and loads the corresponding scene.
   *
   * @param state - Next game state to activate.
   * @returns Promise that resolves after scene switch.
   */
  public async setState(state: GameState): Promise<void> {
    this.currentState = state;
    await this.loadSceneForState(state);
  }

  /**
   * Creates and activates the scene that matches the given state.
   *
   * @param state - State used to determine scene type.
   * @returns Promise that resolves when scene creation is complete.
   */
  private async loadSceneForState(state: GameState): Promise<void> {
    this.currentBabylonScene?.dispose();

    this.currentSceneController = this.buildSceneController(state);
    this.currentBabylonScene = await this.currentSceneController.createScene();
    this.turnBasedCombatState.endCombat();
    this.combatInputController.reset();
    this.characterSpawnerSystem.setScene(this.currentBabylonScene);
    this.basicCombatAiService.setScene(this.currentBabylonScene);
    this.localPlayerInputSystem.setScene(this.currentBabylonScene);
    this.movementSystem.setScene(this.currentBabylonScene);
    this.patrolSystem.setScene(this.currentBabylonScene);
    this.visionDetectionSystem.setScene(this.currentBabylonScene);
    this.perceptionDebugOverlaySystem.setScene(this.currentBabylonScene);
    this.hoveredCombatTargetSystem.setScene(this.currentBabylonScene);
    this.combatMovementPreviewSystem.setScene(this.currentBabylonScene);
    this.combatHoverHighlightSystem.setScene(this.currentBabylonScene);
    this.combatHudSystem.setScene(this.currentBabylonScene);
    this.combatBannerSystem.setScene(this.currentBabylonScene);
    this.localPlayerSystem.setScene(this.currentBabylonScene);
  }

  /**
   * Constructs a scene controller for the selected state.
   *
   * @param state - State that requires a scene controller.
   * @returns Scene controller implementation.
   */
  private buildSceneController(state: GameState): Scene {
    switch (state) {
      case GameState.MAIN_MENU:
        return new MainMenuScene(this.engine, this.canvas, this.langManager, (nextState) => {
          void this.setState(nextState);
        });
      case GameState.IN_GAME:
        return new InGameScene(this.engine, this.langManager, this.entityManager);
      case GameState.SETTINGS:
        return new MainMenuScene(this.engine, this.canvas, this.langManager, (nextState) => {
          void this.setState(nextState);
        });
      default:
        return new MainMenuScene(this.engine, this.canvas, this.langManager, (nextState) => {
          void this.setState(nextState);
        });
    }
  }
}
