import { Engine } from "@babylonjs/core";
import { GameManager } from "../core/game/GameManager";
import { GameState } from "../core/game/GameState";
import { LangManager } from "../core/lang/LangManager";
import { EditorScene } from "../editor";
import { EdisonScene } from "../edison";
import { GameLoadingOverlay } from "./GameLoadingOverlay";

/**
 * Bootstraps Babylon runtime for SillyRPG.
 * This class owns engine setup, canvas wiring, render loop, and resize handling,
 * while delegating scene flow to GameManager.
 */
export class App {
  /** Canvas element used by Babylon engine. */
  private readonly canvas: HTMLCanvasElement;

  /** Babylon rendering engine instance. */
  private readonly engine: Engine;

  /** Shared language manager for the game session. */
  private readonly langManager: LangManager;

  /** Central game flow manager. */
  private readonly gameManager: GameManager;

  /** DOM overlay kept alive while Babylon scenes are replaced. */
  private readonly loadingOverlay: GameLoadingOverlay;

  /**
   * Creates the application bootstrapper.
   *
   * @param canvasId - DOM id of the canvas element to bind Babylon to.
   */
  public constructor(canvasId: string) {
    const element = document.getElementById(canvasId);
    if (!(element instanceof HTMLCanvasElement)) {
      throw new Error(`Canvas with id '${canvasId}' was not found.`);
    }

    this.canvas = element;
    this.engine = new Engine(this.canvas, true);
    this.langManager = new LangManager();
    this.loadingOverlay = new GameLoadingOverlay(document.body);
    this.gameManager = new GameManager(this.engine, this.canvas, this.langManager, {
      [GameState.EDITOR]: ({ engine, canvas, langManager, requestStateChange }) =>
        new EditorScene(engine, canvas, langManager, () => requestStateChange(GameState.MAIN_MENU)),
      [GameState.EDISON]: ({ engine, canvas, langManager, requestStateChange }) =>
        new EdisonScene(engine, canvas, langManager, () => requestStateChange(GameState.MAIN_MENU))
    }, this.loadingOverlay);
  }

  /**
   * Starts game initialization and begins the Babylon render loop.
   *
   * @returns Promise that resolves when initial scene flow is started.
   */
  public async run(): Promise<void> {
    await this.gameManager.start();

    this.engine.runRenderLoop(() => {
      const deltaSeconds = this.engine.getDeltaTime() / 1000;
      this.gameManager.update(deltaSeconds);
      this.gameManager.getCurrentScene()?.render();
    });

    window.addEventListener("resize", () => {
      this.engine.resize();
    });
  }
}
