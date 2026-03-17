import { Engine, Scene as BabylonScene } from "@babylonjs/core";
import { LangManager } from "../lang/LangManager";
import { EntityManager } from "../entity/EntityManager";
import { InGameScene } from "../scene/in-game/InGameScene";
import { MovementSystem } from "../entity/systems/MovementSystem";
import { RenderSyncSystem } from "../entity/systems/RenderSyncSystem";
import { CharacterSpawnerSystem } from "../entity/systems/CharacterSpawnerSystem";
import { LocalPlayerSystem } from "../entity/systems/LocalPlayerSystem";
import type { System } from "../entity/System";
import { MainMenuScene } from "../scene/main-menu/MainMenuScene";
import type { Scene } from "../scene/Scene";
import { GameState } from "./GameState";

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

  /** Ordered ECS systems executed each runtime tick. */
  private systems: System[];

  /** ECS system that spawns character models in the active scene. */
  private readonly characterSpawnerSystem: CharacterSpawnerSystem;

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
    this.characterSpawnerSystem = new CharacterSpawnerSystem(this.entityManager);
    this.systems = [];
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
    this.entityManager.clearEntities();

    this.currentSceneController = this.buildSceneController(state);
    this.currentBabylonScene = await this.currentSceneController.createScene();
    this.characterSpawnerSystem.setScene(this.currentBabylonScene);
    this.systems = this.buildSystemsForState(state);
  }


  /**
   * Builds ordered ECS systems for the active game state.
   *
   * @param state - Active state.
   * @returns Runtime systems list for the state.
   */
  private buildSystemsForState(state: GameState): System[] {
    if (state !== GameState.IN_GAME) {
      return [];
    }

    return [
      this.characterSpawnerSystem,
      new MovementSystem(this.entityManager),
      new LocalPlayerSystem(this.entityManager, () => this.currentBabylonScene),
      new RenderSyncSystem(this.entityManager),
    ];
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
